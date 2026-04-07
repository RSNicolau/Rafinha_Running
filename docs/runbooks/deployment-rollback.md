# Runbook: Deployment Rollback

## Railway (API)

### Rollback via Dashboard
1. Acesse https://railway.app → projeto RR → service API
2. Clique em "Deployments"
3. Encontre o deploy anterior estável
4. Clique "Redeploy" no deploy desejado

### Rollback via CLI
```bash
railway rollback --service api
```

## Vercel (Web)

### Rollback Instantâneo
1. Acesse https://vercel.com → projeto rr-web
2. Vá em "Deployments"
3. Encontre o deploy anterior
4. Clique "..." → "Promote to Production"

### Rollback via CLI
```bash
vercel rollback --token $VERCEL_TOKEN
```

## Database Migration Rollback

### Prisma Migration Rollback
```bash
# Marcar migration como rolled back
npx prisma migrate resolve --rolled-back <migration_name>

# Re-aplicar o schema anterior
npx prisma db push --accept-data-loss  # CUIDADO: pode perder dados
```

### Rollback Manual (SQL)
1. Conecte ao banco via Supabase SQL Editor
2. Execute o SQL reverso da migration
3. Atualize a tabela `_prisma_migrations`

## Checklist Pós-Rollback
- [ ] Verificar `/api/health` retorna status ok
- [ ] Verificar Sentry não mostra novos erros
- [ ] Testar login/auth flow
- [ ] Verificar webhooks de pagamento
- [ ] Comunicar time sobre o rollback
