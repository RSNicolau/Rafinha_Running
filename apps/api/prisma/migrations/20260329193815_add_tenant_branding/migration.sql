-- CreateTable
CREATE TABLE "tenant_brandings" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "tenant_name" TEXT NOT NULL,
    "primary_color" TEXT NOT NULL DEFAULT '#DC2626',
    "logo_url" TEXT,
    "domain" TEXT,
    "welcome_msg" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_brandings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_brandings_coach_id_key" ON "tenant_brandings"("coach_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_brandings_domain_key" ON "tenant_brandings"("domain");

-- AddForeignKey
ALTER TABLE "tenant_brandings" ADD CONSTRAINT "tenant_brandings_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
