-- CreateTable
CREATE TABLE "athlete_supplements" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dose" TEXT,
    "time_of_day" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "athlete_supplements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplement_intakes" (
    "id" TEXT NOT NULL,
    "supplement_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "taken_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplement_intakes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "athlete_supplements_user_id_idx" ON "athlete_supplements"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplement_intakes_supplement_id_date_key" ON "supplement_intakes"("supplement_id", "date");

-- AddForeignKey
ALTER TABLE "athlete_supplements" ADD CONSTRAINT "athlete_supplements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplement_intakes" ADD CONSTRAINT "supplement_intakes_supplement_id_fkey" FOREIGN KEY ("supplement_id") REFERENCES "athlete_supplements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

