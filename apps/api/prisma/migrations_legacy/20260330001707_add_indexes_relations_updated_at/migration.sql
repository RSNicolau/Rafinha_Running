-- AlterTable: add updated_at with default for backfill, then remove default (Prisma handles @updatedAt in app layer)
ALTER TABLE "conversations" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT NOW();
ALTER TABLE "event_registrations" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT NOW();
ALTER TABLE "messages" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT NOW();
ALTER TABLE "notifications" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT NOW();
ALTER TABLE "payments" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT NOW();
ALTER TABLE "workout_results" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT NOW();

-- CreateIndex
CREATE INDEX "event_registrations_status_idx" ON "event_registrations"("status");

-- CreateIndex
CREATE INDEX "event_registrations_paymentStatus_idx" ON "event_registrations"("paymentStatus");

-- CreateIndex
CREATE INDEX "events_modality_idx" ON "events"("modality");

-- CreateIndex
CREATE INDEX "fitness_integrations_is_active_idx" ON "fitness_integrations"("is_active");

-- CreateIndex
CREATE INDEX "fitness_integrations_provider_idx" ON "fitness_integrations"("provider");

-- CreateIndex
CREATE INDEX "notifications_type_idx" ON "notifications"("type");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_subscription_id_idx" ON "payments"("subscription_id");

-- CreateIndex
CREATE INDEX "subscriptions_provider_idx" ON "subscriptions"("provider");

-- CreateIndex
CREATE INDEX "training_plans_status_idx" ON "training_plans"("status");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_is_active_idx" ON "users"("is_active");

-- CreateIndex
CREATE INDEX "workouts_type_idx" ON "workouts"("type");

-- AddForeignKey
ALTER TABLE "athlete_profiles" ADD CONSTRAINT "athlete_profiles_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
