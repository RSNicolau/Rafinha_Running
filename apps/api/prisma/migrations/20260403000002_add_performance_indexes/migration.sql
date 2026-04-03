-- Index on workout completedAt for analytics and history queries
CREATE INDEX IF NOT EXISTS "workouts_completed_at_idx" ON "workouts"("completed_at");

-- Index on workout_results createdAt for history ordering
CREATE INDEX IF NOT EXISTS "workout_results_created_at_idx" ON "workout_results"("created_at");

-- Index on payments paidAt for financial reports
CREATE INDEX IF NOT EXISTS "payments_paid_at_idx" ON "payments"("paid_at");

-- Index on messages senderId for chat queries
CREATE INDEX IF NOT EXISTS "messages_sender_id_idx" ON "messages"("sender_id");

-- Index on fitness_integrations expiresAt for token cleanup
CREATE INDEX IF NOT EXISTS "fitness_integrations_expires_at_idx" ON "fitness_integrations"("expires_at");

-- Index on nutrition_logs userId+date for daily summary queries
CREATE INDEX IF NOT EXISTS "nutrition_logs_user_date_idx" ON "nutrition_logs"("user_id", "date");

-- Index on water_logs userId+date for daily water queries
CREATE INDEX IF NOT EXISTS "water_logs_user_date_idx" ON "water_logs"("user_id", "date");
