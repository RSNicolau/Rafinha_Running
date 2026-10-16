-- Add PAGARME to PaymentProvider enum
ALTER TYPE "PaymentProvider" ADD VALUE 'PAGARME';

-- Make subscriptionId optional on payments (allow Pagar.me one-off payments without a subscription)
ALTER TABLE "payments" ALTER COLUMN "subscription_id" DROP NOT NULL;

-- Drop and re-add the FK constraint as optional
ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_subscription_id_fkey";
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_subscription_id_fkey"
  FOREIGN KEY ("subscription_id")
  REFERENCES "subscriptions"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- Add Pagar.me specific columns
ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "pix_qr_code"     TEXT,
  ADD COLUMN IF NOT EXISTS "pix_qr_code_url" TEXT,
  ADD COLUMN IF NOT EXISTS "pix_expires_at"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "plan_id"         TEXT;
