-- AlterTable: TenantBranding — add secondaryColor and niche
ALTER TABLE "tenant_brandings" ADD COLUMN "secondary_color" TEXT DEFAULT '#1F2937';
ALTER TABLE "tenant_brandings" ADD COLUMN "niche" TEXT DEFAULT 'running';

-- AlterTable: WorkoutResult — add feedback fields
ALTER TABLE "workout_results" ADD COLUMN "rpe" INTEGER;
ALTER TABLE "workout_results" ADD COLUMN "sensation_score" INTEGER;
ALTER TABLE "workout_results" ADD COLUMN "athlete_feedback" TEXT;
