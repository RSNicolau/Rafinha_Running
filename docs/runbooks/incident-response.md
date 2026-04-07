# Runbook: Incident Response

## Severidade

| Nível | Descrição | Resposta |
|-------|-----------|----------|
| P1 | API fora do ar, pagamentos falhando | Imediata (rollback) |
| P2 | Feature principal degradada (chat, live tracking) | 1 hora |
| P3 | Bug não-crítico, UI quebrada | Próximo deploy |

## Checklist P1: API Down

1. **Diagnosticar**
   - Verificar `/api/health` — identifica DB, Redis, ou app
   - Verificar Sentry para erros recentes
   - Verificar Railway logs: `railway logs --service api`

2. **Conter**
   - Se deploy recente causou: rollback imediato (ver deployment-rollback.md)
   - Se DB: verificar Supabase dashboard (conexões, storage, locks)
   - Se Redis: verificar Railway Redis addon status

3. **Comunicar**
   - Notificar time via canal de emergência
   - Se afeta pagamentos: pausar webhooks até resolver

4. **Resolver**
   - Aplicar fix ou rollback
   - Verificar health checks passam
   - Monitorar Sentry por 30 min após fix

5. **Post-mortem**
   - Documentar timeline, causa raiz, e ações preventivas
   - Criar tasks para melhorias identificadas

## Checklist P2: Feature Degradada

1. Verificar Sentry para erros específicos do módulo
2. Verificar Redis (cache/live-tracking) está respondendo
3. Verificar integrações externas (Stripe, Pagar.me, Strava, etc.)
4. Aplicar fix e deploy normal
5. Monitorar por 1 hora

## Contatos

| Serviço | Dashboard |
|---------|-----------|
| Railway (API) | https://railway.app |
| Vercel (Web) | https://vercel.com |
| Supabase (DB) | https://supabase.com/dashboard |
| Sentry | https://sentry.io |
| Pagar.me | https://dash.pagar.me |
| Stripe | https://dashboard.stripe.com |
