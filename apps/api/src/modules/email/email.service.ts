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

  async sendAthleteWeeklySummary(
    to: string,
    name: string,
    data: { weekKm: number; workouts: number; bestPace?: string; streak: number },
  ): Promise<void> {
    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #4f46e5;">Resumo da Semana — ${name} 🏃</h1>
      <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin: 20px 0;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div style="text-align: center; padding: 16px; background: white; border-radius: 8px;">
            <p style="font-size: 32px; font-weight: bold; color: #4f46e5; margin: 0;">${data.weekKm.toFixed(1)}</p>
            <p style="color: #6b7280; font-size: 14px; margin: 4px 0 0 0;">km esta semana</p>
          </div>
          <div style="text-align: center; padding: 16px; background: white; border-radius: 8px;">
            <p style="font-size: 32px; font-weight: bold; color: #4f46e5; margin: 0;">${data.workouts}</p>
            <p style="color: #6b7280; font-size: 14px; margin: 4px 0 0 0;">treinos concluídos</p>
          </div>
          ${data.bestPace ? `
          <div style="text-align: center; padding: 16px; background: white; border-radius: 8px;">
            <p style="font-size: 24px; font-weight: bold; color: #059669; margin: 0;">${data.bestPace}</p>
            <p style="color: #6b7280; font-size: 14px; margin: 4px 0 0 0;">melhor pace /km</p>
          </div>` : ''}
          <div style="text-align: center; padding: 16px; background: white; border-radius: 8px;">
            <p style="font-size: 32px; font-weight: bold; color: #f59e0b; margin: 0;">${data.streak}</p>
            <p style="color: #6b7280; font-size: 14px; margin: 4px 0 0 0;">dias de sequência</p>
          </div>
        </div>
      </div>
      <p style="text-align: center; margin-top: 24px;">
        <a href="${this.appUrl}/dashboard"
           style="background: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
          Ver meu dashboard
        </a>
      </p>
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 24px;">
        Continue treinando! — Rafinha Running Team
      </p>
    </div>
  `;

    await this.send(to, `Seu resumo da semana 🏃 — ${data.weekKm.toFixed(1)}km!`, html);
  }

  async sendCoachWeeklySummary(
    to: string,
    name: string,
    data: {
      totalAthletes: number;
      activeCount: number;
      inactiveCount: number;
      totalKm: number;
      totalWorkouts: number;
      inactiveAthletes: string[];
    },
  ): Promise<void> {
    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #4f46e5;">Resumo Semanal do Grupo — ${name} 📊</h1>
      <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin: 20px 0;">
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
          <div style="text-align: center; padding: 16px; background: white; border-radius: 8px;">
            <p style="font-size: 28px; font-weight: bold; color: #4f46e5; margin: 0;">${data.totalKm.toFixed(0)}</p>
            <p style="color: #6b7280; font-size: 12px; margin: 4px 0 0 0;">km totais do grupo</p>
          </div>
          <div style="text-align: center; padding: 16px; background: white; border-radius: 8px;">
            <p style="font-size: 28px; font-weight: bold; color: #059669; margin: 0;">${data.activeCount}</p>
            <p style="color: #6b7280; font-size: 12px; margin: 4px 0 0 0;">atletas ativos</p>
          </div>
          <div style="text-align: center; padding: 16px; background: ${data.inactiveCount > 0 ? '#fef3c7' : 'white'}; border-radius: 8px;">
            <p style="font-size: 28px; font-weight: bold; color: ${data.inactiveCount > 0 ? '#d97706' : '#6b7280'}; margin: 0;">${data.inactiveCount}</p>
            <p style="color: #6b7280; font-size: 12px; margin: 4px 0 0 0;">sem treino</p>
          </div>
        </div>
        ${data.inactiveCount > 0 ? `
        <div style="margin-top: 16px; padding: 12px; background: #fef3c7; border-radius: 8px;">
          <p style="font-weight: bold; color: #92400e; margin: 0 0 8px 0;">⚠️ Atletas sem treino essa semana:</p>
          <p style="color: #78350f; margin: 0;">${data.inactiveAthletes.join(', ')}${data.inactiveCount > 5 ? ` e mais ${data.inactiveCount - 5}` : ''}</p>
        </div>` : ''}
      </div>
      <p style="text-align: center; margin-top: 24px;">
        <a href="${this.appUrl}/dashboard/athletes"
           style="background: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
          Ver painel de atletas
        </a>
      </p>
    </div>
  `;

    await this.send(
      to,
      `Resumo do grupo 📊 — ${data.activeCount}/${data.totalAthletes} atletas ativos`,
      html,
    );
  }

  async sendCoachNewAthleteAlert(
    coachEmail: string,
    coachName: string,
    athleteName: string,
    athleteEmail: string,
    dashboardUrl: string,
  ): Promise<void> {
    const platformName = process.env.PLATFORM_NAME || 'Rafinha Running';
    await this.send(
      coachEmail,
      `🏃 Novo aluno cadastrado: ${athleteName}`,
      `<div style="font-family:Georgia,serif;max-width:580px;margin:0 auto;background:#ffffff">
        <div style="background:#DC2626;padding:8px 40px;text-align:center">
          <img src="https://rrweb-production.up.railway.app/logo.png" alt="${platformName}" style="width:180px;max-width:100%;display:block;margin:0 auto" />
        </div>
        <div style="padding:40px 40px 32px;background:#fff">
          <p style="font-size:18px;color:#111827;margin:0 0 8px">Olá, <strong>${coachName}</strong>! 👋</p>
          <p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 24px">
            Um novo aluno acabou de preencher o questionário de anamnese e está aguardando sua revisão:
          </p>
          <div style="background:#FEF2F2;border-left:4px solid #DC2626;border-radius:0 8px 8px 0;padding:20px 24px;margin:0 0 32px">
            <p style="font-size:16px;font-weight:700;color:#111827;margin:0 0 4px">${athleteName}</p>
            <p style="font-size:14px;color:#6B7280;margin:0">${athleteEmail}</p>
          </div>
          <a href="${dashboardUrl}" style="display:inline-block;background:#DC2626;color:#fff;font-size:15px;font-weight:700;padding:14px 32px;border-radius:8px;text-decoration:none">
            Ver questionário no painel →
          </a>
          <p style="font-size:13px;color:#9CA3AF;margin:32px 0 0">A IA já está analisando as respostas. Você receberá uma notificação quando o relatório estiver pronto.</p>
        </div>
        <div style="background:#F9FAFB;padding:16px 40px;text-align:center;border-top:1px solid #E5E7EB">
          <p style="font-size:12px;color:#9CA3AF;margin:0">${platformName} • Sistema de assessoria de corrida</p>
        </div>
      </div>`,
    );
  }

  async sendWelcome(to: string, name: string): Promise<void> {
    const platformName = process.env.PLATFORM_NAME || 'Rafinha Running';
    const loginUrl = `${process.env.FRONTEND_URL || this.appUrl}/athlete-login`;
    await this.send(
      to,
      `Bem-vindo(a) ao ${platformName}! 🏃`,
      `<div style="font-family:Georgia,serif;max-width:580px;margin:0 auto;background:#ffffff">

        <!-- Header -->
        <div style="background:#DC2626;padding:8px 40px;text-align:center">
          <img src="https://rrweb-production.up.railway.app/logo.png" alt="RR Rafinha Running" style="width:200px;max-width:100%;display:block;margin:0 auto" />
        </div>

        <!-- Body -->
        <div style="padding:40px 40px 32px;background:#fff">
          <p style="font-size:18px;color:#111827;margin:0 0 8px">Olá, <strong>${name}</strong>! 👋</p>
          <p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 24px">
            Seja muito bem-vindo(a) ao <strong>RR Rafinha Running</strong>!
          </p>
          <p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 24px">
            A partir de agora, você faz parte de um programa pensado para levar sua corrida a um novo nível — com estratégia, acompanhamento e evolução constante.
          </p>
          <p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 24px">
            Aqui, você não é apenas mais um aluno. <strong>Você é um atleta em desenvolvimento.</strong>
          </p>
          <p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 32px">
            Nosso objetivo é simples e direto:<br>
            <strong>extrair o seu melhor desempenho com inteligência, consistência e segurança.</strong>
          </p>

          <!-- What to expect -->
          <div style="background:#FEF2F2;border-left:4px solid #DC2626;border-radius:0 8px 8px 0;padding:20px 24px;margin:0 0 32px">
            <p style="font-size:15px;font-weight:700;color:#DC2626;margin:0 0 12px">🚀 O que você pode esperar a partir de agora:</p>
            <ul style="margin:0;padding:0 0 0 18px;color:#374151;font-size:14px;line-height:2">
              <li>Planilhas de treino personalizadas, ajustadas ao seu nível e objetivo</li>
              <li>Acompanhamento contínuo da sua evolução</li>
              <li>Estratégias para melhorar performance, resistência e ritmo</li>
              <li>Orientações sobre recuperação, prevenção de lesões e constância</li>
              <li>Suporte direto sempre que necessário</li>
            </ul>
          </div>

          <!-- Important -->
          <div style="background:#F9FAFB;border-radius:8px;padding:20px 24px;margin:0 0 32px">
            <p style="font-size:15px;font-weight:700;color:#111827;margin:0 0 8px">📊 Importante:</p>
            <p style="font-size:14px;color:#374151;line-height:1.7;margin:0">
              Para que o programa funcione com excelência, sua dedicação e feedback são fundamentais.<br>
              <strong>Quanto mais você se envolve, melhores serão seus resultados.</strong>
            </p>
          </div>

          <!-- Next steps -->
          <p style="font-size:15px;font-weight:700;color:#111827;margin:0 0 12px">📲 Próximos passos:</p>
          <ol style="margin:0 0 32px;padding:0 0 0 18px;color:#374151;font-size:14px;line-height:2.2">
            <li>Acesse sua plataforma/app de treinos</li>
            <li>Revise sua primeira planilha</li>
            <li>Siga as orientações com atenção</li>
            <li>Envie feedbacks sempre que necessário</li>
          </ol>

          <!-- CTA -->
          <div style="text-align:center;margin:0 0 32px">
            <a href="${loginUrl}" style="display:inline-block;padding:14px 36px;background:#DC2626;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:0.5px">
              Acessar minha plataforma →
            </a>
          </div>

          <!-- Motivational -->
          <div style="border-top:1px solid #E5E7EB;padding-top:24px;text-align:center">
            <p style="font-size:14px;color:#DC2626;font-weight:700;margin:0 0 8px">🔥 Lembre-se:</p>
            <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 24px;font-style:italic">
              "Resultados consistentes vêm da soma de pequenas ações bem feitas, todos os dias."
            </p>
            <p style="font-size:14px;color:#374151;margin:0">
              Estamos juntos nessa jornada.<br>
              <strong>Vamos evoluir. Vamos performar. Vamos correr melhor.</strong>
            </p>
          </div>
        </div>

        <!-- Footer -->
        <div style="background:#111827;padding:24px 40px;text-align:center">
          <p style="color:#9CA3AF;font-size:13px;margin:0 0 4px">Conte com a gente! 💪</p>
          <p style="color:#DC2626;font-size:13px;font-weight:700;margin:0">Equipe RR Rafinha Running</p>
          <p style="color:#6B7280;font-size:11px;margin:12px 0 0">
            ${platformName} &bull; Assessoria Esportiva &bull; Treinamento de corrida personalizado
          </p>
        </div>

      </div>`,
    );
  }

  /** Newsletter de eventos futuros — enviada periodicamente aos atletas */
  async sendUpcomingEventsNewsletter(
    to: string,
    name: string,
    events: Array<{ title: string; eventDate: Date; location?: string | null; city?: string | null; modality?: string | null; priceCents: number }>,
  ): Promise<void> {
    const fmtDate = (d: Date) =>
      d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    const fmtPrice = (c: number) => (c > 0 ? `R$ ${(c / 100).toFixed(2).replace('.', ',')}` : 'Gratuito');

    const rows = events
      .map(
        (e) => `
        <div style="background: white; border-radius: 8px; padding: 16px; margin-bottom: 12px; border-left: 4px solid #DC2626;">
          <p style="font-size: 16px; font-weight: bold; color: #111827; margin: 0 0 4px;">${e.title}</p>
          <p style="color: #6b7280; font-size: 13px; margin: 0;">
            📅 ${fmtDate(e.eventDate)}${e.modality ? ` &bull; 🏃 ${e.modality}` : ''}
          </p>
          ${e.location ? `<p style="color: #6b7280; font-size: 13px; margin: 4px 0 0;">📍 ${e.location}${e.city ? ` — ${e.city}` : ''}</p>` : ''}
          <p style="color: #DC2626; font-size: 13px; font-weight: bold; margin: 6px 0 0;">${fmtPrice(e.priceCents)}</p>
        </div>`,
      )
      .join('');

    await this.send(
      to,
      `🏁 Próximas corridas da assessoria — garanta sua vaga!`,
      `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #DC2626;">Próximos eventos, ${name}! 🏁</h1>
      <p style="color: #374151;">Estas são as corridas abertas da assessoria em que você ainda não está inscrito:</p>
      <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin: 20px 0;">
        ${rows}
      </div>
      <p style="text-align: center; margin-top: 24px;">
        <a href="${this.appUrl}" style="background: #DC2626; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">
          Ver eventos e se inscrever
        </a>
      </p>
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 24px;">
        Você recebe este e-mail por ser atleta da assessoria. Equipe RR Rafinha Running.
      </p>
    </div>`,
    );
  }

  /**
   * Envio genérico de e-mail transacional (ex.: avisos LGPD). O HTML deve ser montado
   * pelo chamador com dados já escapados.
   */
  async sendTransactional(to: string, subject: string, html: string): Promise<void> {
    await this.send(to, subject, html);
  }

  // ════════════════════════════════════════════════════════════════════════
  // Checkout — loja, eventos e plano da plataforma
  // ════════════════════════════════════════════════════════════════════════

  private esc(v: unknown): string {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private brl(cents: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents || 0) / 100);
  }

  private layout(title: string, body: string): string {
    const platformName = this.esc(process.env.PLATFORM_NAME || 'Rafinha Running');
    return `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
      <h2 style="color:#DC2626;margin-bottom:8px">${title}</h2>
      ${body}
      <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0"/>
      <p style="color:#9CA3AF;font-size:12px">${platformName} &bull; Treinamento de corrida personalizado</p>
    </div>`;
  }

  async sendStoreOrderPaid(
    to: string,
    data: {
      name: string;
      orderId: string;
      productName: string;
      quantity: number;
      size?: string | null;
      color?: string | null;
      totalInCents: number;
      isPreOrder: boolean;
      estimatedDelivery?: Date | null;
      deliveryMethod?: string | null;
    },
  ): Promise<void> {
    const code = data.orderId.slice(0, 8).toUpperCase();
    const variant = [data.size && `Tamanho ${this.esc(data.size)}`, data.color && `Cor ${this.esc(data.color)}`]
      .filter(Boolean)
      .join(' · ');
    const delivery = data.isPreOrder
      ? `<p>Este item é uma <strong>encomenda</strong>. ${
          data.estimatedDelivery
            ? `Previsão de entrega: <strong>${data.estimatedDelivery.toLocaleDateString('pt-BR')}</strong>.`
            : 'Avisaremos assim que a produção for concluída.'
        }</p>`
      : `<p>Vamos separar seu pedido e avisar quando ${
          data.deliveryMethod === 'PICKUP' ? 'estiver pronto para retirada' : 'for enviado'
        }.</p>`;
    await this.send(
      to,
      `Pagamento confirmado — pedido #${code}`,
      this.layout(
        'Pagamento confirmado! 🎉',
        `<p>Olá, <strong>${this.esc(data.name)}</strong>!</p>
        <p>Recebemos o pagamento do seu pedido <strong>#${code}</strong>:</p>
        <p style="background:#F4F4F5;border-radius:8px;padding:12px">
          <strong>${this.esc(data.productName)}</strong> × ${data.quantity}<br/>
          ${variant ? `${variant}<br/>` : ''}
          Total pago: <strong>${this.brl(data.totalInCents)}</strong>
        </p>
        ${delivery}`,
      ),
    );
  }

  async sendStoreOrderStatus(
    to: string,
    data: { name: string; orderId: string; productName: string; status: string; trackingCode?: string | null },
  ): Promise<void> {
    const code = data.orderId.slice(0, 8).toUpperCase();
    const labels: Record<string, string> = {
      PROCESSING: 'Seu pedido está em separação/produção.',
      SHIPPED: 'Seu pedido foi enviado!',
      READY_FOR_PICKUP: 'Seu pedido está pronto para retirada com a assessoria.',
      DELIVERED: 'Seu pedido foi entregue. Bons treinos!',
      CANCELLED: 'Seu pedido foi cancelado.',
      REFUNDED: 'O pagamento do seu pedido foi estornado.',
    };
    const msg = labels[data.status];
    if (!msg) return;
    await this.send(
      to,
      `Pedido #${code} — atualização`,
      this.layout(
        'Atualização do seu pedido',
        `<p>Olá, <strong>${this.esc(data.name)}</strong>!</p>
        <p><strong>${this.esc(data.productName)}</strong> — ${msg}</p>
        ${data.trackingCode ? `<p>Código de rastreio: <strong>${this.esc(data.trackingCode)}</strong></p>` : ''}`,
      ),
    );
  }

  async sendEventRegistrationConfirmed(
    to: string,
    data: {
      name: string;
      eventTitle: string;
      eventDate: Date;
      bibNumber?: string | null;
      distanceName?: string | null;
      kitPickupLocation?: string | null;
      kitPickupDate?: Date | null;
      amountPaidInCents?: number | null;
    },
  ): Promise<void> {
    await this.send(
      to,
      `Inscrição confirmada — ${data.eventTitle}`,
      this.layout(
        'Inscrição confirmada! 🏁',
        `<p>Olá, <strong>${this.esc(data.name)}</strong>!</p>
        <p>Sua inscrição em <strong>${this.esc(data.eventTitle)}</strong> (${data.eventDate.toLocaleDateString('pt-BR')}) está confirmada.</p>
        ${data.bibNumber ? `<p style="font-size:28px;font-weight:800;color:#DC2626;margin:16px 0">Peito nº ${this.esc(data.bibNumber)}</p>` : ''}
        ${data.distanceName ? `<p>Percurso: <strong>${this.esc(data.distanceName)}</strong></p>` : ''}
        ${data.amountPaidInCents ? `<p>Valor pago: <strong>${this.brl(data.amountPaidInCents)}</strong></p>` : ''}
        ${
          data.kitPickupLocation || data.kitPickupDate
            ? `<p>Retirada do kit: ${this.esc(data.kitPickupLocation ?? '')} ${
                data.kitPickupDate ? `— ${data.kitPickupDate.toLocaleString('pt-BR')}` : ''
              }<br/><span style="color:#6B7280;font-size:13px">Apresente o QR Code da inscrição no app e um documento com foto.</span></p>`
            : ''
        }`,
      ),
    );
  }

  async sendEventSpotAvailable(
    to: string,
    data: { name: string; eventTitle: string; eventId: string; expiresAt: Date },
  ): Promise<void> {
    const url = `${this.appUrl}/eventos/${encodeURIComponent(data.eventId)}`;
    await this.send(
      to,
      `Vaga liberada — ${data.eventTitle}`,
      this.layout(
        'Abriu uma vaga para você!',
        `<p>Olá, <strong>${this.esc(data.name)}</strong>!</p>
        <p>Você estava na lista de espera de <strong>${this.esc(data.eventTitle)}</strong> e uma vaga foi liberada.</p>
        <p>Conclua o pagamento até <strong>${data.expiresAt.toLocaleString('pt-BR')}</strong> para garantir sua inscrição.</p>
        <a href="${url}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#DC2626;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Concluir inscrição</a>`,
      ),
    );
  }

  async sendPlatformPlanActivated(
    to: string,
    data: { name: string; planName: string; periodEnd: Date; amountInCents: number },
  ): Promise<void> {
    await this.send(
      to,
      `Plano ${data.planName} ativado`,
      this.layout(
        'Plano ativado! 🚀',
        `<p>Olá, <strong>${this.esc(data.name)}</strong>!</p>
        <p>Recebemos o pagamento de <strong>${this.brl(data.amountInCents)}</strong> e seu plano <strong>${this.esc(data.planName)}</strong> está ativo até <strong>${data.periodEnd.toLocaleDateString('pt-BR')}</strong>.</p>`,
      ),
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // Mensalidade (atleta → equipe)
  // ════════════════════════════════════════════════════════════════════════

  private button(href: string, label: string): string {
    return `<a href="${this.esc(href)}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#DC2626;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">${this.esc(label)}</a>`;
  }

  private dateBR(d: Date | string | null | undefined): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  }

  async sendMembershipPaid(
    to: string,
    data: { name: string; teamName: string; planName: string; amountInCents: number; periodEnd?: Date | null },
  ): Promise<void> {
    await this.send(
      to,
      `Mensalidade confirmada — ${data.teamName}`,
      this.layout(
        'Mensalidade confirmada! ✅',
        `<p>Olá, <strong>${this.esc(data.name)}</strong>!</p>
        <p>Recebemos <strong>${this.brl(data.amountInCents)}</strong> referente ao plano <strong>${this.esc(data.planName)}</strong> da <strong>${this.esc(data.teamName)}</strong>.</p>
        ${data.periodEnd ? `<p>Seu período está garantido até <strong>${this.dateBR(data.periodEnd)}</strong>.</p>` : ''}
        <p>Bons treinos!</p>`,
      ),
    );
  }

  async sendMembershipReminder(
    to: string,
    data: { name: string; teamName: string; planName: string; amountInCents: number; dueDate?: Date | null; invoiceUrl: string; overdue: boolean },
  ): Promise<void> {
    await this.send(
      to,
      data.overdue ? `Mensalidade em atraso — ${data.teamName}` : `Lembrete de mensalidade — ${data.teamName}`,
      this.layout(
        data.overdue ? 'Sua mensalidade está em atraso' : 'Lembrete da sua mensalidade',
        `<p>Olá, <strong>${this.esc(data.name)}</strong>!</p>
        <p>A mensalidade do plano <strong>${this.esc(data.planName)}</strong> (${this.brl(data.amountInCents)})
        ${data.overdue ? 'venceu em' : 'vence em'} <strong>${this.dateBR(data.dueDate)}</strong>.</p>
        ${this.button(data.invoiceUrl, 'Pagar mensalidade')}
        <p style="color:#6B7280;font-size:13px">Se você já pagou, desconsidere esta mensagem — a confirmação pode levar alguns minutos.</p>`,
      ),
    );
  }

  async sendMembershipPastDue(
    to: string,
    data: { name: string; teamName: string; planName: string; amountInCents: number; dueDate?: Date | null; invoiceUrl?: string | null },
  ): Promise<void> {
    await this.send(
      to,
      `Mensalidade em atraso — ${data.teamName}`,
      this.layout(
        'Mensalidade em atraso',
        `<p>Olá, <strong>${this.esc(data.name)}</strong>!</p>
        <p>Não identificamos o pagamento da mensalidade do plano <strong>${this.esc(data.planName)}</strong>
        (${this.brl(data.amountInCents)}), vencida em <strong>${this.dateBR(data.dueDate)}</strong>.</p>
        ${data.invoiceUrl ? this.button(data.invoiceUrl, 'Regularizar agora') : `<p>Acesse o app para regularizar.</p>`}
        <p style="color:#6B7280;font-size:13px">Dúvidas? Fale com a sua assessoria.</p>`,
      ),
    );
  }

  async sendMembershipPastDueSummary(
    to: string,
    data: { name: string; teamName: string; athletes: Array<{ name: string; planName: string; amountInCents: number; dueDate?: Date | null }> },
  ): Promise<void> {
    if (!data.athletes.length) return;
    const total = data.athletes.reduce((acc, a) => acc + (a.amountInCents || 0), 0);
    const rows = data.athletes
      .slice(0, 50)
      .map(
        (a) => `<tr><td style="padding:4px 8px">${this.esc(a.name)}</td><td style="padding:4px 8px">${this.esc(a.planName)}</td>
        <td style="padding:4px 8px;text-align:right">${this.brl(a.amountInCents)}</td><td style="padding:4px 8px">${this.dateBR(a.dueDate)}</td></tr>`,
      )
      .join('');
    await this.send(
      to,
      `${data.athletes.length} mensalidade(s) em atraso — ${data.teamName}`,
      this.layout(
        'Mensalidades em atraso',
        `<p>Olá, <strong>${this.esc(data.name)}</strong>!</p>
        <p>Hoje ${data.athletes.length === 1 ? '1 atleta passou' : `${data.athletes.length} atletas passaram`} a constar como inadimplente(s)
        na <strong>${this.esc(data.teamName)}</strong> (total ${this.brl(total)}):</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;background:#F4F4F5;border-radius:8px">
          <tr style="text-align:left;color:#6B7280"><th style="padding:4px 8px">Atleta</th><th style="padding:4px 8px">Plano</th><th style="padding:4px 8px;text-align:right">Valor</th><th style="padding:4px 8px">Vencimento</th></tr>
          ${rows}
        </table>
        ${this.button(`${this.appUrl}/dashboard/mensalidades?status=PAST_DUE`, 'Ver mensalidades')}`,
      ),
    );
  }
}
