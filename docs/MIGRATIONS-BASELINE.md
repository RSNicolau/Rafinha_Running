# Migrations: baseline de 14/10/2026

## O que mudou
O histórico antigo (`apps/api/prisma/migrations_legacy/`) **não reconstruía o banco do zero**: ~20 tabelas
tinham sido criadas com `prisma db push`, e 4 migrations falhavam em banco limpo. Foi substituído por:

| Migration | Conteúdo |
|---|---|
| `20261014000000_baseline` | Schema completo como estava no commit `b3a5bea` (antes desta rodada) |
| `20261014000100_security_lgpd_payments` | LGPD (consent_logs, aceite), sessões revogáveis, Asaas/Stripe, loja com encomendas, gestão de eventos |

Validado: aplicar as duas em um Postgres vazio gera **exatamente** o mesmo schema de `schema.prisma`
(comparação `pg_dump -s`, 51 tabelas, zero diferenças além da ordem de colunas).

A migration antiga `20260430_upsert_admin_accounts` continha **senhas de administrador em texto** — ela não faz
mais parte do fluxo. **Troque as senhas dessas contas** em qualquer banco onde ela rodou.

## Banco NOVO (rede local / VPS novo)
Nada a fazer: o container da API roda `prisma migrate deploy` ao subir.

## Banco EXISTENTE (ex.: o Supabase antigo, se for migrar os dados)
1. Faça backup (`pg_dump`).
2. Confira se o banco bate com o baseline (deve imprimir apenas um script vazio):
   ```bash
   npx prisma migrate diff --from-url "$DATABASE_URL" \
     --to-schema-datamodel <(git show b3a5bea:apps/api/prisma/schema.prisma) --script
   ```
   Se aparecer SQL, o banco tem diferenças feitas à mão — aplique esse SQL antes (revisando).
3. Troque o histórico e marque o baseline como já aplicado:
   ```bash
   psql "$DATABASE_URL" -c 'DELETE FROM _prisma_migrations;'
   npx prisma migrate resolve --applied 20261014000000_baseline
   npx prisma migrate deploy   # aplica só a 20261014000100
   ```
