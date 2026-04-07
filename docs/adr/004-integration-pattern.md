# ADR 004: Padrão de Integração com Wearables

**Status:** Accepted
**Date:** 2026-03-29

## Context
Atletas usam diversos dispositivos (Garmin, Strava, COROS, Polar, Apple Health, Google Fit). Cada provedor tem OAuth2 + API de dados diferente.

## Decision
Cada provedor é um service isolado (`garmin.service.ts`, `strava.service.ts`, etc.) registrado no `IntegrationsModule`. O `IntegrationsService` faz dispatch via switch no enum `IntegrationProvider`. Webhooks ficam no `WebhooksController`.

## Consequences
- **Positivo:** Cada integração é independente — fácil adicionar/remover provedores
- **Positivo:** OAuth state management via `AppConfig` com TTL para CSRF protection
- **Positivo:** Token refresh proativo via cron job
- **Negativo:** Duplicação de lógica entre services (OAuth flow, token refresh)
