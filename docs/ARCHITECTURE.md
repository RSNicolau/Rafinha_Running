# RR Rafinha Running — Arquitetura Técnica

> **Versão:** 1.0 | **Data:** Abril 2026 | **Maturidade:** Beta Avançado (7.5/10)

---

## Visão Geral

Plataforma SaaS de assessoria de corrida com:
- **Coach** → gerencia atletas, cria planilhas de treino, acessa IA
- **Atleta** → recebe e registra treinos, visualiza progresso, conecta wearables
- **IA (CoachBrain)** → assistente contextual para coaches com streaming SSE

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (Next.js 15)                  │
│     Vercel · TypeScript · Tailwind · React Query           │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS / REST + SSE
┌────────────────────────▼────────────────────────────────────┐
│                    API (NestJS 11)                          │
│     Railway · TypeScript · Prisma ORM · Pino logs          │
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │   Auth   │ │Onboarding│ │CoachBrain│ │  Scheduler   │  │
│  │JWT+OAuth │ │Form+AI   │ │SSE+Multi │ │  Cron Jobs   │  │
│  └──────────┘ └──────────┘ │ Provider │ └──────────────┘  │
│                             └──────────┘                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ Payments │ │Integração│ │  Chat    │ │  Rankings    │  │
│  │MercadoPago│ │Garmin/   │ │WebSocket │ │   Cache      │  │
│  │  Stripe  │ │Strava/GF │ │  SSE     │ │   Redis      │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                  PostgreSQL (Railway)                        │
│            Prisma Migrations · 38 models                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Stack Tecnológica

| Camada | Tecnologia | Hospedagem |
|--------|-----------|------------|
| Frontend | Next.js 15 (App Router) | Vercel |
| API | NestJS 11 + Express | Railway |
| ORM | Prisma 6 | — |
| Banco | PostgreSQL 16 | Railway |
| Cache | Redis (via CacheService) | Railway |
| Auth | JWT (access 15min + refresh 7d) + Google OAuth + Apple | — |
| IA | Anthropic Claude, OpenAI, Gemini, Grok (BYOK) | — |
| Emails | Resend | — |
| Pagamentos | MercadoPago + Stripe | — |
| Wearables | Garmin Connect, Strava, COROS, Polar, Google Fit | — |
| Logs | Pino + Sentry | — |
| CI | TypeScript strict + Jest | Railway |

---

## Módulos da API

### Auth (`/api/v1/auth`)
- Registro, login, refresh token, logout
- OAuth: Google (`idToken`) e Apple (`identityToken`)
- Senha temporária para atletas onboardados
- **Rate limiting:** 5 req/min (registro), 10 req/min (login)

### Onboarding (`/api/v1/onboarding`)
- Formulário 100% configurável pelo coach (27 perguntas default)
- Endpoint público `/public/:slug` sem autenticação
- Fluxo: atleta preenche → IA analisa (async `AIJob`) → coach revisa → aprovação
- **Rate limiting:** 5 req/min (submit), 3 req/min (checkout)
- **Validação:** DTOs com class-validator (email, campos obrigatórios, whitelist)

### CoachBrain (`/api/v1/coach-brain`)
- Chat SSE streaming com Claude/GPT-4/Gemini/Grok
- BYOK (Bring Your Own Key): chaves criptografadas com AES-256-CBC
- Contexto rico: atletas + treinos 7d + Garmin + avaliações físicas
- `AIJob` system: retry automático (status PENDING → RUNNING → SUCCESS/FAILED)
- Máx 3 tentativas por job; coach notificado em caso de falha permanente

### Payments (`/api/v1/payments`)
- MercadoPago (padrão BR): `preapproval` API para assinaturas recorrentes
- Stripe: `Subscription` API para pagamentos internacionais
- Webhook com HMAC-SHA256 (MercadoPago) e `stripe.webhooks.constructEvent`
- Graceful degradation: sem token configurado → erro claro ao usuário

### Integrations (`/api/v1/integrations`)
- **Garmin:** OAuth + webhook de atividades + Health API (HRV/sono/estresse)
- **Strava:** OAuth + pull de atividades com matching por distância ±10%
- **COROS / Polar / Google Fit:** OAuth + pull periódico
- `GarminHealthSnapshot`: semáforo de recuperação (🟢🟡🔴) calculado por HRV + sono

### Physical Assessments (`/api/v1/physical-assessments`)
- Avaliação física completa: peso, altura, VO2max, FC repouso, tempo 5K/10K
- Cálculo automático: BMI, VDOT (Daniels Running Formula), zonas HR/pace
- Comparação IA entre avaliações (Claude analisa delta)

### Scheduler (interno)
| Cron | Job |
|------|-----|
| `*/5 * * * *` | Retry de AIJobs com falha |
| `0 3 * * *` | Limpeza de tokens expirados + invites |
| `0 7 * * *` | Alerta HRV baixo (< 30ms) → notificação coach |
| `0 8 * * *` | Alerta provas em 14 dias |
| `0 9 * * *` | Lembrete de renovação de assinatura (3 dias) |
| `0 9 * * *` | Atletas inativos há 7+ dias → notificação coach |
| `0 18 * * 0` | Resumo semanal para atletas |
| `0 8 * * 1` | Digest semanal para coaches |
| `0 */6 * * *` | Pre-warm do cache de rankings |
| `0 2 * * *` | Refresh proativo de tokens Garmin |

---

## Modelos de Dados Principais (Prisma)

```
User (id, email, name, role: ATHLETE|COACH|ADMIN|SUPER_ADMIN)
  ├── AthleteProfile (coachId, level, VDOT, hrZones, paceZones)
  ├── CoachProfile (slug, bio, branding)
  ├── TrainingPlan → Workout → WorkoutResult
  ├── OnboardingProfile (answers JSON, aiSummary, status)
  ├── PhysicalAssessment (weight, VO2max, VDOT, hrZones, aiAnalysis)
  ├── Subscription (provider, status, planType, currentPeriodEnd)
  ├── FitnessIntegration (provider, accessToken encrypted, refreshToken)
  ├── GarminHealthSnapshot (date, hrv, sleepHours, stressScore, steps)
  └── Notification (type, title, body, read)

CoachBrainSession (coachId, messages JSON, context JSON)
AIJob (type, status, retries, maxRetries, payload JSON, result JSON)
OnboardingForm → OnboardingQuestion (type: TEXT|SELECT|SCALE|DATE|...)
```

---

## Segurança

| Controle | Implementação |
|----------|--------------|
| Autenticação | JWT Bearer + Passport |
| Autorização | `RolesGuard` + `@Roles()` decorator |
| Rate limiting | `@nestjs/throttler` (global 100/min + por endpoint) |
| Headers | Helmet com CSP em produção |
| CORS | Allowlist explícita de origens |
| Validação | `ValidationPipe` com `whitelist: true`, `forbidNonWhitelisted: true` |
| Webhooks | HMAC-SHA256 (MercadoPago), `stripe.webhooks.constructEvent` (Stripe), `X-Garmin-Signature` |
| BYOK keys | AES-256-CBC (chave derivada de `API_KEY_ENCRYPTION_SECRET`) |
| Senhas | bcrypt com salt 10 |
| SQL Injection | Prisma ORM (queries parametrizadas) |
| Raw body | Preservado apenas para `/payments/webhook` |

---

## Variáveis de Ambiente (Railway)

### Obrigatórias (crash se ausentes)
```
JWT_SECRET
JWT_REFRESH_SECRET
DATABASE_URL
```

### Recomendadas (warn se ausentes)
```
PAGARME_API_KEY           # alias para MERCADO_PAGO_ACCESS_TOKEN
PAGARME_WEBHOOK_SECRET    # alias para MERCADO_PAGO_WEBHOOK_SECRET
SENTRY_DSN
```

### Opcionais (features degradam graciosamente)
```
ANTHROPIC_API_KEY         # CoachBrain (fallback para BYOK)
OPENAI_API_KEY            # CoachBrain OpenAI provider
GEMINI_API_KEY            # CoachBrain Gemini provider
GROK_API_KEY              # CoachBrain Grok provider
API_KEY_ENCRYPTION_SECRET # Criptografia BYOK (32+ chars)
RESEND_API_KEY            # Envio de emails
GARMIN_CLIENT_ID / GARMIN_CLIENT_SECRET
STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET
GOOGLE_FIT_CLIENT_ID / GOOGLE_FIT_CLIENT_SECRET / GOOGLE_FIT_REDIRECT_URI
MERCADO_PAGO_ACCESS_TOKEN / MERCADO_PAGO_WEBHOOK_SECRET
STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET / STRIPE_PUBLISHABLE_KEY
ALLOWED_ORIGINS           # CORS (vírgula separado)
APP_URL                   # URL pública do frontend
```

---

## Fluxos Principais

### Onboarding de Atleta
```
Atleta → GET /onboarding/public/:slug (form + branding do coach)
       → POST /onboarding/public/:slug/submit (dados + respostas)
         ├── Cria User (ATHLETE) com senha temporária
         ├── Email com credenciais de acesso
         ├── Notificação imediata ao coach
         └── AIJob async → Claude analisa → coach notificado
       → POST /onboarding/public/:slug/checkout
         └── MercadoPago preapproval → checkoutUrl
       → Atleta paga → webhook → Subscription criada
```

### CoachBrain Chat
```
Coach → POST /coach-brain/chat { message, sessionId? }
      → buildContext() [busca atletas + treinos + Garmin + avaliações]
      → Sistema SSE streaming { chunk: "..." }
      → CoachBrainSession salvo com histórico
```

### Sincronização Garmin
```
Garmin Health API → POST /webhooks/garmin/health
                  → GarminHealthSnapshot criado/atualizado
                  → Se HRV < 30: Notification para coach
                  → Scheduler 0 7 * * * processa HRV alerts
```

---

## Testes

```bash
# Unit tests (mocked DB — sem banco necessário)
cd apps/api && npx jest --no-coverage

# Typecheck completo
cd apps/api && npx tsc --noEmit
cd apps/web && npx tsc --noEmit

# E2E (requer API rodando)
TEST_API_URL=http://localhost:3000 npx jest --config jest-e2e.config.js

# Suite específica
npx jest --testPathPattern="onboarding"
npx jest --testPathPattern="coach-brain"
```

### Cobertura atual
| Módulo | Unit | E2E |
|--------|------|-----|
| Auth | ✅ | ✅ |
| Onboarding | ✅ | ✅ |
| CoachBrain | ✅ | — |
| Payments | ✅ | — |
| Workouts | — | ✅ |
| Nutrition | — | ✅ |
| RBAC | — | ✅ |
| Webhooks | — | ✅ |

---

## Deploy

```bash
# API (Railway) — automático em push para main
railway up --service rr-api

# Web (Vercel) — automático via GitHub integration
vercel --prod

# Migrations em produção
railway run --service rr-api -- npx prisma migrate deploy
```

Ver `docs/runbooks/deployment-rollback.md` para rollback.
