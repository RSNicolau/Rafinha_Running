-- E-mails passam a ser case-insensitive: a aplicação normaliza para minúsculas.
-- 1) Normaliza e-mails existentes quando não há conflito com outra conta.
UPDATE "users" u
SET "email" = lower(u."email")
WHERE u."email" IS NOT NULL
  AND u."email" <> lower(u."email")
  AND NOT EXISTS (
    SELECT 1 FROM "users" o WHERE o."id" <> u."id" AND lower(o."email") = lower(u."email")
  );

-- 2) Conflitos (mesmo e-mail com maiúsculas diferentes em contas distintas) ficam como estão e são listados.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT lower("email") AS e, count(*) AS n FROM "users" WHERE "email" IS NOT NULL GROUP BY lower("email") HAVING count(*) > 1 LOOP
    RAISE NOTICE 'E-mail duplicado (maiúsc./minúsc.) precisa de revisão manual: % (% contas)', r.e, r.n;
  END LOOP;
END $$;

-- 3) Índice para buscas case-insensitive (não único, para não falhar se houver conflitos antigos).
CREATE INDEX IF NOT EXISTS "users_email_lower_idx" ON "users" (lower("email"));
