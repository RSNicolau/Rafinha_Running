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
