# Inventário Técnico — RR Rafinha Running

> **Modo:** somente-leitura (nenhum código alterado para gerar este documento).
> **Data:** 2026-06-28 · **Método:** verificação direta de schema Prisma, controllers/services, `.env`, telas e build (sem achismo).
> **Legenda:** ✅ EXISTE · 🟡 PARCIAL · ❌ NÃO EXISTE

---

## A) Stack e estado geral

| Capacidade | Status | Onde | O que falta |
|---|---|---|---|
| Frontend web | ✅ | `apps/web` — **Next.js 14.2.35** (App Router), React 18.3, Tailwind, recharts 2.15, mapbox-gl 3.20, PWA | — |
| Frontend mobile | ✅ | `apps/mobile` — **Expo ~52**, React Native 0.76.9, react-query 5, expo-router | — |
| Backend | ✅ | `apps/api` — **NestJS 11**, Express, Prisma 6, Pino, Sentry. Roda no **Railway** (`railway.toml`: `prisma migrate deploy && node dist/main`) | — |
| Banco | ✅ | **PostgreSQL via Supabase** (prod ref `kcyoffkitnviuriceasm`). **47 models** Prisma, 31 enums | Migrations não reconstroem do zero (ver Riscos) |
| Build web | ✅ | `tsc --noEmit` passa (0 erros) | — |
| Build mobile | ✅ | `tsc --noEmit` passa (0 erros). ⚠️ runtime Expo não testado neste ambiente | Validação em device/simulador |
| Build API | ✅ | `tsc --noEmit` passa; `nest build` ok | — |
| Testes automatizados | ✅ | **172 unit** (Jest, mocked) + **73 e2e** passam; 3 e2e skipped (bug webhook) | Cobertura irregular (Workouts/Nutrition só e2e) |
| Autenticação | ✅ | `modules/auth` — JWT (access 15min + refresh 7d), Google OAuth (`idToken`), Apple (`identityToken`), senha temp. p/ atleta onboardado. `RolesGuard` + `@Roles()` | — |
| Papéis (roles) | ✅ | enum `UserRole`: **ATHLETE · COACH · ADMIN · SUPER_ADMIN** | — |

**Módulos da API (35):** admin, ai-assistant, ai-training, appointments, athlete-documents, auth, badges, branding, cache, chat, coach-brain, email, events, health, integrations, invites, live-tracking, niche, notifications, nutrition, onboarding, payments, physical-assessments, platform, rankings, referrals, reports, scheduler, store, testimonials, training-plans, uploads, users, whatsapp, workouts.

---

## B) Plataforma de eventos

| Capacidade | Status | Onde | O que falta |
|---|---|---|---|
| Criar/cadastrar eventos (admin) | ✅ | `POST/PUT /events`, model `Event` (título, data, local, modality, preço, kit, status, tags, geo) | UI de admin web existe (`dashboard/events`) |
| Distâncias por evento | ✅ | model `EventDistance`, `POST/GET /events/:id/distances` | — |
| Inscrição de atletas | ✅ | `POST /events/:id/register`, model `EventRegistration`, `GET /events/registrations/my` | **Mobile não chama esse endpoint** — fluxo de inscrição é fake (ver Riscos) |
| Geração REAL de bib (servidor) | ✅ | `events.service.ts:193-194` — `count(+1)` em transação, `padStart(4)` no `bibNumber`. Persistido em `EventRegistration.bibNumber` | Mobile usa `Math.random()` em vez do bib do servidor |
| Retirada de kit (datas/sessões/locais) | ✅ | model `KitDeliverySession`, `POST /events/:id/kit-session`, `GET /events/kit-delivery`, `/kit-delivery/search`, scan QR `/kit-delivery/scan`. Campos `kitType` (COMPLETO/PREMIUM), `kitPickupScheduledAt` | — |
| Listagem eventos atuais/futuros | ✅ | `GET /events` (paginado), index por `eventDate`/`status` | — |
| Cupons de evento | ✅ | model `EventCoupon`/`EventCouponUse`, `POST /events/:id/coupons`, `/validate-coupon` | — |
| Check-in no evento | ✅ | `POST /events/:id/checkin`, `GET /events/:id/attendees` | — |
| Cadastro de patrocinadores/parceiros | ❌ | **Nenhum** model `Partner`/`Sponsor`, nenhum endpoint. No mobile é array hardcoded (`events.tsx` `PARTNERS`) | Modelo + endpoint + admin + UI |
| Newsletter de eventos futuros (email) | ❌ | `EmailService` tem: passwordReset, athleteInvite, subscriptionReminder, weeklyDigest, credentials, weeklySummary, newAthleteAlert, welcome — **nenhum** para eventos | Template + trigger (cron/scheduler) + opt-in |

---

## C) Pagamentos

| Capacidade | Status | Onde | O que falta |
|---|---|---|---|
| Gateway integrado | ✅ | **3 providers**: Stripe (`stripe.service.ts`, SDK real), Mercado Pago (`mercadopago.service.ts`, `fetch` real p/ `api.mercadopago.com`), **Pagar.me v5** (`pagarme.service.ts`, `api.pagar.me/core/v5`) | — |
| Pix | ✅ | `POST /payments/pix` → Pagar.me/MercadoPago (chamadas HTTP reais) | Validar credenciais sandbox/prod |
| Cartão | ✅ | `POST /payments/card`, Stripe subscriptions, MP preapproval | — |
| Fluxo real ou fake (backend) | ✅ real | Services fazem chamadas HTTP reais aos gateways; lazy-init (degrada sem chave) | — |
| Webhook de confirmação | 🟡 | `POST /payments/webhook` (Pagar.me HMAC), `/webhooks/mercadopago`, `/webhooks/stripe` | **Verificação de assinatura quebrada**: `req.rawBody` undefined + checa `PAGARME_WEBHOOK_SECRET` mas env usa `MERCADOPAGO_WEBHOOK_SECRET`. Webhook spoofável (ver Riscos) |
| Fluxo no app mobile | 🟡 fake | `events.tsx` modal tem etapa "payment" mas **não chama** `/payments/*` — é wizard client-side | Ligar UI mobile ao gateway real |

---

## D) Loja / e-commerce

| Capacidade | Status | Onde | O que falta |
|---|---|---|---|
| Modelo de produtos | ✅ | model `Product` (+ enum `ProductCategory`), `GET/POST/PUT/DELETE /store/products`, `/store/public/:coachId/products`, `/store/athlete/products` | — |
| Pedidos / pré-venda | ✅ | model `StoreOrder` (+ enum `StoreOrderStatus`: PENDING_PAYMENT→PAID→…), `POST /store/public/orders`, `GET /store/orders`, controle de estoque | — |
| Cupons de loja | ✅ | model `StoreCoupon`, `POST /store/coupons`, `/store/public/validate-coupon` | — |
| Reaproveita pagamento dos eventos? | 🟡 | `store.service.ts` faz o ciclo de status (`PENDING_PAYMENT`→`PAID`, baixa de estoque) mas **não chama gateway diretamente** | Definir/ligar o checkout real (Pix/cartão) do pedido de loja |
| UI web da loja | ✅ | `apps/web/src/app/loja` consome `/store/public/...` (dado real) | — |
| UI mobile da loja | ❌ fake | `events.tsx` aba "Loja" usa array hardcoded `STORE_ITEMS` | Ligar a `/store/athlete/products` |

---

## E) IA Coach

| Capacidade | Status | Onde | O que falta |
|---|---|---|---|
| Integração com LLM | ✅ | `coach-brain.service.ts` — **Claude/OpenAI/Gemini/Grok** (BYOK, chaves AES-256-CBC). Fallback `ANTHROPIC_API_KEY`. 5×Anthropic, 5×OpenAI, 2×Gemini instanciados | — |
| Chat SSE streaming | ✅ | `POST /coach-brain/chat`, model `CoachBrainSession` (messages JSON) | — |
| Prompt de persona do coach | ✅ | `coach-brain.service.ts` monta `systemPrompt` enviado como `system`/`role:system`/`systemInstruction` por provider | Persona é montada em runtime; não há editor de persona por coach |
| Base de conhecimento | 🟡 | Contexto rico montado por query (atletas + treinos 7d + Garmin + avaliações físicas). Não há KB documental dedicada | RAG/KB documental (se desejado) |
| Memória por atleta (embeddings/pgvector) | ❌ | **Sem** embeddings/pgvector/vector no código. "Memória" = histórico em `CoachBrainSession` + contexto recriado do DB a cada chamada | pgvector + embeddings se quiser memória semântica |
| Geração de treino por IA | ✅ | `ai-training.service.ts` `generatePlan()`, `POST /ai-training/generate-plan` (DTO com objetivo) | — |
| Análise de treino por IA | ✅ | `workouts.service.ts:719` `aiAnalysis` (Claude analisa resultado); comparação de avaliações físicas | — |
| Sistema de jobs IA assíncrono | ✅ | model `AIJob` (PENDING→RUNNING→SUCCESS/FAILED, retries), scheduler de retry | — |

---

## F) Wearable

| Capacidade | Status | Onde | O que falta |
|---|---|---|---|
| Provedores suportados (modelo) | ✅ | enum `IntegrationProvider`: **GARMIN · STRAVA · APPLE_HEALTH · GOOGLE_FIT · COROS · POLAR**. model `FitnessIntegration` (tokens criptografados) | — |
| Garmin | 🟡 | `integrations/garmin/garmin.service.ts` — **HTTP real** (OAuth token, Wellness API, Training API push, Schedule API). Webhook `/webhooks/garmin/*` | Credenciais + aprovação no **Garmin Developer Program** (prod) |
| Strava | 🟡 | `integrations/strava/*`, OAuth + pull de atividades + webhook `/webhooks/strava` | Credenciais (`STRAVA_CLIENT_ID/SECRET` no `.env`) + validar |
| COROS / Polar / Google Fit | 🟡 | `integrations/coros`, `/google-fit`; env de COROS/POLAR/GOOGLE_FIT só no `.env.example` | Credenciais não setadas em prod |
| Apple Health / HealthKit | 🟡 | `apps/mobile/src/services/apple-health.service.ts` + `app/(athlete)/integrations.tsx`; enum `APPLE_HEALTH` | Validar leitura HealthKit em device iOS real |
| Modelo de treinos realizados | ✅ | models `Workout`, `WorkoutResult` (+ `WorkoutSource`, `WorkoutType`, `WorkoutStatus`), `GarminHealthSnapshot` (HRV/sono/estresse) | — |
| Matching de atividade→treino | ✅ | Lógica por data + distância ±10% (services de integração) | — |

> Resumo F: a **infra de wearable é real** (código HTTP de verdade), o que falta é **credenciais/aprovação dos provedores** (trabalho de configuração, não de código). Só GARMIN e STRAVA têm chaves no `.env` de prod hoje.

---

## G) White-label / Multi-tenant

| Capacidade | Status | Onde | O que falta |
|---|---|---|---|
| Conceito de tenant/equipe | 🟡 | Isolamento por **`coachId`** na camada de aplicação (52 ocorrências no schema; `RolesGuard` + `where coachId` nos services). Não há entidade "Team" genérica | Modelo de "equipe" explícito (se desejado além de coach) |
| Isolamento por tenant (RLS) | ❌ | **Sem Row Level Security** no Postgres (nenhuma `CREATE POLICY` nas migrations). Isolamento é só na aplicação | RLS no banco para defesa em profundidade (opcional) |
| White-label (marca por conta) | ✅ | model `WhiteLabelAccount` (brandName, customDomain, logoUrl, primaryColor, maxCoaches, status) + `CoachSubscription` + `PlatformPlan` | UI/fluxo de provisionamento de white-label |
| Branding por coach/equipe | ✅ | model `TenantBranding` + `modules/branding` (`/config/branding`, upload logo), enum `SportNiche` por coach/atleta | — |
| Papéis multinível | ✅ | ATHLETE · COACH · ADMIN · SUPER_ADMIN; rotas `/platform/admin/*` e `/admin/*` | — |

---

## Resumo executivo

### Quão "real" é o app?
- **Backend / API: ~90-95% real.** 47 models, 35 módulos, 172 unit + 73 e2e passando. Pagamentos, eventos (com bib real), loja, IA coach, wearables — tudo com lógica de verdade. Buracos pontuais (webhook, partners, newsletter).
- **Web: ~85% real.** Telas autenticadas usam API real (dashboard agora sem demo-mode fake). Fake remanescente: **landing de marketing** (depoimentos, preços, social-proof hardcoded).
- **Mobile: ~70% real.** A maioria das telas usa API (dashboard, ranking, calendário, notificações, perfil, performance). Fake concentrado em **2 telas**: `events.tsx` (eventos/loja/corridas/parceiros/inscrição todos hardcoded) e `nutrition.tsx` (refeições/suplementos com fallback fake).

> **Estimativa global: ~80-85% real, ~15-20% fake** — e o fake é **concentrado e conhecido** (não espalhado), com API real já existente para a maior parte dele.

### Os 3 maiores buracos
1. **`events.tsx` (mobile) é fake de ponta a ponta** — apesar da API de eventos ser completa (inscrição, bib real, kit, distâncias). É um *rebuild* da feature de inscrição contra os endpoints reais.
2. **Reprodutibilidade de migrations** — o histórico Prisma não reconstrói o banco do zero (20 tabelas + 16 colunas + 6 enums vieram de `db push`). Baseline de squash pronta; cut-over é trabalho de infra.
3. **Features sem backend:** patrocinadores/parceiros e newsletter de eventos não têm modelo/endpoint (decisão: construir).

### Os 3 maiores riscos para uma demo com cliente
1. **`events.tsx` mostra dados fake e fluxo de inscrição que não persiste** (bib via `Math.random()`, loja/corridas/parceiros inventados) — alto risco visual se a demo passar por essa tela.
2. **Webhook de pagamento com verificação de assinatura quebrada** (`req.rawBody` undefined + nome de env divergente) — segurança; webhooks de pagamento spoofáveis. Deferido à fase de pagamento.
3. **`nutrition.tsx` tem fallback silencioso para refeições/suplementos fake** — se a API retornar vazio, o atleta vê dados que não são dele (parece real, mas é demo).

### Notas de contexto (já resolvidos nesta frente de trabalho)
- ✅ Demo Mode fake do dashboard web **removido** (commit `5c1d8ca`).
- ✅ Boot da API agora **degrada graciosamente** sem credenciais externas (commit `68536cf`).
- ✅ Suíte e2e **corrigida** (drift de versão/rota), 73 passando (commit `48e4c77`).
