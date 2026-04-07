-- Add Apple Sign In support
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "apple_id" TEXT;
ALTER TABLE "users" ADD CONSTRAINT "users_apple_id_key" UNIQUE ("apple_id");

-- Make email optional (Apple can return null email with private relay)
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

-- Add CoachBrainSession model
CREATE TABLE IF NOT EXISTS "coach_brain_sessions" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Nova conversa',
    "messages" JSONB NOT NULL DEFAULT '[]',
    "context" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "coach_brain_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "coach_brain_sessions_coach_id_idx" ON "coach_brain_sessions"("coach_id");

ALTER TABLE "coach_brain_sessions"
    ADD CONSTRAINT "coach_brain_sessions_coach_id_fkey"
    FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add AIJob model
CREATE TABLE IF NOT EXISTS "ai_jobs" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "retries" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "coach_id" TEXT,
    "athlete_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ai_jobs_status_idx" ON "ai_jobs"("status");
CREATE INDEX IF NOT EXISTS "ai_jobs_coach_id_idx" ON "ai_jobs"("coach_id");
