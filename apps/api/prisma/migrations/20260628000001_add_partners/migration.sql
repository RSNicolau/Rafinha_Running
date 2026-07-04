-- CreateTable
CREATE TABLE "partners" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "logo_url" TEXT,
    "emoji" TEXT,
    "color" TEXT,
    "link_url" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "partners_coach_id_idx" ON "partners"("coach_id");

-- CreateIndex
CREATE INDEX "partners_is_active_idx" ON "partners"("is_active");

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

