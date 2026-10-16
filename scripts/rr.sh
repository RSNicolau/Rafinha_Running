#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# rr.sh — atalhos do dia a dia (funciona no Mac e na VPS, sem precisar de make).
#
#   ./scripts/rr.sh up          sobe/atualiza tudo (reconstrói o que mudou)
#   ./scripts/rr.sh down        desliga tudo (os dados ficam guardados nos volumes)
#   ./scripts/rr.sh restart     reinicia api e web (ex.: depois de editar o .env)
#   ./scripts/rr.sh ps          mostra o estado de cada serviço
#   ./scripts/rr.sh logs [svc]  acompanha os logs (todos, ou: api | web | caddy | postgres)
#   ./scripts/rr.sh seed        cria/atualiza as contas iniciais (prisma/seed.ts)
#   ./scripts/rr.sh seed-demo   cria a assessoria de demonstração (prisma/seed-demo.ts)
#   ./scripts/rr.sh backup      backup do banco + arquivos (scripts/backup-db.sh)
#   ./scripts/rr.sh restore ARQ.dump [ARQ-uploads.tar.gz]
#   ./scripts/rr.sh update      git pull + rebuild + up (com backup antes)
#   ./scripts/rr.sh psql        abre o console SQL do banco
#   ./scripts/rr.sh cert        copia o certificado raiz do Caddy (HTTPS local) para ./caddy-root.crt
#   ./scripts/rr.sh reset       APAGA TUDO (banco, arquivos, certificados) — pede confirmação
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

need_env() { [ -f .env ] || { echo "Falta o .env — rode primeiro: ./scripts/gerar-env.sh" >&2; exit 1; }; }

cmd="${1:-help}"; shift || true
case "$cmd" in
  up)        need_env; docker compose up -d --build --remove-orphans; docker compose ps ;;
  down)      docker compose down ;;
  restart)   need_env; docker compose up -d --force-recreate api web ;;
  ps|status) docker compose ps ;;
  logs)      docker compose logs -f --tail=200 "$@" ;;
  seed)      docker compose exec api /app/node_modules/.bin/tsx prisma/seed.ts ;;
  seed-demo) docker compose exec api /app/node_modules/.bin/tsx prisma/seed-demo.ts ;;
  backup)    ./scripts/backup-db.sh ;;
  restore)   ./scripts/restore-db.sh "$@" ;;
  update)
    need_env
    ./scripts/backup-db.sh || { echo "Backup falhou — atualização cancelada." >&2; exit 1; }
    git rev-parse HEAD > .ultimo-deploy-anterior
    git pull --ff-only
    docker compose up -d --build --remove-orphans
    docker image prune -f >/dev/null
    docker compose ps
    echo "Versão anterior anotada em .ultimo-deploy-anterior (para rollback, ver docs/DEPLOY-VPS.md)" ;;
  psql)      docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' ;;
  cert)
    docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt
    echo "Certificado salvo em ./caddy-root.crt — envie para o celular (AirDrop/e-mail) e instale (docs/RODAR-LOCAL.md)." ;;
  reset)
    echo "Isto APAGA o banco, os arquivos enviados e os certificados do Caddy. Não tem volta."
    printf 'Digite APAGAR para continuar: '; read -r a
    [ "$a" = "APAGAR" ] || { echo "Cancelado."; exit 1; }
    docker compose down -v --remove-orphans
    echo "Tudo apagado. Para começar do zero: ./scripts/rr.sh up && ./scripts/rr.sh seed" ;;
  help|-h|--help|*) sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//' ;;
esac
