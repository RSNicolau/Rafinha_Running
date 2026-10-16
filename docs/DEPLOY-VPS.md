# Colocar o RR no ar numa VPS (domínio + HTTPS) — passo a passo

Se o [RODAR-LOCAL.md](RODAR-LOCAL.md) era o **quiosque montado na garagem para testar**, aqui é a
**mudança para o ponto comercial**: o mesmo "prédio" (Caddy + Web + API + Postgres + Redis), só que num
servidor alugado (VPS), com endereço próprio (domínio) e cadeado (HTTPS) automático.

Nada muda no código nem no `docker-compose.yml`: muda só o `.env`.

---

## 1. Escolher a VPS

- **Sistema:** Ubuntu Server **24.04 LTS** (ou 22.04), arquitetura x86_64 (amd64).
- **Tamanho para começar:** **2 vCPU, 4 GB de RAM, 40 GB de SSD** é um bom piso. Com 2 GB de RAM
  funciona para rodar, mas o *build* do site pode faltar memória — aí é obrigatório criar swap (passo 4).
  Conforme o número de treinadores/atletas crescer, suba para 4 vCPU / 8 GB.
- **Região:** o mais perto dos usuários (ex.: São Paulo) deixa o app mais rápido.
- **Onde:** qualquer provedor com VPS Ubuntu serve (ex.: Hetzner, DigitalOcean, Vultr, Contabo,
  Hostinger, Magalu Cloud, AWS Lightsail, Oracle Cloud). **Preços: não informado aqui** — compare no
  site de cada um na hora de contratar (valores mudam e dependem de câmbio).
- Ative os **snapshots/backups do provedor** se houver (camada extra além do backup do banco).

Anote o **IP público** da VPS.

---

## 2. Apontar o domínio (DNS)

DNS é a **lista telefônica da internet**: diz "app.seudominio.com.br fica no IP tal".

No painel onde o domínio está (Registro.br, Cloudflare, GoDaddy...), crie:

| Tipo | Nome | Valor |
|---|---|---|
| **A** | `app` (ou `@` para usar o domínio raiz) | IP da VPS |
| AAAA (opcional) | `app` | IPv6 da VPS, se tiver |

Teste (no Mac): `dig +short app.seudominio.com.br` → deve responder o IP da VPS. Pode levar de minutos
a algumas horas para propagar.

> **Usa Cloudflare?** Comece com a nuvem **cinza** ("DNS only"), para o Caddy emitir o certificado.
> Se depois ligar o proxy (nuvem laranja): SSL/TLS em **Full (strict)** e `TRUST_PROXY_HOPS=2` no `.env`.

---

## 3. Primeiro acesso e segurança básica

```bash
ssh root@IP_DA_VPS

# atualizações
apt update && apt -y upgrade
apt -y install git ufw unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades     # atualizações de segurança automáticas

# usuário de trabalho (não use root no dia a dia)
adduser deploy
usermod -aG sudo deploy
# copie sua chave SSH para o novo usuário (rode no SEU Mac):  ssh-copy-id deploy@IP_DA_VPS

# firewall: só SSH, HTTP e HTTPS
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw enable
ufw status
```

> O Docker abre as portas que ele publica "por fora" do ufw. Por isso a stack só publica **80 e 443**
> (o Caddy). **Nunca** use o `docker-compose.override.example.yml` na VPS — ele abriria o banco.

---

## 4. Instalar o Docker (+ swap, se a VPS tiver ≤ 4 GB)

```bash
ssh deploy@IP_DA_VPS
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy
exit        # saia e entre de novo para valer o grupo
ssh deploy@IP_DA_VPS
docker compose version      # deve mostrar "Docker Compose version v2..."
```

Swap (memória "de reserva" no disco — evita o build morrer por falta de RAM):
```bash
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 5. Baixar o projeto e gerar o `.env`

```bash
sudo mkdir -p /opt/rr && sudo chown deploy:deploy /opt/rr
git clone <URL-DO-REPOSITORIO> /opt/rr       # repositório privado: use uma "deploy key" do GitHub
cd /opt/rr
./scripts/gerar-env.sh --vps app.seudominio.com.br --email voce@seudominio.com.br
```

Isso gera todos os segredos novos e já configura: `SITE_ADDRESS=app.seudominio.com.br` (o Caddy pede o
certificado HTTPS sozinho), `APP_URL=https://app.seudominio.com.br`, `NODE_ENV=production`,
pagamento falso **desligado**.

Agora preencha as chaves reais: `nano .env`

| Item | Variáveis |
|---|---|
| **Asaas produção** | `ASAAS_API_KEY='$aact_...'` (**aspas simples!**) e `ASAAS_BASE_URL=https://api.asaas.com/v3` — troque as **duas juntas** (chave de produção só funciona na URL de produção) |
| E-mail | `RESEND_API_KEY`, `EMAIL_FROM` (domínio verificado no Resend) |
| IA | `ANTHROPIC_API_KEY` (e outras, se usar) |
| LGPD | `LEGAL_DPO_EMAIL` |
| Stripe (se usar) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (passo 8), `STRIPE_*_PRICE_ID` |
| Strava (se usar) | `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` |
| Monitoramento (opcional) | `SENTRY_DSN`, `WEB_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` |

> **Vai levar os dados do Mac para a VPS?** Copie do `.env` do Mac para o da VPS os valores de
> `ENCRYPTION_KEY` e `API_KEY_ENCRYPTION_SECRET` **antes** do primeiro `up`. Eles são as chaves do cofre:
> dados cifrados no Mac (tokens de integrações, 2FA, chaves de IA) só abrem com as mesmas chaves.
> Depois siga a seção 11.

---

## 6. Ligar

```bash
./scripts/rr.sh up          # = docker compose up -d --build
./scripts/rr.sh logs caddy  # veja o certificado sendo emitido ("certificate obtained successfully")
```

Abra `https://app.seudominio.com.br`. Se o cadeado não aparecer: confira o DNS (passo 2), o firewall
(portas 80 e 443) e os logs do Caddy.

---

## 7. Criar as contas iniciais

```bash
./scripts/rr.sh seed
```
Entra o super admin e o treinador com as senhas mostradas pelo `gerar-env.sh` (também no `.env`).

> O seed também cria contas de **exemplo** (admin e atletas `joao@email.com` / `maria@email.com`).
> Em produção, entre no sistema e desative/remova essas contas se não quiser mantê-las.
> E lembre: rodar o seed de novo **volta** as senhas do super admin/treinador para as do `.env`.

---

## 8. Webhooks e integrações (os "telefones de retorno")

Webhook é o **telefone de retorno**: o Asaas/Stripe/Strava liga para o sistema avisando "o pagamento
caiu", "o atleta correu". Os endereços abaixo vão direto do Caddy para a API.

### Asaas (principal)
Painel do Asaas → **Integrações → Webhooks** → novo webhook:
- **URL:** `https://app.seudominio.com.br/api/v1/webhooks/asaas`
- **Token de autenticação:** o valor de `ASAAS_WEBHOOK_TOKEN` do seu `.env` (o script já gerou)
- **Eventos:** cobranças/pagamentos (o sistema usa `PAYMENT_RECEIVED` e `PAYMENT_CONFIRMED`, entre outros)
- Ative a fila/envio e salve. Faça um pagamento de teste de valor baixo para confirmar ponta a ponta.

### Stripe (se usar)
Stripe → **Developers → Webhooks → Add endpoint**:
- **URL:** `https://app.seudominio.com.br/api/v1/webhooks/stripe`
- **Eventos:** `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`,
  `customer.subscription.deleted`
- Copie o **Signing secret** (`whsec_...`) para `STRIPE_WEBHOOK_SECRET` e rode `./scripts/rr.sh restart`.

### Legado (só se ainda usar)
- Mercado Pago: `https://app.seudominio.com.br/api/v1/webhooks/mercadopago`
- Pagar.me: `https://app.seudominio.com.br/api/v1/payments/webhook`
- WhatsApp: `https://app.seudominio.com.br/api/v1/webhooks/whatsapp`

### Strava
1. strava.com/settings/api → **Authorization Callback Domain:** `app.seudominio.com.br` (sem `https://`).
2. Preencha `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` e rode `./scripts/rr.sh restart`.
3. Crie a **assinatura de webhook** (uma vez): logado como **super admin** ou admin, chame
   `POST /api/v1/integrations/strava/setup-webhook` (pela tela de administração, se existir, ou
   pela documentação `/api/docs` com `ENABLE_SWAGGER=true` temporariamente).
   O Strava valida a URL `https://app.seudominio.com.br/api/v1/webhooks/strava` usando o
   `STRAVA_WEBHOOK_VERIFY_TOKEN`.
4. Grave o **id** retornado em `STRAVA_WEBHOOK_SUBSCRIPTION_ID` no `.env` e `./scripts/rr.sh restart`.

### Garmin, COROS, Google Fit
O `gerar-env.sh` já preencheu os `*_REDIRECT_URI` com
`https://app.seudominio.com.br/api/v1/webhooks/oauth/<PROVEDOR>/callback` — cadastre exatamente essa
URL no painel de desenvolvedor de cada provedor. Webhooks da Garmin:
`/api/v1/webhooks/garmin/activities`, `/api/v1/webhooks/garmin/health`,
`/api/v1/webhooks/garmin/deregistration`; COROS: `/api/v1/webhooks/coros`.

---

## 9. Backup automático diário

O backup é a **fotocópia do arquivo-cofre guardada em outra gaveta**. O script copia o banco
(`pg_dump`) e os arquivos enviados, e apaga os mais velhos que `BACKUP_RETENTION_DAYS` (padrão 14 dias).

Testar na mão:
```bash
./scripts/rr.sh backup
ls -lh backups/
```

Agendar todo dia às 03:15:
```bash
crontab -e
# cole a linha abaixo, salve e saia:
15 3 * * * cd /opt/rr && ./scripts/backup-db.sh >> backups/backup.log 2>&1
```

### Cópia fora da VPS (importante)
Backup que fica só na VPS não protege se a VPS sumir. Opções:
- **rclone** (`sudo apt install rclone`, `rclone config`) para Google Drive, Backblaze B2, S3...
  e uma segunda linha no cron, ex.: `45 3 * * * rclone copy /opt/rr/backups remoto:rr-backups`
- ou, do seu Mac, de vez em quando: `scp -r deploy@IP_DA_VPS:/opt/rr/backups ./backups-vps`

### Restaurar
```bash
./scripts/rr.sh restore backups/rr-db-AAAAMMDD-HHMMSS.dump backups/rr-uploads-AAAAMMDD-HHMMSS.tar.gz
```
(pede confirmação, faz um backup de segurança antes, para api/web, restaura e religa).
**Teste uma restauração de vez em quando** — backup nunca testado é só esperança.

---

## 10. Atualizar e voltar atrás (rollback)

### Atualizar para a versão nova do código
```bash
cd /opt/rr
./scripts/rr.sh update
```
Faz, nesta ordem: **backup** → anota a versão atual em `.ultimo-deploy-anterior` → `git pull` →
`docker compose up -d --build` → limpa imagens velhas. A API aplica as migrations novas ao ligar.
O sistema fica fora do ar por poucos segundos enquanto os containers são trocados.

(Equivalente manual: `git pull && docker compose up -d --build`.)

### Voltar para a versão anterior
```bash
cd /opt/rr
git checkout "$(cat .ultimo-deploy-anterior)"
docker compose up -d --build
```
**Cuidado com o banco:** migrations do Prisma não têm "desfazer". Se a versão nova alterou o banco e a
antiga não funciona com ele, restaure também o backup feito pelo `update` (o mais recente antes do
horário da atualização) com `./scripts/rr.sh restore ...`. Dados criados depois desse backup se perdem.
Para voltar ao fluxo normal depois: `git checkout main` (ou a sua branch) e `./scripts/rr.sh update`.

---

## 11. Levar os dados do Mac para a VPS (opcional)

1. No Mac: `./scripts/rr.sh backup`
2. Copie: `scp backups/rr-db-*.dump backups/rr-uploads-*.tar.gz deploy@IP_DA_VPS:/opt/rr/backups/`
3. Garanta que `ENCRYPTION_KEY` e `API_KEY_ENCRYPTION_SECRET` da VPS são **iguais** às do Mac (passo 5).
4. Na VPS: `./scripts/rr.sh restore backups/rr-db-....dump backups/rr-uploads-....tar.gz`

---

## 12. Monitoramento e checklist de segurança

- **Saúde:** `https://app.seudominio.com.br/health` responde `{"status":"ok"}`. Cadastre essa URL num
  monitor de disponibilidade (ex.: UptimeRobot, Better Stack) para receber alerta se cair.
- **Saúde detalhada:** `GET /api/v1/health/detailed` com o header `x-metrics-token: <METRICS_TOKEN>`.
- `.env` com permissão 600 e **nunca** no Git (já está no `.gitignore`).
- **Nunca troque** `ENCRYPTION_KEY` / `API_KEY_ENCRYPTION_SECRET` com o sistema em uso.
- `ENABLE_SWAGGER=false` e `PAYMENTS_FAKE_PROVIDER=false` em produção (a API se recusa a subir com
  pagamento falso em domínio público).
- Logs: `./scripts/rr.sh logs api`. Cada serviço guarda no máximo ~50 MB de log (rotação automática).
- Espaço em disco: `df -h` e `docker system df`. Limpeza segura de imagens antigas: `docker image prune -f`.

---

## Referência rápida

| Ação | Comando |
|---|---|
| Ligar/atualizar a partir do código local | `./scripts/rr.sh up` |
| Atualizar do Git (com backup) | `./scripts/rr.sh update` |
| Estado | `./scripts/rr.sh ps` |
| Logs | `./scripts/rr.sh logs api` |
| Reiniciar após editar `.env` | `./scripts/rr.sh restart` |
| Backup / restaurar | `./scripts/rr.sh backup` / `./scripts/rr.sh restore ARQ.dump [ARQ.tar.gz]` |
| Console SQL | `./scripts/rr.sh psql` |
