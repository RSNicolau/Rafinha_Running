# ADR 001: Monorepo com Turborepo + pnpm

**Status:** Accepted
**Date:** 2026-02-28

## Context
O projeto RR consiste em 3 aplicações (API NestJS, Web Next.js, Mobile Expo) que compartilham tipos e utilitários.

## Decision
Usar Turborepo com pnpm workspaces para gerenciar o monorepo. Pacote compartilhado `@rr/shared` para tipos TypeScript comuns.

## Consequences
- **Positivo:** Build caching, dependências compartilhadas, tipos sincronizados entre apps
- **Positivo:** Um único `pnpm install` configura todo o projeto
- **Negativo:** CI precisa instalar todas as dependências mesmo para builds parciais
- **Negativo:** Configuração inicial mais complexa que repositórios separados
