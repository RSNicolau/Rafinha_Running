import {
  BadRequestException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { decrypt, encrypt } from '../../common/utils/encryption';

/** Limite de mensagens recebidas por coach (janela deslizante de 1 min). */
export const WHATSAPP_WEBHOOK_RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
const MAX_TEXT = 4096;

export function generateWebhookSecret(): string {
  return randomBytes(32).toString('hex');
}

function safeEqual(a: unknown, b: string): boolean {
  if (typeof a !== 'string' || !a || !b) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

const digits = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\D/g, '') : '');

function maskToken(token: string): string {
  if (!token) return '';
  return token.length <= 4 ? '••••' : `••••${token.slice(-4)}`;
}

/** Base pública da API (VPS: APP_URL + /api/v1 via rewrite do Next). */
function publicApiBase(): string {
  const explicit = process.env.API_PUBLIC_URL || process.env.API_BASE_URL;
  if (explicit && explicit.trim()) return explicit.trim().replace(/\/+$/, '');
  const app = (process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:3001').trim().replace(/\/+$/, '');
  return `${app}/api/v1`;
}

export interface SaveWhatsappConfigInput {
  provider?: string;
  phone?: string;
  apiToken?: string;
  instanceId?: string;
  welcomeMessage?: string;
}

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly hits = new Map<string, number[]>();

  constructor(private prisma: PrismaService) {}

  // ── CONFIG ──

  /** Nunca devolve o apiToken — só uma versão mascarada. O segredo do webhook vai embutido na URL do coach. */
  async getConfig(coachId: string) {
    const config = await this.prisma.whatsappConfig.findUnique({ where: { coachId } });
    const base = `${publicApiBase()}/webhooks/whatsapp/${coachId}`;
    const token = config?.apiToken ? decrypt(config.apiToken) : '';

    return {
      connected: config?.isConnected ?? false,
      phone: config?.phone ?? '',
      provider: config?.provider ?? 'zapi',
      instanceId: config?.instanceId ?? '',
      hasToken: !!token,
      apiTokenMasked: maskToken(token),
      hasWebhookSecret: !!config?.webhookSecret,
      webhookUrl: config?.webhookSecret ? `${base}?secret=${config.webhookSecret}` : null,
      webhookSecretHeader: 'x-rr-webhook-secret',
      welcomeMessage: config?.welcomeMessage ?? 'Olá {nome}! Sou o assistente do Coach. Acesse: {onboardingLink}',
    };
  }

  async saveConfig(coachId: string, data: SaveWhatsappConfigInput) {
    const existing = await this.prisma.whatsappConfig.findUnique({ where: { coachId } });
    const webhookSecret = existing?.webhookSecret || generateWebhookSecret();

    if (existing) {
      await this.prisma.whatsappConfig.update({
        where: { coachId },
        data: {
          ...(data.provider !== undefined && { provider: data.provider }),
          ...(data.phone !== undefined && { phone: data.phone }),
          ...(data.apiToken ? { apiToken: encrypt(data.apiToken) } : {}),
          ...(data.instanceId !== undefined && { instanceId: data.instanceId }),
          ...(data.welcomeMessage !== undefined && { welcomeMessage: data.welcomeMessage }),
          ...(!existing.webhookSecret && { webhookSecret }),
        },
      });
    } else {
      await this.prisma.whatsappConfig.create({
        data: {
          coachId,
          provider: data.provider ?? 'zapi',
          phone: data.phone ?? '',
          apiToken: data.apiToken ? encrypt(data.apiToken) : '',
          instanceId: data.instanceId ?? '',
          welcomeMessage: data.welcomeMessage ?? 'Olá {nome}! Acesse: {onboardingLink}',
          webhookSecret,
        },
      });
    }

    return this.getConfig(coachId);
  }

  /** Gera um novo segredo (a URL antiga deixa de funcionar imediatamente). */
  async rotateWebhookSecret(coachId: string) {
    const existing = await this.prisma.whatsappConfig.findUnique({ where: { coachId } });
    if (!existing) throw new NotFoundException('WhatsApp não configurado');
    await this.prisma.whatsappConfig.update({
      where: { coachId },
      data: { webhookSecret: generateWebhookSecret() },
    });
    return this.getConfig(coachId);
  }

  async testConnection(coachId: string): Promise<{ ok: boolean; message: string }> {
    const config = await this.prisma.whatsappConfig.findUnique({ where: { coachId } });
    const token = config?.apiToken ? decrypt(config.apiToken) : '';
    if (!config || !token) {
      return { ok: false, message: 'Configuração incompleta. Salve o token primeiro.' };
    }

    try {
      if (config.provider === 'zapi') {
        const res = await fetch(
          `https://api.z-api.io/instances/${encodeURIComponent(config.instanceId)}/token/${encodeURIComponent(token)}/status`,
          { method: 'GET', headers: { 'Client-Token': token }, signal: AbortSignal.timeout(10000) },
        );
        const json = (await res.json().catch(() => ({}))) as { connected?: boolean; error?: string };
        const connected = res.ok && json.connected === true;
        await this.prisma.whatsappConfig.update({ where: { coachId }, data: { isConnected: connected } });
        return connected
          ? { ok: true, message: 'WhatsApp conectado com sucesso!' }
          : { ok: false, message: 'WhatsApp não está conectado. Verifique o QR code no painel Z-API.' };
      }

      await this.prisma.whatsappConfig.update({ where: { coachId }, data: { isConnected: true } });
      return { ok: true, message: 'Configuração salva. Verifique a conexão no painel do provedor.' };
    } catch (err) {
      this.logger.error('WhatsApp test connection error:', err);
      return { ok: false, message: 'Erro ao testar conexão. Verifique as credenciais.' };
    }
  }

  // ── WEBHOOK — incoming messages ──

  /** true se o coach ainda tem cota na janela de 1 minuto. */
  private allow(coachId: string): boolean {
    const now = Date.now();
    const recent = (this.hits.get(coachId) || []).filter((t) => now - t < RATE_WINDOW_MS);
    if (recent.length >= WHATSAPP_WEBHOOK_RATE_LIMIT) {
      this.hits.set(coachId, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(coachId, recent);
    if (this.hits.size > 10_000) this.hits.clear();
    return true;
  }

  /**
   * Webhook público por coach. Fail-closed: exige WhatsappConfig.webhookSecret e que algum dos segredos
   * apresentados (header x-rr-webhook-secret, ?secret= ou Client-Token) confira em tempo constante.
   */
  async handleIncomingMessage(coachId: string, payload: Record<string, unknown>, presentedSecrets: unknown[] = []) {
    if (typeof coachId !== 'string' || coachId.length > 64) throw new UnauthorizedException('Webhook não autorizado');

    const config = await this.prisma.whatsappConfig.findUnique({ where: { coachId } });
    const secret = config?.webhookSecret || '';
    if (!config || !secret || !presentedSecrets.some((s) => safeEqual(s, secret))) {
      throw new UnauthorizedException('Webhook não autorizado');
    }

    if (!this.allow(coachId)) {
      throw new HttpException('Muitas mensagens — tente novamente em instantes', HttpStatus.TOO_MANY_REQUESTS);
    }

    if (!payload || typeof payload !== 'object') return { ok: true, ignored: 'invalid' };

    // Z-API: só mensagens recebidas (ReceivedCallback); ignora status, grupos e mensagens do próprio número.
    if (payload.type !== undefined && payload.type !== 'ReceivedCallback') return { ok: true, ignored: 'not_message' };
    if (payload.fromMe === true || payload.fromMe === 'true') return { ok: true, ignored: 'from_me' };
    if (payload.isGroup === true || payload.isNewsletter === true) return { ok: true, ignored: 'group' };

    const phone = digits(payload.phone) || digits(payload.from);
    const rawText = (payload.text as { message?: unknown } | undefined)?.message ?? payload.body ?? payload.message;
    const text = typeof rawText === 'string' ? rawText.slice(0, MAX_TEXT) : '';
    const rawName = payload.senderName ?? payload.pushname;
    const name = (typeof rawName === 'string' && rawName.trim() ? rawName.trim() : phone).slice(0, 100);

    if (!phone || phone.length < 8 || phone.length > 15 || !text) {
      return { ok: true, ignored: 'missing_fields' };
    }
    const ownPhone = digits(config.phone);
    if (ownPhone && (phone === ownPhone || phone.endsWith(ownPhone) || ownPhone.endsWith(phone))) {
      return { ok: true, ignored: 'own_number' };
    }

    const conversation = await this.prisma.whatsappConversation.upsert({
      where: { coachId_phone: { coachId, phone } },
      create: { coachId, phone, name },
      update: { name, updatedAt: new Date() },
    });

    const externalId = typeof payload.messageId === 'string' ? payload.messageId.slice(0, 128) : undefined;
    if (externalId) {
      const dup = await this.prisma.whatsappMessage.findFirst({
        where: { conversationId: conversation.id, externalId },
        select: { id: true },
      });
      if (dup) return { ok: true, ignored: 'duplicate' };
    }

    const previous = await this.prisma.whatsappMessage.count({ where: { conversationId: conversation.id } });

    await this.prisma.whatsappMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'USER',
        type: 'TEXT',
        content: text,
        ...(externalId ? { externalId } : {}),
      },
    });

    // Boas-vindas só no primeiro contato (evita loops e spam de auto-resposta)
    if (previous === 0) {
      await this.autoReply(coachId, phone, name, conversation.id);
    }

    return { ok: true };
  }

  private async autoReply(coachId: string, phone: string, name: string, conversationId: string) {
    try {
      const config = await this.prisma.whatsappConfig.findUnique({ where: { coachId } });
      const token = config?.apiToken ? decrypt(config.apiToken) : '';
      if (!config || !token || !config.isConnected) return;

      const coach = await this.prisma.user.findUnique({
        where: { id: coachId },
        include: { coachProfile: { select: { slug: true } } },
      });
      const slug = coach?.coachProfile?.slug ?? coachId;
      const appUrl = (process.env.APP_URL || 'http://localhost:3001').replace(/\/+$/, '');
      const onboardingLink = `${appUrl}/onboarding/${slug}`;

      const message = (config.welcomeMessage || 'Olá {nome}! Acesse: {onboardingLink}')
        .replace('{nome}', name)
        .replace('{coachName}', coach?.name ?? 'Coach')
        .replace('{onboardingLink}', onboardingLink);

      if (config.provider === 'zapi') {
        await fetch(
          `https://api.z-api.io/instances/${encodeURIComponent(config.instanceId)}/token/${encodeURIComponent(token)}/send-text`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Client-Token': token },
            body: JSON.stringify({ phone, message }),
            signal: AbortSignal.timeout(10000),
          },
        );
      }

      await this.prisma.whatsappMessage.create({
        data: { conversationId, role: 'ASSISTANT', type: 'TEXT', content: message },
      });
    } catch (err) {
      this.logger.error('WhatsApp auto-reply error:', err);
    }
  }

  // ── SEND MANUAL MESSAGE ──

  async sendMessage(coachId: string, phone: string, message: string) {
    const config = await this.prisma.whatsappConfig.findUnique({ where: { coachId } });
    const token = config?.apiToken ? decrypt(config.apiToken) : '';
    if (!config || !token) {
      throw new NotFoundException('WhatsApp não configurado');
    }

    const cleanPhone = digits(phone);
    if (cleanPhone.length < 8 || cleanPhone.length > 15) throw new BadRequestException('Telefone inválido');

    if (config.provider === 'zapi') {
      const res = await fetch(
        `https://api.z-api.io/instances/${encodeURIComponent(config.instanceId)}/token/${encodeURIComponent(token)}/send-text`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Client-Token': token },
          body: JSON.stringify({ phone: cleanPhone, message }),
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!res.ok) throw new BadRequestException(`Falha no envio pelo Z-API (${res.status})`);
    }

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
