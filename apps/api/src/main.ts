// boot: prisma migrate deploy at startup (commit f416ef9 fix)
import './instrument';
import { NestFactory } from '@nestjs/core';
import { CorrelationIdInterceptor } from './common/interceptors/correlation-id.interceptor';
import { VersioningType } from '@nestjs/common';
import { buildValidationPipe } from './common/pipes/validation.pipe';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import compression from 'compression';
import * as express from 'express';
import { AppModule } from './app.module';
import { ENCRYPTION_KEY_ENV, isValidEncryptionKey } from './common/utils/encryption';

function validateEnv(): void {
  const required = [
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'DATABASE_URL',
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing required env variables: ${missing.join(', ')}`);
  }

  // Criptografia — dois segredos distintos em uso no código:
  //  - ENCRYPTION_KEY (common/utils/encryption.ts, AES-256-GCM): tokens OAuth das integrações. 32 bytes em hex.
  //  - API_KEY_ENCRYPTION_SECRET (BYOK do coach-brain, segredo TOTP do 2FA, payments): string >= 32 chars.
  if (!process.env.API_KEY_ENCRYPTION_SECRET || process.env.API_KEY_ENCRYPTION_SECRET.length < 32) {
    throw new Error('API_KEY_ENCRYPTION_SECRET must be set and at least 32 chars long');
  }
  if (!isValidEncryptionKey(process.env[ENCRYPTION_KEY_ENV])) {
    const msg = `${ENCRYPTION_KEY_ENV} must be set to a 32-byte hex string (64 hex chars) — generate with: openssl rand -hex 32`;
    if (process.env.NODE_ENV === 'production') throw new Error(msg);
    const { Logger: L } = require('@nestjs/common');
    new L('Bootstrap').warn(`ENV WARNING: ${msg} (integration tokens will be stored unencrypted outside production)`);
  }

  // ITEM 3 — Warn (not crash) for optional-but-important vars
  const warnings: string[] = [];
  if (!process.env.RESEND_API_KEY) warnings.push('RESEND_API_KEY not set — emails disabled');
  if (!process.env.EXPO_ACCESS_TOKEN) warnings.push('EXPO_ACCESS_TOKEN not set — push notifications disabled');
  const isProduction = process.env.NODE_ENV === 'production';
  // Mesmo critério de checkout.service.ts (isFakeProvider): só vale fora de produção
  const fakeEnvAllowed = ['development', 'test'].includes(process.env.NODE_ENV ?? '');
  const asaasIsProduction = /^https?:\/\/api\.asaas\.com(\/|$)/i.test(process.env.ASAAS_BASE_URL ?? '');
  const fakePayments = fakeEnvAllowed && !asaasIsProduction && process.env.PAYMENTS_FAKE_PROVIDER === 'true';
  if (process.env.PAYMENTS_FAKE_PROVIDER === 'true' && !fakePayments) {
    warnings.push('PAYMENTS_FAKE_PROVIDER=true is ignored (only NODE_ENV=development|test and never with the production Asaas URL)');
  }
  if (fakePayments) {
    warnings.push('PAYMENTS_FAKE_PROVIDER=true — payments are SIMULATED (dev only)');
  }
  if (
    !fakePayments &&
    !process.env.ASAAS_API_KEY &&
    !process.env.MERCADO_PAGO_ACCESS_TOKEN &&
    !process.env.STRIPE_SECRET_KEY &&
    !process.env.PAGARME_API_KEY
  ) {
    warnings.push('No payment provider configured (ASAAS_API_KEY, MERCADO_PAGO_ACCESS_TOKEN, STRIPE_SECRET_KEY or PAGARME_API_KEY) — payments will fail');
  }
  if (process.env.ASAAS_API_KEY && !process.env.ASAAS_WEBHOOK_TOKEN) {
    warnings.push('ASAAS_WEBHOOK_TOKEN not set while ASAAS_API_KEY is — Asaas webhooks will be rejected and payments will not be confirmed');
  }
  if (!process.env.PROXY_SHARED_SECRET) {
    warnings.push('PROXY_SHARED_SECRET not set — client IP forwarded by the web proxy will not be trusted (rate limits/audit logs use the proxy IP)');
  }
  if (!process.env.APP_URL) {
    warnings.push('APP_URL not set — email links, OAuth/payment redirects and CORS fall back to localhost defaults');
  }
  if (!process.env.LEGAL_DPO_EMAIL) {
    warnings.push('LEGAL_DPO_EMAIL not set — LGPD data-subject requests will not be emailed to the DPO');
  }
  if (!process.env.ANTHROPIC_API_KEY) warnings.push('ANTHROPIC_API_KEY not set — AI features disabled');
  if (!process.env.PAGARME_WEBHOOK_SECRET) warnings.push('PAGARME_WEBHOOK_SECRET not set');
  if (!process.env.SENTRY_DSN) warnings.push('SENTRY_DSN not set — error tracking disabled');
  if (warnings.length > 0) {
    const { Logger } = require('@nestjs/common');
    const startupLogger = new Logger('Bootstrap');
    warnings.forEach(w => startupLogger.warn(`ENV WARNING: ${w}`));
  }
}

async function bootstrap() {
  validateEnv();

  const app = await NestFactory.create(AppModule, { rawBody: true, bufferLogs: true });
  app.useLogger(app.get(Logger));

  // req.ip = IP acrescentado pelo(s) proxy(s) reverso(s) confiável(is) (Caddy/Nginx), não o X-Forwarded-For do cliente
  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 1);
  app.getHttpAdapter().getInstance().set('trust proxy', Number.isFinite(trustProxyHops) ? trustProxyHops : 1);

  // Capture raw body for Pagar.me webhook HMAC-SHA256 signature validation
  app.use('/api/v1/payments/webhook', express.raw({ type: '*/*' }));

  // Response compression
  app.use(compression());

  // Security headers with strict CSP — ITEM 8: no unsafe-inline
  app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: process.env.NODE_ENV === 'production'
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", 'https://js.stripe.com', 'https://sdk.mercadopago.com'],
            styleSrc: ["'self'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'", 'https://api.anthropic.com', 'https://api.resend.com', '*.sentry.io', '*.stripe.com', 'api.mapbox.com'],
            frameSrc: ["'self'", 'https://js.stripe.com'],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
          },
        }
      : false,
  }));

  const isProd = process.env.NODE_ENV === 'production';
  const allowedOrigins = [
    ...(process.env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean),
    ...(process.env.APP_URL ? [process.env.APP_URL.trim()] : []),
    ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL.trim()] : []),
    ...(isProd ? [] : ['http://localhost:8081', 'http://localhost:3001', 'http://localhost:3000']),
  ].map((o) => o.replace(/\/+$/, ''));

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return callback(null, true); // curl, mobile, server-to-server, same-origin via Next rewrites
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // Origem não listada: sem headers CORS (o navegador bloqueia a leitura da resposta)
      callback(null, false);
    },
    credentials: true,
  });

  // Public health check — must be registered BEFORE global prefix
  app.use('/health', (_req: any, res: any) => res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() }));

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalInterceptors(new CorrelationIdInterceptor());

  // Validação global com mensagens em PT (mensagens customizadas dos DTOs são mantidas)
  app.useGlobalPipes(buildValidationPipe());
  // Rede de segurança: Prisma P2002/P2025/P2003 → 409/404/400 em PT; demais → 500 genérico logado
  app.useGlobalFilters(new AllExceptionsFilter());

  const config = new DocumentBuilder()
    .setTitle('RR - Rafinha Running API')
    .setDescription(
      'API para plataforma de treino de corrida.\n\n' +
      '**Rate Limiting:** 100 requests/min por usuário autenticado (ou IP). ' +
      'Endpoints de auth possuem limites específicos (ex: 5/min para registro, 10/min para login).\n\n' +
      '**Autenticação:** Bearer token JWT (access token de 15 min + refresh token de 7 dias).',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .addTag('Auth', 'Autenticação e autorização')
    .addTag('Users', 'Gestão de perfis e atletas')
    .addTag('Training Plans', 'Planos de treino')
    .addTag('Workouts', 'Treinos e resultados')
    .addTag('Payments', 'Pagamentos e assinaturas')
    .addTag('Integrations', 'Integrações com wearables (Garmin, Strava, COROS, Google Fit)')
    .addTag('Chat', 'Mensagens entre coach e atleta')
    .addTag('Events', 'Eventos e corridas')
    .addTag('Notifications', 'Notificações push e in-app')
    .addTag('Rankings', 'Rankings e leaderboards')
    .addTag('Nutrition', 'Registro nutricional e hidratação')
    .addTag('Live Tracking', 'Rastreamento GPS em tempo real')
    .addTag('Admin', 'Administração da plataforma')
    .addTag('Branding', 'Personalização white-label')
    .addTag('Invites', 'Convites de coach para atletas')
    .addTag('Webhooks', 'Endpoints para webhooks de terceiros')
    .build();

  const swaggerEnabled = !isProd || process.env.ENABLE_SWAGGER === 'true';
  if (swaggerEnabled) {
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);
  const bootstrapLogger = app.get(Logger);
  bootstrapLogger.log(`RR API rodando na porta ${port} | health: /api/health`, 'Bootstrap');
  if (swaggerEnabled) bootstrapLogger.log(`Docs: http://localhost:${port}/api/docs`, 'Bootstrap');
}

bootstrap();
