# ADR 002: Prisma ORM com PostgreSQL (Supabase)

**Status:** Accepted
**Date:** 2026-02-28

## Context
Necessidade de ORM type-safe para o backend NestJS com PostgreSQL hospedado no Supabase.

## Decision
Usar Prisma v6 como ORM com PostgreSQL via Supabase. PgBouncer para connection pooling em produção, conexão direta para migrations.

## Consequences
- **Positivo:** Type-safety completo, migrations declarativas, query builder intuitivo
- **Positivo:** Supabase oferece hosting gerenciado com backups automáticos
- **Negativo:** Raw SQL necessário para queries complexas (rankings com JOINs)
- **Negativo:** Prisma Client precisa ser gerado em cada build
