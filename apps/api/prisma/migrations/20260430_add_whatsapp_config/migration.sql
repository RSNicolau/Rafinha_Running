CREATE TABLE IF NOT EXISTS "whatsapp_configs" (
  "id"              TEXT NOT NULL,
  "coach_id"        TEXT NOT NULL,
  "provider"        TEXT NOT NULL DEFAULT 'zapi',
  "phone"           TEXT NOT NULL DEFAULT '',
  "api_token"       TEXT NOT NULL DEFAULT '',
  "instance_id"     TEXT NOT NULL DEFAULT '',
  "welcome_message" TEXT NOT NULL DEFAULT 'Olá {nome}! Sou o assistente do Coach. Acesse: {onboardingLink}',
  "is_connected"    BOOLEAN NOT NULL DEFAULT false,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "whatsapp_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_configs_coach_id_key" ON "whatsapp_configs"("coach_id");

ALTER TABLE "whatsapp_configs"
  ADD CONSTRAINT "whatsapp_configs_coach_id_fkey"
  FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
