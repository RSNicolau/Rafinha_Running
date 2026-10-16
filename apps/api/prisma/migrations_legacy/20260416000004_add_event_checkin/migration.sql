-- Add CHECKED_IN and ABSENT to EventRegistrationStatus enum
ALTER TYPE "EventRegistrationStatus" ADD VALUE IF NOT EXISTS 'CHECKED_IN';
ALTER TYPE "EventRegistrationStatus" ADD VALUE IF NOT EXISTS 'ABSENT';

-- Add checkin_at column to event_registrations
ALTER TABLE "event_registrations"
  ADD COLUMN IF NOT EXISTS "checkin_at" TIMESTAMP;

-- Index for fast attendee lookups
CREATE INDEX IF NOT EXISTS "event_registrations_event_id_status_idx"
  ON "event_registrations" ("event_id", "status");
