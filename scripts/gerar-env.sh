#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# gerar-env.sh — cria o .env da raiz a partir do .env.example, com TODOS os
# segredos gerados aleatoriamente (openssl) e os endereços preenchidos.
#
# Uso:
#   ./scripts/gerar-env.sh                          rede local, HTTP (IP do Mac detectado)
#   ./scripts/gerar-env.sh --https-local            rede local com HTTPS (certificado do Caddy)
#   ./scripts/gerar-env.sh --pagamentos-falsos      + pagamentos SIMULADOS (só rede local)
#   ./scripts/gerar-env.sh --vps app.dominio.com.br [--email voce@dominio.com.br]
#
# Opções extras:
#   --ip 192.168.0.10   força o IP (se a detecção automática errar)
#   --so-enderecos      .env já existe: atualiza SÓ endereços/modo, mantendo os segredos
#                       (ex.: o IP do Mac mudou, ou você vai migrar do local para a VPS)
#   --force             sobrescreve um .env existente (o antigo vira .env.bak-DATA)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXAMPLE="$ROOT/.env.example"
ENV_FILE="$ROOT/.env"

MODE="local-http"
DOMAIN=""
ACME_EMAIL=""
IP=""
FAKE_PAYMENTS="false"
ONLY_ADDRESSES="false"
FORCE="false"

die() { echo "ERRO: $*" >&2; exit 1; }

usage() { sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --https-local)       MODE="local-https" ;;
    --pagamentos-falsos) FAKE_PAYMENTS="true" ;;
    --vps)               MODE="vps"; DOMAIN="${2:-}"; [ -n "$DOMAIN" ] || die "--vps precisa do domínio (ex.: --vps app.dominio.com.br)"; shift ;;
    --email)             ACME_EMAIL="${2:-}"; [ -n "$ACME_EMAIL" ] || die "--email precisa de um endereço"; shift ;;
    --ip)                IP="${2:-}"; [ -n "$IP" ] || die "--ip precisa de um endereço"; shift ;;
    --so-enderecos)      ONLY_ADDRESSES="true" ;;
    --force)             FORCE="true" ;;
    -h|--help)           usage 0 ;;
    *)                   echo "Opção desconhecida: $1" >&2; usage 1 ;;
  esac
  shift
done

if [ "$MODE" = "vps" ] && [ "$FAKE_PAYMENTS" = "true" ]; then
  die "--pagamentos-falsos não é permitido com --vps (qualquer pessoa conseguiria 'pagar' sem pagar)."
fi
DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN%%/*}"

command -v openssl >/dev/null 2>&1 || die "openssl não encontrado (no Mac já vem instalado; no Ubuntu: sudo apt install openssl)."
[ -f "$EXAMPLE" ] || die "não achei $EXAMPLE"

# ── helpers ──────────────────────────────────────────────────────────────────
hex()   { openssl rand -hex "$1"; }
b64()   { openssl rand -base64 "$1" | tr -d '\n'; }
# senha legível (sem símbolos que confundem shell/URL), 20 caracteres
senha() { openssl rand -base64 30 | tr -dc 'A-Za-z0-9' | cut -c1-20; }

# set_var CHAVE VALOR → troca a linha "CHAVE=..." (ou acrescenta no fim)
set_var() {
  local key="$1" val="$2" tmp
  tmp="$(mktemp "${ENV_FILE}.XXXXXX")"
  awk -v k="$key" -v v="$val" '
    BEGIN { done = 0 }
    index($0, k "=") == 1 { print k "=" v; done = 1; next }
    { print }
    END { if (!done) print k "=" v }
  ' "$ENV_FILE" > "$tmp"
  mv "$tmp" "$ENV_FILE"
}

detect_ip() {
  local ip=""
  if command -v ipconfig >/dev/null 2>&1; then           # macOS
    for itf in en0 en1 en2 en3; do
      ip="$(ipconfig getifaddr "$itf" 2>/dev/null || true)"
      [ -n "$ip" ] && break
    done
  fi
  if [ -z "$ip" ] && command -v ip >/dev/null 2>&1; then  # Linux
    ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}')"
  fi
  if [ -z "$ip" ] && command -v hostname >/dev/null 2>&1; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  fi
  echo "${ip:-localhost}"
}

# ── 1. Criar/atualizar o arquivo ─────────────────────────────────────────────
if [ -f "$ENV_FILE" ]; then
  if [ "$ONLY_ADDRESSES" = "true" ]; then
    echo "→ .env existente: atualizando só endereços/modo (segredos mantidos)."
  elif [ "$FORCE" = "true" ]; then
    backup="$ENV_FILE.bak-$(date +%Y%m%d-%H%M%S)"
    cp "$ENV_FILE" "$backup"
    echo "→ .env antigo salvo em $(basename "$backup")"
    cp "$EXAMPLE" "$ENV_FILE"
  else
    die ".env já existe. Use --so-enderecos (mantém segredos) ou --force (recria tudo; ATENÇÃO: novas
     chaves de criptografia tornam ilegíveis os dados já cifrados, e a senha do Postgres do volume
     existente NÃO muda — o banco antigo deixaria de conectar)."
  fi
else
  [ "$ONLY_ADDRESSES" = "true" ] && die "não existe .env ainda — rode sem --so-enderecos."
  cp "$EXAMPLE" "$ENV_FILE"
fi
chmod 600 "$ENV_FILE"

# ── 2. Segredos (somente na criação) ─────────────────────────────────────────
SUPER_PW=""; COACH_PW=""
if [ "$ONLY_ADDRESSES" != "true" ]; then
  SUPER_PW="$(senha)"; COACH_PW="$(senha)"
  set_var POSTGRES_PASSWORD           "$(hex 24)"
  set_var JWT_SECRET                  "$(b64 48)"
  set_var JWT_REFRESH_SECRET          "$(b64 48)"
  set_var ENCRYPTION_KEY              "$(hex 32)"
  set_var API_KEY_ENCRYPTION_SECRET   "$(hex 32)"
  set_var FILES_SIGNING_SECRET        "$(hex 32)"
  set_var ONBOARDING_TOKEN_SECRET     "$(hex 32)"
  set_var PROXY_SHARED_SECRET         "$(hex 32)"
  set_var METRICS_TOKEN               "$(hex 24)"
  set_var ASAAS_WEBHOOK_TOKEN         "$(hex 24)"
  set_var STRAVA_WEBHOOK_VERIFY_TOKEN "$(hex 16)"
  set_var SEED_SUPER_ADMIN_PASSWORD   "$SUPER_PW"
  set_var SEED_COACH_PASSWORD         "$COACH_PW"
fi

# ── 3. Endereços e modo ──────────────────────────────────────────────────────
case "$MODE" in
  vps)
    APP="https://$DOMAIN"
    set_var SITE_ADDRESS "$DOMAIN"
    set_var SITE_TLS ""
    if [ -n "$ACME_EMAIL" ]; then set_var CADDY_GLOBAL_OPTIONS "\"email $ACME_EMAIL\""; else set_var CADDY_GLOBAL_OPTIONS ""; fi
    set_var ALLOWED_ORIGINS "$APP"
    ;;
  local-https)
    [ -n "$IP" ] || IP="$(detect_ip)"
    [ "$IP" != "localhost" ] || die "não consegui detectar o IP do Mac. Rode de novo com --ip 192.168.x.x"
    APP="https://$IP"
    set_var SITE_ADDRESS "$IP"
    set_var SITE_TLS "\"tls internal\""
    set_var CADDY_GLOBAL_OPTIONS "\"default_sni $IP\""
    set_var ALLOWED_ORIGINS "$APP"
    ;;
  *)
    [ -n "$IP" ] || IP="$(detect_ip)"
    APP="http://$IP"
    set_var SITE_ADDRESS ":80"
    set_var SITE_TLS ""
    set_var CADDY_GLOBAL_OPTIONS ""
    if [ "$IP" = "localhost" ]; then set_var ALLOWED_ORIGINS "http://localhost"
    else set_var ALLOWED_ORIGINS "$APP,http://localhost"; fi
    ;;
esac
set_var APP_URL "$APP"
set_var FRONTEND_URL "$APP"
# Callbacks OAuth (o padrão do código aponta para localhost:3000, que não serve fora do computador)
for prov in GARMIN COROS GOOGLE_FIT; do
  set_var "${prov}_REDIRECT_URI" "$APP/api/v1/webhooks/oauth/$prov/callback"
done
set_var TRUST_PROXY_HOPS 1

# Pagamentos: o código só libera o provedor FAKE com NODE_ENV != production
# e sem Asaas/Stripe configurados. Então o modo simulado exige NODE_ENV=development.
if [ "$FAKE_PAYMENTS" = "true" ]; then
  set_var NODE_ENV development
  set_var PAYMENTS_FAKE_PROVIDER true
  set_var ASAAS_API_KEY ""
  set_var STRIPE_SECRET_KEY ""
else
  set_var NODE_ENV production
  set_var PAYMENTS_FAKE_PROVIDER false
fi

# ── 4. Resumo ────────────────────────────────────────────────────────────────
echo
echo "✔ .env pronto em $ENV_FILE (permissão 600 — só seu usuário lê)"
echo "   Modo:          $MODE$([ "$FAKE_PAYMENTS" = "true" ] && echo " + pagamentos SIMULADOS (NODE_ENV=development)")"
echo "   Endereço:      $APP"
if [ -n "$SUPER_PW" ]; then
  echo
  echo "   Primeiras contas (criadas quando você rodar o seed — veja a doc):"
  echo "     Super admin:  $(grep '^SEED_SUPER_ADMIN_EMAIL=' "$ENV_FILE" | cut -d= -f2-)  /  $SUPER_PW"
  echo "     Treinador:    rafinha@rafinharunning.com.br  /  $COACH_PW"
  echo "   (as senhas também ficam no .env: SEED_SUPER_ADMIN_PASSWORD e SEED_COACH_PASSWORD)"
fi
echo
echo "   Próximos passos:"
case "$MODE" in
  vps)
    echo "     1. Confira o DNS: $DOMAIN → IP desta VPS"
    echo "     2. Preencha no .env as chaves reais (Asaas produção, Resend, Anthropic...)."
    echo "        Chave do Asaas começa com \$ → use ASPAS SIMPLES: ASAAS_API_KEY='\$aact_...'" ;;
  local-https)
    echo "     Depois do 1º 'up', instale o certificado do Caddy nos celulares (docs/RODAR-LOCAL.md)." ;;
  *)
    [ "$IP" = "localhost" ] && echo "     ⚠ IP não detectado — no celular use o IP do Mac (rode de novo com --ip 192.168.x.x --so-enderecos)." ;;
esac
echo "     docker compose up -d --build"
echo "     docker compose exec api /app/node_modules/.bin/tsx prisma/seed.ts     (cria as contas acima)"
echo "     Abra: $APP"
