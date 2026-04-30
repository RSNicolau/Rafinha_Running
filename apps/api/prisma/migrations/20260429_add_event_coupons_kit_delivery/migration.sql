-- Add kit delivery fields to EventRegistration
ALTER TABLE "event_registrations"
  ADD COLUMN IF NOT EXISTS "kit_delivered_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "kit_delivered_by" TEXT,
  ADD COLUMN IF NOT EXISTS "coupon_id" TEXT,
  ADD COLUMN IF NOT EXISTS "final_price" INTEGER;

-- Create EventCoupon table
CREATE TABLE IF NOT EXISTS "event_coupons" (
  "id"          TEXT NOT NULL,
  "event_id"    TEXT NOT NULL,
  "code"        TEXT NOT NULL,
  "type"        TEXT NOT NULL,
  "value"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "max_uses"    INTEGER,
  "used_count"  INTEGER NOT NULL DEFAULT 0,
  "expires_at"  TIMESTAMP(3),
  "is_active"   BOOLEAN NOT NULL DEFAULT true,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "event_coupons_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "event_coupons_event_id_code_key" ON "event_coupons"("event_id", "code");
CREATE INDEX IF NOT EXISTS "event_coupons_event_id_idx" ON "event_coupons"("event_id");

-- Create EventCouponUse table
CREATE TABLE IF NOT EXISTS "event_coupon_uses" (
  "id"              TEXT NOT NULL,
  "coupon_id"       TEXT NOT NULL,
  "registration_id" TEXT NOT NULL,
  "used_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "event_coupon_uses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "event_coupon_uses_registration_id_key" ON "event_coupon_uses"("registration_id");
CREATE INDEX IF NOT EXISTS "event_coupon_uses_coupon_id_idx" ON "event_coupon_uses"("coupon_id");

-- Create KitDeliverySession table
CREATE TABLE IF NOT EXISTS "kit_delivery_sessions" (
  "id"         TEXT NOT NULL,
  "event_id"   TEXT NOT NULL,
  "token"      TEXT NOT NULL,
  "label"      TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "kit_delivery_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "kit_delivery_sessions_token_key" ON "kit_delivery_sessions"("token");
CREATE INDEX IF NOT EXISTS "kit_delivery_sessions_event_id_idx" ON "kit_delivery_sessions"("event_id");

-- Foreign keys
ALTER TABLE "event_coupons"
  ADD CONSTRAINT "event_coupons_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_coupon_uses"
  ADD CONSTRAINT "event_coupon_uses_coupon_id_fkey"
  FOREIGN KEY ("coupon_id") REFERENCES "event_coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "event_coupon_uses"
  ADD CONSTRAINT "event_coupon_uses_registration_id_fkey"
  FOREIGN KEY ("registration_id") REFERENCES "event_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "event_registrations"
  ADD CONSTRAINT "event_registrations_coupon_id_fkey"
  FOREIGN KEY ("coupon_id") REFERENCES "event_coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "kit_delivery_sessions"
  ADD CONSTRAINT "kit_delivery_sessions_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
