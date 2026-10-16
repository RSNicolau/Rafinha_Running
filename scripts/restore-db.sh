#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# restore-db.sh — volta o banco (e opcionalmente os arquivos) para um backup.
#
#   ./scripts/restore-db.sh backups/rr-db-20261014-031500.dump
#   ./scripts/restore-db.sh backups/rr-db-20261014-031500.dump backups/rr-uploads-20261014-031500.tar.gz
#
# ATENÇÃO: substitui TODO o conteúdo atual do banco pelo do backup.
# Antes de restaurar, o script faz um backup de segurança do estado atual.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DB_FILE="${1:-}"
UP_FILE="${2:-}"
[ -n "$DB_FILE" ] || { sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }
[ -f "$DB_FILE" ] || { echo "ERRO: arquivo não encontrado: $DB_FILE" >&2; exit 1; }
[ -z "$UP_FILE" ] || [ -f "$UP_FILE" ] || { echo "ERRO: arquivo não encontrado: $UP_FILE" >&2; exit 1; }

echo "Isto vai SUBSTITUIR o banco atual pelo conteúdo de: $DB_FILE"
[ -n "$UP_FILE" ] && echo "e os arquivos enviados pelo conteúdo de: $UP_FILE"
printf 'Digite RESTAURAR para continuar: '
read -r answer
[ "$answer" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }

echo "→ backup de segurança do estado atual..."
./scripts/backup-db.sh || echo "AVISO: backup de segurança falhou — seguindo mesmo assim."

echo "→ parando web e api (o banco continua no ar)..."
docker compose stop web api

echo "→ restaurando banco..."
docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --single-transaction' < "$DB_FILE"

if [ -n "$UP_FILE" ]; then
  echo "→ restaurando arquivos enviados..."
  docker compose run --rm --no-deps -T --entrypoint sh api -c 'rm -rf /data/uploads/* && tar xzf - -C /data' < "$UP_FILE"
fi

echo "→ subindo api e web..."
docker compose up -d api web
echo "✔ restauração concluída. Acompanhe: docker compose logs -f api"
