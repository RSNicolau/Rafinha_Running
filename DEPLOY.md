# Deployment Runbook — RR Rafinha Running

## Architecture Overview

| Service | Platform | Notes |
|---------|----------|-------|
| Web (Next.js) | Vercel | Serverless, auto-deploys from `main` |
| API (NestJS) | Railway | Persistent server — required for WebSockets |
| Database | Supabase | Managed PostgreSQL with PgBouncer |
| Mobile (Expo) | EAS Build | Distributes to App Store + Play Store |

---

## Step 1 — Supabase (Database)

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Choose a region close to your users (e.g. South America East for Brazil).
3. Once the project is ready, go to **Settings → Database**.
4. Copy both connection strings:
   - **Connection string (Transaction mode / PgBouncer)** → this becomes `DATABASE_URL`
     - Append `?pgbouncer=true` if not already present.
   - **Direct connection string** → this becomes `DIRECT_URL`
5. Run migrations against the database:
   ```bash
   # From repo root — requires DATABASE_URL and DIRECT_URL set locally
   pnpm db:migrate:prod
   ```
6. (Optional) Open Prisma Studio to verify the schema:
   ```bash
   pnpm db:studio
   ```

---

## Step 2 — Railway (NestJS API)

1. Go to [railway.app](https://railway.app) and create a new project.
2. Click **New Service → GitHub Repo** and connect the monorepo.
3. Set the **Root Directory** to `/` (leave at repo root — `railway.toml` handles the rest).
4. Railway will auto-detect `apps/api/railway.toml` and use Nixpacks.
5. Add a **Redis** addon from the Railway dashboard (BullMQ requires Redis).
6. Under **Variables**, add all values from `apps/api/.env.example`:
   - `DATABASE_URL` — Supabase PgBouncer URL
   - `DIRECT_URL` — Supabase direct URL
   - `REDIS_URL` — Railway Redis addon URL (available as `${{Redis.REDIS_URL}}`)
   - `JWT_SECRET` — generate with `openssl rand -base64 48`
   - `JWT_REFRESH_SECRET` — generate with `openssl rand -base64 48`
   - All payment, OAuth, and push notification credentials
7. Deploy and confirm the health check passes:
   ```
   GET https://your-api.railway.app/health → 200 OK
   ```
8. Copy the Railway public URL (e.g. `https://rr-api-production.up.railway.app`).

> **Alternative: Docker deploy**
> If Nixpacks has issues with the monorepo, use the `apps/api/Dockerfile` instead.
> In Railway: **Settings → Build** → select **Dockerfile** and set path to `apps/api/Dockerfile`.

---

## Step 3 — Vercel (Next.js Web)

1. Go to [vercel.com](https://vercel.com) and click **Add New Project**.
2. Import the GitHub repository.
3. Set **Root Directory** to `apps/web` — OR leave at root and let `apps/web/vercel.json` handle the build command.
4. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_API_URL` → Railway API URL from Step 2
   - `NEXT_PUBLIC_MAPBOX_TOKEN` → see Step 4
5. Click **Deploy**.
6. Copy the Vercel deployment URL and set it as `FRONTEND_URL` in Railway.

---

## Step 4 — Mapbox Token

1. Create an account at [mapbox.com](https://account.mapbox.com/auth/signup/).
2. Go to **Account → Access Tokens**.
3. Copy the **Default public token** (starts with `pk.eyJ1`).
4. Add it to Vercel env var `NEXT_PUBLIC_MAPBOX_TOKEN`.
5. Redeploy Vercel if needed.

---

## Step 5 — Payment Providers

### Pagar.me (Brazil)
1. Create an account at [pagar.me](https://pagar.me).
2. Go to **Dashboard → Configurações → API Keys**.
3. Copy the live secret key (`sk_live_...`) → `PAGARME_API_KEY` in Railway.
4. Register the webhook:
   - URL: `https://your-api.railway.app/payments/webhook`
   - Events: `charge.paid`, `charge.failed`, `subscription.canceled`
5. Copy the webhook signing secret → `PAGARME_WEBHOOK_SECRET` in Railway.

### Stripe (International)
1. Go to [dashboard.stripe.com](https://dashboard.stripe.com).
2. Copy secret key → `STRIPE_SECRET_KEY`.
3. Create products/prices for monthly and annual plans → copy Price IDs.
4. Register webhook at `https://your-api.railway.app/payments/stripe/webhook`.

### Mercado Pago (Brazil alternative)
1. Go to [mercadopago.com.br/developers](https://www.mercadopago.com.br/developers).
2. Copy production access token → `MERCADOPAGO_ACCESS_TOKEN`.
3. Register webhook at `https://your-api.railway.app/payments/mercadopago/webhook`.

---

## Step 6 — EAS Mobile Build (Expo)

### Prerequisites
```bash
npm install -g eas-cli
eas login
```

### First-time setup
```bash
cd apps/mobile

# Link to your Expo account
eas project:init
```

Update `eas.json` submit section with your real credentials:
- `appleId` — your Apple Developer email
- `ascAppId` — App Store Connect App ID (found in App Store Connect → App → General)
- `appleTeamId` — Apple Developer Team ID
- `serviceAccountKeyPath` — path to your Google Play service account JSON

### Build for all platforms
```bash
# Production build (App Store + Play Store)
eas build --platform all --profile production

# Preview build (internal testing, APK + IPA)
eas build --platform all --profile preview

# Development build (runs on simulator/device with dev client)
eas build --platform all --profile development
```

### Submit to stores
```bash
# After a successful production build
eas submit --platform all --profile production
```

### OTA Updates (without a new store release)
```bash
eas update --branch production --message "Describe what changed"
```

---

## Step 7 — Post-Deploy Checklist

- [ ] `GET https://your-api.railway.app/health` returns `200 OK`
- [ ] `GET https://your-app.vercel.app` loads without errors
- [ ] Web app connects to API (check browser network tab — no CORS errors)
- [ ] Create first coach account via the web app or API (`POST /auth/register`)
- [ ] Verify Supabase has the `users` table populated after registration
- [ ] Send a test push notification via Expo dashboard
- [ ] Run a test payment through Pagar.me sandbox
- [ ] Confirm webhook is received by the API (`/payments/webhook` logs in Railway)
- [ ] Strava OAuth flow: connect an account and verify activity sync
- [ ] Garmin OAuth flow: connect an account and verify workout push
- [ ] Download the mobile app (preview build) and log in with the coach account

---

## Environment Variables Reference

| Variable | Service | Where to get it |
|----------|---------|-----------------|
| `DATABASE_URL` | Railway | Supabase → Settings → Database (Transaction mode) |
| `DIRECT_URL` | Railway | Supabase → Settings → Database (Direct connection) |
| `REDIS_URL` | Railway | Railway Redis addon |
| `JWT_SECRET` | Railway | `openssl rand -base64 48` |
| `NEXT_PUBLIC_API_URL` | Vercel | Railway public URL |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Vercel | Mapbox account → Access tokens |
| `PAGARME_API_KEY` | Railway | Pagar.me dashboard → API Keys |
| `STRAVA_CLIENT_ID` | Railway | Strava API application settings |
| `EXPO_ACCESS_TOKEN` | Railway | expo.dev → Access tokens |

---

## Useful Commands

```bash
# Run migrations in production
pnpm db:migrate:prod

# Open Prisma Studio (local, needs DATABASE_URL in .env)
pnpm db:studio

# Deploy web to Vercel from CLI
pnpm deploy:web

# Check Railway logs
railway logs --tail

# Trigger a new Vercel deployment
vercel --prod --cwd apps/web
```
