# ADR 005: Live Tracking com Redis (Persistence)

**Status:** Accepted
**Date:** 2026-04-06

## Context
O live tracking GPS usava `Map` em memória, perdendo dados no restart do servidor. Sessões ativas e rotas precisam sobreviver a deploys.

## Decision
Migrar sessões e rotas do live tracking para Redis com TTL de 4 horas. Sessions como hashes, routes como JSON arrays.

## Consequences
- **Positivo:** Dados sobrevivem a restarts e deploys do servidor
- **Positivo:** Escalável horizontalmente (múltiplas instâncias leem o mesmo Redis)
- **Positivo:** Auto-cleanup via TTL — sessões abandonadas expiram automaticamente
- **Negativo:** Latência ligeiramente maior que in-memory (~1-2ms por operação Redis)
- **Negativo:** Dependência do Redis para funcionalidade core — degradação graceful se Redis cair
