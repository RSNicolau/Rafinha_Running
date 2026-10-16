-- Equipes (assessorias) como tenant: teams, team_members, team_plans, athlete_memberships.

-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('OWNER', 'ADMIN', 'COACH', 'STAFF');

-- CreateEnum
CREATE TYPE "TeamStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELED');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL');

-- AlterEnum
ALTER TYPE "PaymentPurpose" ADD VALUE 'MEMBERSHIP';

-- AlterTable
ALTER TABLE "athlete_profiles" ADD COLUMN     "team_id" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "membership_id" TEXT,
ADD COLUMN     "team_id" TEXT;

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "status" "TeamStatus" NOT NULL DEFAULT 'ACTIVE',
    "logo_url" TEXT,
    "primary_color" TEXT,
    "city" TEXT,
    "asaas_wallet_id" TEXT,
    "platform_fee_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grace_days" INTEGER NOT NULL DEFAULT 5,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'COACH',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_plans" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "interval" "BillingInterval" NOT NULL DEFAULT 'MONTHLY',
    "price_in_cents" INTEGER NOT NULL,
    "benefits" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "athlete_memberships" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "athlete_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'PENDING',
    "provider" "PaymentProvider" NOT NULL DEFAULT 'ASAAS',
    "external_subscription_id" TEXT,
    "price_in_cents" INTEGER NOT NULL,
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "next_due_date" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "athlete_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "teams_slug_key" ON "teams"("slug");

-- CreateIndex
CREATE INDEX "teams_owner_id_idx" ON "teams"("owner_id");

-- CreateIndex
CREATE INDEX "team_members_user_id_idx" ON "team_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_team_id_user_id_key" ON "team_members"("team_id", "user_id");

-- CreateIndex
CREATE INDEX "team_plans_team_id_is_active_idx" ON "team_plans"("team_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "athlete_memberships_external_subscription_id_key" ON "athlete_memberships"("external_subscription_id");

-- CreateIndex
CREATE INDEX "athlete_memberships_team_id_status_idx" ON "athlete_memberships"("team_id", "status");

-- CreateIndex
CREATE INDEX "athlete_memberships_athlete_id_idx" ON "athlete_memberships"("athlete_id");

-- CreateIndex
CREATE INDEX "athlete_memberships_next_due_date_idx" ON "athlete_memberships"("next_due_date");

-- CreateIndex
CREATE INDEX "athlete_profiles_team_id_idx" ON "athlete_profiles"("team_id");

-- CreateIndex
CREATE INDEX "payments_membership_id_idx" ON "payments"("membership_id");

-- CreateIndex
CREATE INDEX "payments_team_id_idx" ON "payments"("team_id");

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_plans" ADD CONSTRAINT "team_plans_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_memberships" ADD CONSTRAINT "athlete_memberships_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_memberships" ADD CONSTRAINT "athlete_memberships_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_memberships" ADD CONSTRAINT "athlete_memberships_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "team_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_profiles" ADD CONSTRAINT "athlete_profiles_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ── Backfill: todo treinador existente vira dono de uma equipe (treinador solo = equipe de 1) ──
INSERT INTO "teams" ("id", "name", "slug", "owner_id", "platform_fee_percent", "created_at", "updated_at")
SELECT gen_random_uuid()::text,
       u."name",
       COALESCE(NULLIF(cp."slug", ''), 'equipe-' || substr(replace(u."id", '-', ''), 1, 10)),
       u."id",
       COALESCE(cp."platform_fee_percent", 0),
       NOW(), NOW()
FROM "users" u
JOIN "coach_profiles" cp ON cp."user_id" = u."id"
WHERE u."deleted_at" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "teams" t WHERE t."owner_id" = u."id");

INSERT INTO "team_members" ("id", "team_id", "user_id", "role", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid()::text, t."id", t."owner_id", 'OWNER', true, NOW(), NOW()
FROM "teams" t
WHERE NOT EXISTS (SELECT 1 FROM "team_members" m WHERE m."team_id" = t."id" AND m."user_id" = t."owner_id");

-- Atletas passam a pertencer à equipe do seu treinador atual
UPDATE "athlete_profiles" ap
SET "team_id" = t."id"
FROM "teams" t
WHERE ap."coach_id" = t."owner_id" AND ap."team_id" IS NULL;
