# Runbook: Secrets Rotation

## Inventário de Secrets

| Secret | Localização | Rotação | Impacto se comprometido |
|--------|------------|---------|------------------------|
| `JWT_SECRET` | Railway env | Trimestral | Todas as sessões invalidadas |
| `JWT_REFRESH_SECRET` | Railway env | Trimestral | Refresh tokens invalidados |
| `DATABASE_URL` | Railway env | Anual (com rotation Supabase) | Acesso total ao banco |
| `PAGARME_API_KEY` | Railway env | Se comprometido | Transações fraudulentas |
| `PAGARME_WEBHOOK_SECRET` | Railway env | Se comprometido | Webhooks falsos aceitos |
| `STRIPE_SECRET_KEY` | Railway env | Anual | Transações fraudulentas |
| `STRIPE_WEBHOOK_SECRET` | Railway env | Se comprometido | Webhooks falsos aceitos |
| `RESEND_API_KEY` | Railway env | Anual | Emails enviados em nome da plataforma |
| `SENTRY_DSN` | Railway + Vercel env | Raramente | Logs de erro acessíveis |
| `ENCRYPTION_KEY` | Railway env | Se comprometido | Tokens OAuth descriptografados |
| `EXPO_TOKEN` | GitHub Secrets | Anual | Builds mobile não autorizados |
| `RAILWAY_TOKEN` | GitHub Secrets | Anual | Deploys não autorizados |
| `VERCEL_TOKEN` | GitHub Secrets | Anual | Deploys não autorizados |

## Procedimento de Rotação

### JWT Secrets
1. Gerar novo secret: `openssl rand -hex 32`
2. Atualizar `JWT_SECRET` no Railway
3. Restart da API (todas as sessões ativas serão invalidadas)
4. Usuários precisarão fazer login novamente

### Database URL
1. No Supabase, gere uma nova senha do banco
2. Atualize `DATABASE_URL` e `DIRECT_URL` no Railway
3. Restart da API
4. Verifique `/api/health` (check do database)

### Payment Provider Keys
1. No dashboard do provedor (Pagar.me/Stripe), gere nova API key
2. Atualize no Railway
3. Restart da API
4. Teste um pagamento de teste

### Encryption Key
1. Gerar nova key: `openssl rand -hex 32`
2. **ANTES de atualizar:** executar migration para re-criptografar tokens com a nova key
3. Atualizar `ENCRYPTION_KEY` no Railway
4. Restart da API
