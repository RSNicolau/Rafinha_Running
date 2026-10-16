-- AddColumn appointment_url to coach_profiles
ALTER TABLE "coach_profiles" ADD COLUMN IF NOT EXISTS "appointment_url" TEXT;
