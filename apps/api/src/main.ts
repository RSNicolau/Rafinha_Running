import './instrument';
import { NestFactory } from '@nestjs/core';
import { CorrelationIdInterceptor } from './common/interceptors/correlation-id.interceptor';
import { ValidationPipe, VersioningType, VERSION_NEUTRAL } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import compression from 'compression';
import * as express from 'express';
import { AppModule } from './app.module';

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

  // ITEM 2 — Encryption key must be set and strong
  if (!process.env.API_KEY_ENCRYPTION_SECRET || process.env.API_KEY_ENCRYPTION_SECRET.length < 32) {
    throw new Error('API_KEY_ENCRYPTION_SECRET must be set and at least 32 chars long');
  }

  // ITEM 3 — Warn (not crash) for optional-but-important vars
  const warnings: string[] = [];
  if (!process.env.RESEND_API_KEY) warnings.push('RESEND_API_KEY not set — emails disabled');
  if (!process.env.EXPO_ACCESS_TOKEN) warnings.push('EXPO_ACCESS_TOKEN not set — push notifications disabled');
  if (!process.env.MERCADO_PAGO_ACCESS_TOKEN && !process.env.STRIPE_SECRET_KEY && !process.env.PAGARME_API_KEY) {
    warnings.push('No payment provider configured — payments will fail');
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

  const allowedOrigins = process.env.NODE_ENV === 'production'
    ? [
        ...(process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean),
        ...(process.env.APP_URL ? [process.env.APP_URL] : []),
        // Vercel preview/production URLs
        'https://rr-rafinha-running.vercel.app',
      ].filter(Boolean)
    : ['http://localhost:8081', 'http://localhost:3001', 'http://localhost:3000'];

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      if (process.env.NODE_ENV !== 'production') return callback(null, true);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  });

  // Public health check — must be registered BEFORE global prefix
  app.use('/health', (_req: any, res: any) => res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() }));

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalInterceptors(new CorrelationIdInterceptor());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

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
    .addTag('Integrations', 'Integrações com wearables (Garmin, Strava, COROS, Polar, Google Fit)')
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

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  const bootstrapLogger = app.get(Logger);
  bootstrapLogger.log(`RR API rodando na porta ${port} | health: /api/health`, 'Bootstrap');
  bootstrapLogger.log(`Docs: http://localhost:${port}/api/docs`, 'Bootstrap');
}

bootstrap();
