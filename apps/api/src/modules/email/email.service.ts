import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;
  private readonly appUrl: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    this.resend = apiKey ? new Resend(apiKey) : null;
    this.from = process.env.EMAIL_FROM || 'noreply@rafinharunning.com.br';
    this.appUrl = process.env.APP_URL || 'http://localhost:3001';
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.resend) {
      this.logger.warn(`[EMAIL SKIPPED — no RESEND_API_KEY] To: ${to} | Subject: ${subject}`);
      return;
    }
    try {
      await this.resend.emails.send({ from: this.from, to, subject, html });
      this.logger.log(`Email sent to ${to}: ${subject}`);
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}: ${err}`);
    }
  }

  async sendPasswordReset(to: string, name: string, token: string): Promise<void> {
    const resetUrl = `${this.appUrl}/reset-password?token=${token}&email=${encodeURIComponent(to)}`;
    await this.send(
      to,
      'Redefinição de senha — Rafinha Running',
      `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:32px">
        <h2 style="color:#DC2626;margin-bottom:8px">Redefinição de senha</h2>
        <p>Olá, <strong>${name}</strong>!</p>
        <p>Recebemos uma solicitação para redefinir sua senha. Clique no botão abaixo para continuar:</p>
        <a href="${resetUrl}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#DC2626;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
          Redefinir senha
        </a>
        <p style="color:#6B7280;font-size:13px">Este link expira em 1 hora. Se você não solicitou isso, ignore este email.</p>
        <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0"/>
        <p style="color:#9CA3AF;font-size:12px">Rafinha Running &bull; Treinamento de corrida personalizado</p>
      </div>`,
    );
  }

  async sendAthleteInvite(to: string, coachName: string, token: string, tenantBrandingName?: string): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL || this.appUrl;
    const joinUrl = `${frontendUrl}/join?token=${token}`;
    const platformName = tenantBrandingName || 'Rafinha Running';
    await this.send(
      to,
      `${coachName} te convidou para treinar na ${platformName}`,
      `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:32px">
        <h2 style="color:#DC2626;margin-bottom:8px">Você foi convidado!</h2>
        <p><strong>${coachName}</strong> te convidou para fazer parte da plataforma de treinos <strong>${platformName}</strong>.</p>
        <p>Clique no botão abaixo para criar sua conta e começar a treinar:</p>
        <a href="${joinUrl}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#DC2626;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
          Aceitar convite
        </a>
        <p style="color:#6B7280;font-size:13px">Este link expira em 7 dias.</p>
        <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0"/>
        <p style="color:#9CA3AF;font-size:12px">${platformName} &bull; Treinamento de corrida personalizado</p>
      </div>`,
    );
  }

  async sendSubscriptionReminder(to: string, name: string, expiresAt: Date): Promise<void> {
    const platformName = process.env.PLATFORM_NAME || 'Rafinha Running';
    const expiresDate = expiresAt.toLocaleDateString('pt-BR');
    await this.send(
      to,
      `Sua assinatura expira em breve — ${platformName}`,
      `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:32px">
        <h2 style="color:#DC2626;margin-bottom:8px">Sua assinatura expira em breve</h2>
        <p>Olá, <strong>${name}</strong>!</p>
        <p>Sua assinatura da <strong>${platformName}</strong> expira em <strong>${expiresDate}</strong>.</p>
        <p>Renove para continuar usando todos os recursos da plataforma.</p>
        <a href="${this.appUrl}/subscribe" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#DC2626;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
          Renovar assinatura
        </a>
        <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0"/>
        <p style="color:#9CA3AF;font-size:12px">${platformName} &bull; Treinamento de corrida personalizado</p>
      </div>`,
    );
  }

  async sendWeeklyDigest(to: string, coachName: string, athleteCount: number, completedWorkouts: number, totalWorkouts: number): Promise<void> {
    const platformName = process.env.PLATFORM_NAME || 'Rafinha Running';
    const adherence = totalWorkouts > 0 ? Math.round((completedWorkouts / totalWorkouts) * 100) : 0;
    await this.send(
      to,
      `Resumo semanal — ${platformName}`,
      `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:32px">
        <h2 style="color:#DC2626;margin-bottom:8px">Resumo Semanal</h2>
        <p>Olá, <strong>${coachName}</strong>! Aqui está o resumo da última semana:</p>
        <div style="background:#F9FAFB;border-radius:8px;padding:16px;margin:16px 0">
          <p style="margin:4px 0"><strong>Atletas ativos:</strong> ${athleteCount}</p>
          <p style="margin:4px 0"><strong>Treinos concluídos:</strong> ${completedWorkouts}/${totalWorkouts}</p>
          <p style="margin:4px 0"><strong>Adesão média:</strong> ${adherence}%</p>
        </div>
        <a href="${this.appUrl}/dashboard" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#DC2626;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
          Acessar dashboard
        </a>
        <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0"/>
        <p style="color:#9CA3AF;font-size:12px">${platformName} &bull; Treinamento de corrida personalizado</p>
      </div>`,
    );
  }

  async sendAthleteCredentials(to: string, name: string, tempPassword: string): Promise<void> {
    const platformName = process.env.PLATFORM_NAME || 'Rafinha Running';
    const loginUrl = `${process.env.FRONTEND_URL || this.appUrl}/login`;
    await this.send(
      to,
      `Seus dados de acesso — ${platformName}`,
      `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:32px">
        <h2 style="color:#DC2626;margin-bottom:8px">Bem-vindo(a) à ${platformName}, ${name}!</h2>
        <p>Seu questionário foi recebido. Aqui estão seus dados de acesso à plataforma:</p>
        <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:16px;margin:16px 0">
          <p style="margin:4px 0"><strong>Email:</strong> ${to}</p>
          <p style="margin:4px 0"><strong>Senha temporária:</strong> <code style="background:#EEF2FF;padding:2px 6px;border-radius:4px;font-size:14px">${tempPassword}</code></p>
        </div>
        <p style="color:#6B7280;font-size:13px">Por segurança, troque sua senha após o primeiro acesso.</p>
        <a href="${loginUrl}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#DC2626;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
          Acessar agora
        </a>
        <p style="color:#6B7280;font-size:13px">Seu coach irá analisar suas respostas e entrar em contato em breve com seu plano de treino personalizado.</p>
        <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0"/>
        <p style="color:#9CA3AF;font-size:12px">${platformName} &bull; Treinamento de corrida personalizado</p>
      </div>`,
    );
  }

  async sendWeeklySummary(
    to: string,
    name: string,
    data: {
      totalKm: number;
      totalWorkouts: number;
      avgPace?: string;
      streak: number;
      coachName: string;
    },
  ): Promise<void> {
    const platformName = process.env.PLATFORM_NAME || 'Rafinha Running';
    const { totalKm, totalWorkouts, avgPace, streak, coachName } = data;
    await this.send(
      to,
      `Sua semana em números — ${platformName}`,
      `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#fff">
        <h2 style="color:#DC2626;margin-bottom:4px">Sua semana em números</h2>
        <p style="color:#6B7280;font-size:14px;margin-bottom:24px">Olá, <strong style="color:#111">${name}</strong>! Aqui está o resumo da sua semana:</p>
        <div style="display:flex;gap:12px;margin-bottom:24px">
          <div style="flex:1;background:#FEF2F2;border-radius:12px;padding:16px;text-align:center">
            <p style="font-size:28px;font-weight:700;color:#DC2626;margin:0">${totalWorkouts}</p>
            <p style="font-size:12px;color:#6B7280;margin:4px 0 0">treino${totalWorkouts !== 1 ? 's' : ''}</p>
          </div>
          <div style="flex:1;background:#F0FDF4;border-radius:12px;padding:16px;text-align:center">
            <p style="font-size:28px;font-weight:700;color:#16A34A;margin:0">${totalKm}km</p>
            <p style="font-size:12px;color:#6B7280;margin:4px 0 0">percorridos</p>
          </div>
          <div style="flex:1;background:#EFF6FF;border-radius:12px;padding:16px;text-align:center">
            <p style="font-size:28px;font-weight:700;color:#2563EB;margin:0">${streak}</p>
            <p style="font-size:12px;color:#6B7280;margin:4px 0 0">dias ativos</p>
          </div>
        </div>
        ${avgPace ? `<p style="color:#374151;font-size:14px;margin-bottom:16px">Pace médio: <strong>${avgPace} min/km</strong></p>` : ''}
        <a href="${this.appUrl}/dashboard" style="display:inline-block;margin:8px 0 24px;padding:12px 24px;background:#DC2626;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
          Ver meu painel
        </a>
        <hr style="border:none;border-top:1px solid #E5E7EB;margin:0 0 16px"/>
        <p style="color:#9CA3AF;font-size:12px">Enviado por <strong>${coachName}</strong> via ${platformName}</p>
      </div>`,
    );
  }

  async sendWelcome(to: string, name: string): Promise<void> {
    const platformName = process.env.PLATFORM_NAME || 'Rafinha Running';
    await this.send(
      to,
      `Bem-vindo(a) à ${platformName}!`,
      `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:32px">
        <h2 style="color:#DC2626;margin-bottom:8px">Bem-vindo(a), ${name}!</h2>
        <p>Sua conta foi criada com sucesso. Agora você pode acessar seu portal de treinos.</p>
        <a href="${process.env.FRONTEND_URL || this.appUrl}/athlete-login" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#DC2626;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
          Acessar portal
        </a>
        <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0"/>
        <p style="color:#9CA3AF;font-size:12px">${platformName} &bull; Treinamento de corrida personalizado</p>
      </div>`,
    );
  }
}
