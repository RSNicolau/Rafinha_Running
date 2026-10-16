-- Add AI provider settings to users (coach only fields)
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "ai_provider" TEXT NOT NULL DEFAULT 'anthropic',
  ADD COLUMN IF NOT EXISTS "ai_model"    TEXT,
  ADD COLUMN IF NOT EXISTS "ai_byok"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ai_api_key"  TEXT;
