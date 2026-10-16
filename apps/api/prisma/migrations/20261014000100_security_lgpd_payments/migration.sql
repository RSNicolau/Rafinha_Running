-- Segurança + LGPD + pagamentos (Asaas/Stripe) + loja com encomendas + gestão de eventos.

-- Antes do índice único (event_id, bib_number): números de peito duplicados de dados antigos
-- recebem sufixo "-dupN" para não quebrar a migração (o organizador pode reatribuir depois).
DO $$
BEGIN
  IF to_regclass('public.event_registrations') IS NOT NULL THEN
    WITH d AS (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY event_id, bib_number ORDER BY registered_at, id) AS rn
      FROM event_registrations WHERE bib_number IS NOT NULL
    )
    UPDATE event_registrations er SET bib_number = er.bib_number || '-dup' || d.rn
    FROM d WHERE er.id = d.id AND d.rn > 1;
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "PaymentPurpose" AS ENUM ('SUBSCRIPTION', 'STORE_ORDER', 'EVENT_REGISTRATION', 'PLATFORM_PLAN');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('TERMS', 'PRIVACY', 'MARKETING', 'HEALTH_DATA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentProvider" ADD VALUE 'ASAAS';
ALTER TYPE "PaymentProvider" ADD VALUE 'FAKE';

-- AlterEnum
ALTER TYPE "StoreOrderStatus" ADD VALUE 'READY_FOR_PICKUP';

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_user_id_fkey";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "asaas_customer_id" TEXT,
ADD COLUMN     "marketing_opt_in" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "privacy_version" TEXT,
ADD COLUMN     "terms_accepted_at" TIMESTAMP(3),
ADD COLUMN     "terms_version" TEXT,
ADD COLUMN     "token_version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "access_token_hash" TEXT,
ADD COLUMN     "checkout_url" TEXT,
ADD COLUMN     "event_registration_id" TEXT,
ADD COLUMN     "expires_at" TIMESTAMP(3),
ADD COLUMN     "failure_reason" TEXT,
ADD COLUMN     "method" TEXT,
ADD COLUMN     "purpose" "PaymentPurpose" NOT NULL DEFAULT 'SUBSCRIPTION',
ADD COLUMN     "refunded_at" TIMESTAMP(3),
ADD COLUMN     "store_order_id" TEXT,
ALTER COLUMN "user_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "bib_seq" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "event_registrations" ADD COLUMN     "payment_expires_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "estimated_delivery" TIMESTAMP(3),
ADD COLUMN     "is_pre_order" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pre_order_deadline" TIMESTAMP(3),
ADD COLUMN     "pre_order_limit" INTEGER;

-- AlterTable
ALTER TABLE "store_orders" ADD COLUMN     "access_token_hash" TEXT,
ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "delivery_method" TEXT,
ADD COLUMN     "expires_at" TIMESTAMP(3),
ADD COLUMN     "is_pre_order" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paid_at" TIMESTAMP(3),
ADD COLUMN     "status_updated_at" TIMESTAMP(3),
ADD COLUMN     "tracking_code" TEXT;

-- AlterTable
ALTER TABLE "whatsapp_configs" ADD COLUMN     "webhook_secret" TEXT;

-- CreateTable
CREATE TABLE "consent_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "ConsentType" NOT NULL,
    "version" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT true,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consent_logs_user_id_type_idx" ON "consent_logs"("user_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "users_asaas_customer_id_key" ON "users"("asaas_customer_id");

-- CreateIndex
CREATE INDEX "payments_store_order_id_idx" ON "payments"("store_order_id");

-- CreateIndex
CREATE INDEX "payments_event_registration_id_idx" ON "payments"("event_registration_id");

-- CreateIndex
CREATE INDEX "event_registrations_payment_expires_at_idx" ON "event_registrations"("payment_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "event_registrations_event_id_bib_number_key" ON "event_registrations"("event_id", "bib_number");

-- CreateIndex
CREATE INDEX "store_orders_expires_at_idx" ON "store_orders"("expires_at");

-- AddForeignKey
ALTER TABLE "consent_logs" ADD CONSTRAINT "consent_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

