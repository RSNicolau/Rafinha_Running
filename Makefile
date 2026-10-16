# Atalhos (opcional) — tudo aqui só chama ./scripts/rr.sh, que funciona mesmo sem `make`.
# No Mac o `make` vem com as "Command Line Tools" do Xcode; na VPS: sudo apt install make.
.PHONY: help env up down restart ps logs seed seed-demo backup restore update psql cert reset

help:      ## lista os atalhos
	@./scripts/rr.sh help

env:       ## cria o .env (rede local, HTTP). Outras opções: ./scripts/gerar-env.sh --help
	@./scripts/gerar-env.sh

up:        ## sobe/atualiza tudo
	@./scripts/rr.sh up

down:      ## desliga tudo (dados preservados)
	@./scripts/rr.sh down

restart:   ## reinicia api e web
	@./scripts/rr.sh restart

ps:        ## estado dos serviços
	@./scripts/rr.sh ps

logs:      ## logs ao vivo (make logs s=api)
	@./scripts/rr.sh logs $(s)

seed:      ## cria/atualiza contas iniciais
	@./scripts/rr.sh seed

seed-demo: ## cria assessoria de demonstração
	@./scripts/rr.sh seed-demo

backup:    ## backup do banco + arquivos
	@./scripts/rr.sh backup

restore:   ## make restore f=backups/rr-db-....dump [u=backups/rr-uploads-....tar.gz]
	@./scripts/rr.sh restore $(f) $(u)

update:    ## backup + git pull + rebuild
	@./scripts/rr.sh update

psql:      ## console SQL
	@./scripts/rr.sh psql

cert:      ## exporta o certificado raiz do Caddy (HTTPS local)
	@./scripts/rr.sh cert

reset:     ## APAGA tudo (pede confirmação)
	@./scripts/rr.sh reset
