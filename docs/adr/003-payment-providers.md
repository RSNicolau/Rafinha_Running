# ADR 003: Múltiplos Provedores de Pagamento

**Status:** Accepted
**Date:** 2026-03-30

## Context
O mercado brasileiro exige suporte a PIX e cartão de crédito. Clientes internacionais precisam de Stripe.

## Decision
Integrar 3 provedores: Pagar.me (PIX + cartão no Brasil), Stripe (internacional), Mercado Pago (alternativa PIX). Pagar.me como provedor primário.

## Consequences
- **Positivo:** Cobertura completa de métodos de pagamento no Brasil e internacionalmente
- **Positivo:** Fallback entre provedores se um ficar indisponível
- **Negativo:** Complexidade de manter webhooks e reconciliação para 3 provedores
- **Negativo:** Mercado Pago está deprecated em favor do Pagar.me (manter por retrocompatibilidade)
