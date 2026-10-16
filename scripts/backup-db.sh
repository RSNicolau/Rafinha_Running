#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# backup-db.sh — "foto" do banco + dos arquivos enviados, com limpeza automática.
#
#   ./scripts/backup-db.sh            gera backups/rr-db-AAAAMMDD-HHMMSS.dump
#                                     e backups/rr-uploads-AAAAMMDD-HHMMSS.tar.gz
#
# Mantém os últimos BACKUP_RETENTION_DAYS dias (padrão 14) em BACKUP_DIR (padrão ./backups).
# Agendar todo dia às 03:15 (VPS):  crontab -e  e cole
#   15 3 * * * cd /opt/rr && ./scripts/backup-db.sh >> backups/backup.log 2>&1
#
# IMPORTANTE: backup que fica só na mesma máquina não protege contra perder a máquina.
# Copie a pasta backups/ para fora (ver docs/DEPLOY-VPS.md → "Cópia fora da VPS").
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

env_get() { # lê CHAVE do .env (sem executar o arquivo)
  [ -f .env ] || return 0
  grep -E "^$1=" .env | tail -n1 | cut -d= -f2- | sed -e "s/^['\"]//" -e "s/['\"]$//"
}

BACKUP_DIR="$(env_get BACKUP_DIR)";              BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION="$(env_get BACKUP_RETENTION_DAYS)";    RETENTION="${RETENTION:-14}"
case "$RETENTION" in ''|*[!0-9]*) RETENTION=14 ;; esac

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
DB_FILE="$BACKUP_DIR/rr-db-$STAMP.dump"
UP_FILE="$BACKUP_DIR/rr-uploads-$STAMP.tar.gz"

echo "[$(date '+%F %T')] backup iniciado"

# 1. Banco (formato custom do pg_dump: compactado e restaurável com pg_restore)
if ! docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner' > "$DB_FILE.tmp"; then
  rm -f "$DB_FILE.tmp"
  echo "ERRO: pg_dump falhou (o container postgres está rodando? 'docker compose ps')" >&2
  exit 1
fi
[ -s "$DB_FILE.tmp" ] || { rm -f "$DB_FILE.tmp"; echo "ERRO: dump vazio" >&2; exit 1; }
mv "$DB_FILE.tmp" "$DB_FILE"
echo "  banco    → $DB_FILE ($(du -h "$DB_FILE" | cut -f1))"

# 2. Arquivos enviados (volume "uploads", montado na API em /data/uploads)
if docker compose exec -T api sh -c 'test -d /data/uploads' 2>/dev/null; then
  if docker compose exec -T api tar czf - -C /data uploads > "$UP_FILE.tmp"; then
    mv "$UP_FILE.tmp" "$UP_FILE"
    echo "  arquivos → $UP_FILE ($(du -h "$UP_FILE" | cut -f1))"
  else
    rm -f "$UP_FILE.tmp"
    echo "  AVISO: não consegui copiar os uploads (a API está rodando?)" >&2
  fi
else
  echo "  AVISO: API fora do ar — backup de uploads pulado" >&2
fi

# 3. Retenção
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'rr-db-*.dump' -o -name 'rr-uploads-*.tar.gz' \) -mtime +"$RETENTION" -print -delete \
  | sed 's/^/  removido (antigo): /'

echo "[$(date '+%F %T')] backup concluído"
