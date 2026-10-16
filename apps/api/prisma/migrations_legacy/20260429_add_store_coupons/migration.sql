-- Add coupon fields to StoreOrder
ALTER TABLE "store_orders"
  ADD COLUMN IF NOT EXISTS "discount_in_cents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "final_in_cents" INTEGER,
  ADD COLUMN IF NOT EXISTS "coupon_id" TEXT;

-- Create StoreCoupon table
CREATE TABLE IF NOT EXISTS "store_coupons" (
  "id"          TEXT NOT NULL,
  "coach_id"    TEXT NOT NULL,
  "code"        TEXT NOT NULL,
  "type"        TEXT NOT NULL,
  "value"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "max_uses"    INTEGER,
  "used_count"  INTEGER NOT NULL DEFAULT 0,
  "expires_at"  TIMESTAMP(3),
  "is_active"   BOOLEAN NOT NULL DEFAULT true,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "store_coupons_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "store_coupons_coach_id_code_key" ON "store_coupons"("coach_id", "code");
CREATE INDEX IF NOT EXISTS "store_coupons_coach_id_idx" ON "store_coupons"("coach_id");

-- Foreign keys
ALTER TABLE "store_coupons"
  ADD CONSTRAINT "store_coupons_coach_id_fkey"
  FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "store_orders"
  ADD CONSTRAINT "store_orders_coupon_id_fkey"
  FOREIGN KEY ("coupon_id") REFERENCES "store_coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
