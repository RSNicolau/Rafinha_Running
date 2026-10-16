-- CreateEnum
CREATE TYPE "SportNiche" AS ENUM ('RUNNING', 'CYCLING', 'TRIATHLON', 'SWIMMING', 'CROSSFIT', 'FITNESS', 'GENERAL');

-- AlterTable coach_profiles
ALTER TABLE "coach_profiles"
  ADD COLUMN "niche"        "SportNiche" NOT NULL DEFAULT 'RUNNING',
  ADD COLUMN "niche_config" JSONB;

-- AlterTable athlete_profiles
ALTER TABLE "athlete_profiles"
  ADD COLUMN "niche" "SportNiche" NOT NULL DEFAULT 'RUNNING';

-- AlterTable onboarding_forms
ALTER TABLE "onboarding_forms"
  ADD COLUMN "niche" "SportNiche" NOT NULL DEFAULT 'RUNNING';
