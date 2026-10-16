-- Per-coach payment gateway settings (Modelo 2 — BYOK)
ALTER TABLE "coach_profiles"
  ADD COLUMN IF NOT EXISTS "payment_provider"       TEXT DEFAULT 'pagarme',
  ADD COLUMN IF NOT EXISTS "pagarme_api_key"        TEXT,
  ADD COLUMN IF NOT EXISTS "pagarme_webhook_secret" TEXT,
  ADD COLUMN IF NOT EXISTS "stripe_secret_key"      TEXT,
  ADD COLUMN IF NOT EXISTS "stripe_webhook_secret"  TEXT,
  ADD COLUMN IF NOT EXISTS "payment_enabled"        BOOLEAN NOT NULL DEFAULT false;
