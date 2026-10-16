#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# Entrypoint da API (roda dentro do container, antes de `node dist/main.js`):
#   1. espera o Postgres aceitar conexões
#   2. aplica as migrations pendentes (prisma migrate deploy)
#   3. (opcional) roda o seed quando SEED_ON_START=true (e o seed-demo quando SEED_DEMO=true)
#   4. trava de segurança: pagamento falso só em endereço de rede local
#   5. inicia a API
# ─────────────────────────────────────────────────────────────────────────────
set -eu

PRISMA="/app/node_modules/.bin/prisma"
TSX="/app/node_modules/.bin/tsx"
SCHEMA="prisma/schema.prisma"

log() { echo "[entrypoint] $*"; }

# Variáveis deixadas vazias no .env chegam como "" — e em alguns pontos o código trata
# "" diferente de "não definida" (ex.: TRUST_PROXY_HOPS ?? 1 vira 0). Removemos as vazias.
for name in $(env | sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=$/\1/p'); do
  unset "$name"
done

if [ -z "${DATABASE_URL:-}" ]; then
  log "ERRO: DATABASE_URL não definido."; exit 1
fi
# O schema declara directUrl = env("DIRECT_URL"); sem PgBouncer é a mesma URL.
export DIRECT_URL="${DIRECT_URL:-$DATABASE_URL}"

# ── 1. Esperar o banco ──────────────────────────────────────────────────────
WAIT_SECONDS="${DB_WAIT_SECONDS:-90}"
log "aguardando o banco (até ${WAIT_SECONDS}s)..."
node -e '
const net = require("net");
const u = new URL(process.env.DATABASE_URL);
const host = u.hostname, port = Number(u.port || 5432);
const deadline = Date.now() + Number(process.argv[1]) * 1000;
(function attempt() {
  const s = net.connect({ host, port, timeout: 3000 });
  s.once("connect", () => { s.end(); console.log("[entrypoint] banco acessível em " + host + ":" + port); process.exit(0); });
  const retry = () => { s.destroy(); if (Date.now() > deadline) { console.error("[entrypoint] ERRO: banco não respondeu em " + host + ":" + port); process.exit(1); } setTimeout(attempt, 2000); };
  s.once("error", retry); s.once("timeout", retry);
})();
' "$WAIT_SECONDS"

# ── 2. Migrations ───────────────────────────────────────────────────────────
if [ "${SKIP_MIGRATIONS:-false}" != "true" ]; then
  log "aplicando migrations (prisma migrate deploy)..."
  n=0
  until "$PRISMA" migrate deploy --schema "$SCHEMA"; do
    n=$((n + 1))
    if [ "$n" -ge 5 ]; then log "ERRO: migrate deploy falhou 5 vezes — abortando."; exit 1; fi
    log "migrate deploy falhou (tentativa $n/5) — nova tentativa em 5s"; sleep 5
  done
else
  log "SKIP_MIGRATIONS=true — migrations NÃO aplicadas."
fi

# ── 3. Seed opcional ────────────────────────────────────────────────────────
if [ "${SEED_ON_START:-false}" = "true" ]; then
  log "SEED_ON_START=true — rodando prisma/seed.ts (idempotente: contas existentes mantêm a senha, salvo SEED_*_PASSWORD)"
  "$TSX" prisma/seed.ts
  if [ "${SEED_DEMO:-false}" = "true" ]; then
    log "SEED_DEMO=true — rodando prisma/seed-demo.ts"
    "$TSX" prisma/seed-demo.ts
  fi
  log "seed concluído. Dica: volte SEED_ON_START=false no .env para não repetir a cada reinício."
fi

# ── 4. Trava: provedor de pagamento falso nunca em endereço público ─────────
# O código só ativa o FAKE quando NODE_ENV != production. Mesmo assim, se alguém
# copiar o .env do modo local para a VPS, a API se recusa a subir.
if [ "${PAYMENTS_FAKE_PROVIDER:-false}" = "true" ]; then
  host="$(node -e 'try{console.log(new URL(process.env.APP_URL||"").hostname)}catch(e){console.log("")}')"
  case "$host" in
    localhost|127.*|10.*|192.168.*|172.1[6-9].*|172.2[0-9].*|172.3[0-1].*|*.local|*.lan|*.home.arpa)
      log "AVISO: PAYMENTS_FAKE_PROVIDER=true (pagamentos SIMULADOS) — permitido só porque APP_URL é rede local ($host)." ;;
    *)
      log "ERRO: PAYMENTS_FAKE_PROVIDER=true com APP_URL público ('$host'). Isso deixaria qualquer um 'pagar' sem pagar."
      log "      Corrija o .env (PAYMENTS_FAKE_PROVIDER=false e NODE_ENV=production) e suba de novo."
      exit 1 ;;
  esac
fi

# ── 5. Start ────────────────────────────────────────────────────────────────
log "iniciando: $*"
exec "$@"
