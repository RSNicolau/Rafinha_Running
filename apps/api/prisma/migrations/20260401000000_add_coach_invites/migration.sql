-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "coach_invites" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "athlete_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coach_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coach_invites_token_key" ON "coach_invites"("token");

-- CreateIndex
CREATE INDEX "coach_invites_coach_id_idx" ON "coach_invites"("coach_id");

-- CreateIndex
CREATE INDEX "coach_invites_email_idx" ON "coach_invites"("email");

-- CreateIndex
CREATE INDEX "coach_invites_token_idx" ON "coach_invites"("token");

-- CreateIndex
CREATE INDEX "coach_invites_status_idx" ON "coach_invites"("status");

-- AddForeignKey
ALTER TABLE "coach_invites" ADD CONSTRAINT "coach_invites_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_invites" ADD CONSTRAINT "coach_invites_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
