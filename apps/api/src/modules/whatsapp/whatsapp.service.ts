import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(private prisma: PrismaService) {}

  // ── CONFIG ──

  async getConfig(coachId: string) {
    const config = await this.prisma.whatsappConfig.findUnique({ where: { coachId } });
    const baseUrl = process.env.API_URL ?? process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/api/v1`
      : 'https://rrapi-production.up.railway.app/api/v1';

    return {
      connected: config?.isConnected ?? false,
      phone: config?.phone ?? '',
      provider: config?.provider ?? 'zapi',
      instanceId: config?.instanceId ?? '',
      hasToken: !!(config?.apiToken),
      webhookUrl: `${baseUrl}/webhooks/whatsapp/${coachId}`,
      welcomeMessage: config?.welcomeMessage ?? 'Olá {nome}! Sou o assistente do Coach. Acesse: {onboardingLink}',
    };
  }

  async saveConfig(coachId: string, data: {
    provider?: string;
    phone?: string;
    apiToken?: string;
    instanceId?: string;
    welcomeMessage?: string;
  }) {
    const existing = await this.prisma.whatsappConfig.findUnique({ where: { coachId } });

    if (existing) {
      return this.prisma.whatsappConfig.update({
        where: { coachId },
        data: {
          ...(data.provider !== undefined && { provider: data.provider }),
          ...(data.phone !== undefined && { phone: data.phone }),
          ...(data.apiToken !== undefined && data.apiToken && { apiToken: data.apiToken }),
          ...(data.instanceId !== undefined && { instanceId: data.instanceId }),
          ...(data.welcomeMessage !== undefined && { welcomeMessage: data.welcomeMessage }),
        },
      });
    }

    return this.prisma.whatsappConfig.create({
      data: {
        coachId,
        provider: data.provider ?? 'zapi',
        phone: data.phone ?? '',
        apiToken: data.apiToken ?? '',
        instanceId: data.instanceId ?? '',
        welcomeMessage: data.welcomeMessage ?? 'Olá {nome}! Acesse: {onboardingLink}',
      },
    });
  }

  async testConnection(coachId: string): Promise<{ ok: boolean; message: string }> {
    const config = await this.prisma.whatsappConfig.findUnique({ where: { coachId } });
    if (!config || !config.apiToken) {
      return { ok: false, message: 'Configuração incompleta. Salve o token primeiro.' };
    }

    try {
      if (config.provider === 'zapi') {
        const res = await fetch(
          `https://api.z-api.io/instances/${config.instanceId}/token/${config.apiToken}/status`,
          { method: 'GET', headers: { 'Client-Token': config.apiToken } },
        );
        const json = await res.json() as { connected?: boolean; error?: string };
        const connected = res.ok && (json.connected === true);
        await this.prisma.whatsappConfig.update({ where: { coachId }, data: { isConnected: connected } });
        return connected
          ? { ok: true, message: 'WhatsApp conectado com sucesso!' }
          : { ok: false, message: json.error ?? 'WhatsApp não está conectado. Verifique o QR code no painel Z-API.' };
      }

      // For other providers, just mark connected optimistically
      await this.prisma.whatsappConfig.update({ where: { coachId }, data: { isConnected: true } });
      return { ok: true, message: 'Configuração salva. Verifique a conexão no painel do provedor.' };
    } catch (err) {
      this.logger.error('WhatsApp test connection error:', err);
      return { ok: false, message: 'Erro ao testar conexão. Verifique as credenciais.' };
    }
  }

  // ── WEBHOOK — incoming messages ──

  async handleIncomingMessage(coachId: string, payload: Record<string, unknown>) {
    this.logger.log(`WhatsApp webhook received for coach ${coachId}`);

    // Parse Z-API format
    const phone = (payload.phone as string) || (payload.from as string) || '';
    const text = (payload.text as { message?: string })?.message
      ?? (payload.body as string)
      ?? (payload.message as string)
      ?? '';
    const name = (payload.senderName as string) || (payload.pushname as string) || phone;

    if (!phone || !text) {
      this.logger.warn('Incoming WhatsApp message missing phone/text');
      return { ok: true };
    }

    // Get or create conversation
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const conversation = await this.prisma.whatsappConversation.upsert({
      where: { coachId_phone: { coachId, phone: cleanPhone } },
      create: { coachId, phone: cleanPhone, name },
      update: { name, updatedAt: new Date() },
    });

    // Save message
    await this.prisma.whatsappMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'USER',
        type: 'TEXT',
        content: text,
      },
    });

    // Auto-reply: send welcome + onboarding link if first message
    await this.autoReply(coachId, cleanPhone, text, name, conversation.id);

    return { ok: true };
  }

  private async autoReply(
    coachId: string,
    phone: string,
    _text: string,
    name: string,
    conversationId: string,
  ) {
    try {
      const config = await this.prisma.whatsappConfig.findUnique({ where: { coachId } });
      if (!config || !config.apiToken || !config.isConnected) return;

      // Get coach profile for onboarding link
      const coach = await this.prisma.user.findUnique({
        where: { id: coachId },
        include: { coachProfile: { select: { slug: true } } },
      });
      const slug = coach?.coachProfile?.slug ?? coachId;
      const appUrl = process.env.APP_URL ?? 'https://rafinha-running-web.vercel.app';
      const onboardingLink = `${appUrl}/onboarding/${slug}`;

      const message = (config.welcomeMessage || 'Olá {nome}! Acesse: {onboardingLink}')
        .replace('{nome}', name)
        .replace('{coachName}', coach?.name ?? 'Coach')
        .replace('{onboardingLink}', onboardingLink);

      // Send via Z-API
      if (config.provider === 'zapi') {
        await fetch(
          `https://api.z-api.io/instances/${config.instanceId}/token/${config.apiToken}/send-text`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Client-Token': config.apiToken },
            body: JSON.stringify({ phone, message }),
          },
        );
      }

      // Save reply to conversation
      await this.prisma.whatsappMessage.create({
        data: {
          conversationId,
          role: 'ASSISTANT',
          type: 'TEXT',
          content: message,
        },
      });
    } catch (err) {
      this.logger.error('WhatsApp auto-reply error:', err);
    }
  }

  // ── SEND MANUAL MESSAGE ──

  async sendMessage(coachId: string, phone: string, message: string) {
    const config = await this.prisma.whatsappConfig.findUnique({ where: { coachId } });
    if (!config || !config.apiToken) {
      throw new NotFoundException('WhatsApp não configurado');
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');

    if (config.provider === 'zapi') {
      const res = await fetch(
        `https://api.z-api.io/instances/${config.instanceId}/token/${config.apiToken}/send-text`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Client-Token': config.apiToken },
          body: JSON.stringify({ phone: cleanPhone, message }),
        },
      );
      if (!res.ok) throw new Error(`Z-API error: ${res.status}`);
    }

    // Save to conversation
    const conversation = await this.prisma.whatsappConversation.upsert({
      where: { coachId_phone: { coachId, phone: cleanPhone } },
      create: { coachId, phone: cleanPhone },
      update: { updatedAt: new Date() },
    });

    await this.prisma.whatsappMessage.create({
      data: { conversationId: conversation.id, role: 'ASSISTANT', type: 'TEXT', content: message },
    });

    return { ok: true, message: 'Mensagem enviada' };
  }
}
