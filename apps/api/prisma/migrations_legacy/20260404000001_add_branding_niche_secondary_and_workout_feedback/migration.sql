-- AlterTable: TenantBranding — add secondaryColor and niche (IF NOT EXISTS = idempotent)
ALTER TABLE "tenant_brandings" ADD COLUMN IF NOT EXISTS "secondary_color" TEXT DEFAULT '#1F2937';
ALTER TABLE "tenant_brandings" ADD COLUMN IF NOT EXISTS "niche" TEXT DEFAULT 'running';

-- AlterTable: WorkoutResult — add feedback fields
ALTER TABLE "workout_results" ADD COLUMN IF NOT EXISTS "rpe" INTEGER;
ALTER TABLE "workout_results" ADD COLUMN IF NOT EXISTS "sensation_score" INTEGER;
ALTER TABLE "workout_results" ADD COLUMN IF NOT EXISTS "athlete_feedback" TEXT;
