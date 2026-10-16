#!/usr/bin/env bash
# Roda a auditoria Jev (TypeSafe) de ponta a ponta no Mac, com um comando só:
#   ./scripts/qa/rodar-jev.sh            → prepara tudo, faz o ensaio grátis e a auditoria completa
#   ./scripts/qa/rodar-jev.sh --so-ensaio → para depois do ensaio (não gasta crédito)
# Pré-requisitos: Docker Desktop aberto, pnpm instalado e a chave em .env.qa (TYPESAFE_API_KEY=...).
set -euo pipefail
cd "$(dirname "$0")/../.."
SO_ENSAIO=0; [[ "${1:-}" == "--so-ensaio" ]] && SO_ENSAIO=1
QA=.env.qa
die() { echo "✖ $*" >&2; exit 1; }
val() { grep -E "^$1=" "$2" 2>/dev/null | tail -1 | cut -d= -f2- | sed -e "s/^'//" -e "s/'$//" -e 's/^"//' -e 's/"$//'; }
setq() { if grep -qE "^$1=" "$QA"; then sed -i.bak "s|^$1=.*|$1=$2|" "$QA" && rm -f "$QA.bak"; else echo "$1=$2" >> "$QA"; fi; }
rnd() { LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 14; echo "!Qa9"; }

command -v docker >/dev/null || die "Docker não encontrado. Instale/abra o Docker Desktop."
docker info >/dev/null 2>&1 || die "O Docker Desktop não está aberto. Abra-o e rode de novo."
command -v pnpm >/dev/null || die "pnpm não encontrado. Rode: npm i -g pnpm"
[[ -f $QA ]] || printf 'TYPESAFE_API_KEY=\n' > "$QA"
chmod 600 "$QA"
[[ -n "$(val TYPESAFE_API_KEY $QA)" ]] || die "Cole a chave da TypeSafe em $QA (abra com: open -e $QA) depois de TYPESAFE_API_KEY="

echo "→ 1/6 Configuração do app (.env)"
[[ -f .env ]] || ./scripts/gerar-env.sh --pagamentos-falsos
echo "→ 2/6 Subindo o app (a primeira vez demora vários minutos)"
docker compose up -d --build
for i in $(seq 1 90); do
  st=$(docker compose ps --format '{{.Service}} {{.Health}}' 2>/dev/null | grep -E '^(api|web) ' | grep -c healthy || true)
  [[ "$st" -ge 2 ]] && break; sleep 5
done
[[ "${st:-0}" -ge 2 ]] || die "api/web não ficaram saudáveis. Veja: docker compose logs api web --tail 80"

echo "→ 3/6 Contas de teste"
ATH_PW=$(val QA_ATHLETE_PASSWORD $QA); [[ -n "$ATH_PW" ]] || ATH_PW=$(rnd)
CO_PW=$(val QA_COACH_PASSWORD $QA);   [[ -n "$CO_PW" ]]  || CO_PW=$(rnd)
OWN_PW=$(val SEED_COACH_PASSWORD .env)
docker compose exec -T api /app/node_modules/.bin/tsx prisma/seed.ts >/dev/null
docker compose exec -T -e SEED_DEMO_ATHLETE_PASSWORD="$ATH_PW" -e SEED_DEMO_COACH_PASSWORD="$CO_PW" api /app/node_modules/.bin/tsx prisma/seed-demo.ts >/dev/null
setq QA_ATHLETE_EMAIL atleta01@demo.rafinharunning.com; setq QA_ATHLETE_PASSWORD "$ATH_PW"
setq QA_COACH_EMAIL assistente@demo.rafinharunning.com;  setq QA_COACH_PASSWORD "$CO_PW"
setq QA_OWNER_EMAIL rafinha@rafinharunning.com.br;       setq QA_OWNER_PASSWORD "$OWN_PW"
echo "   (se as contas demo já existiam com outra senha, ajuste QA_*_PASSWORD em $QA)"

echo "→ 4/6 Navegador do robô"
if [[ ! -d node_modules/playwright && ! -d scripts/qa/node_modules/playwright ]]; then
  npm install --prefix scripts/qa --no-save --no-package-lock playwright >/dev/null
fi
PWBIN=node_modules/.bin/playwright; [[ -x $PWBIN ]] || PWBIN=scripts/qa/node_modules/.bin/playwright
"$PWBIN" install chromium >/dev/null

echo "→ 5/6 Ensaio grátis (não chama o Jev)"
node scripts/qa/jev-ux-audit.mjs --dry-run
[[ $SO_ENSAIO -eq 1 ]] && { echo "✔ Ensaio pronto: scripts/qa/out/"; exit 0; }

echo "→ 6/6 Auditoria completa com o Jev"
node scripts/qa/jev-ux-audit.mjs
echo "✔ Pronto. Relatório: scripts/qa/out/jev-report.md"; command -v open >/dev/null && open scripts/qa/out/jev-report.md || true
