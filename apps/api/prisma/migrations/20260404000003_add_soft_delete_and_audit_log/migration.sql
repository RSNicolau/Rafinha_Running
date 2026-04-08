-- Add deleted_at soft-delete column to users, payments, training_plans
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);
ALTER TABLE "training_plans" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

-- Add index on deleted_at for users (common filter: WHERE deleted_at IS NULL)
CREATE INDEX IF NOT EXISTS "users_deleted_at_idx" ON "users"("deleted_at");

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id"          TEXT NOT NULL,
    "actor_id"    TEXT NOT NULL,
    "action"      TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id"   TEXT NOT NULL,
    "metadata"    JSONB,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "audit_logs_actor_id_idx"           ON "audit_logs"("actor_id");
CREATE INDEX IF NOT EXISTS "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx"         ON "audit_logs"("created_at");
