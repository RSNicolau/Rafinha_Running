-- Unique index to prevent duplicate pending PIX payments for the same user/plan
-- This prevents race conditions when two requests arrive simultaneously
CREATE UNIQUE INDEX IF NOT EXISTS "payments_pix_idempotency_idx"
  ON "payments" ("user_id", "provider", "status", "plan_id")
  WHERE "status" = 'PENDING' AND "provider" = 'PAGARME';
