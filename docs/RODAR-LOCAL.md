# Rodar o RR no seu Mac (rede local) — passo a passo

Objetivo: ligar o sistema inteiro no seu Mac e usar pelos celulares da mesma rede Wi-Fi como app (PWA),
para testar e validar **antes** de colocar na VPS. A configuração é **a mesma** que vai para a VPS:
o que funcionar aqui, funciona lá.

---

## 1. Como o sistema está montado (a analogia do prédio)

Pense no sistema como um **prédio comercial** dentro do seu Mac. Cada "sala" é um container do Docker:

| Sala (container) | O que é no prédio | O que faz |
|---|---|---|
| **caddy** | A **portaria** | Única porta de entrada (portas 80/443). Recebe todo mundo e encaminha para a sala certa. Na VPS, também cuida do cadeado HTTPS sozinho. |
| **web** | A **recepção/vitrine** | O site/app que a pessoa vê (Next.js). Quando precisa de dados, liga para o escritório. |
| **api** | O **escritório** | Onde as regras do negócio rodam (NestJS): login, treinos, pagamentos, chat... |
| **postgres** | O **arquivo-cofre** | O banco de dados. Tudo que é importante fica guardado aqui. |
| **redis** | O **bloco de rascunho** | Cache (memória rápida). Se sumir, nada se perde — só fica um pouco mais lento. |

E os **volumes** são as **gavetas** do prédio: desligar o prédio (`down`) não esvazia as gavetas.
Os dados só somem se você mandar apagar (`reset`).

```
Celular/Mac ──► caddy (portaria) ──► web (vitrine) ──► api (escritório) ──► postgres (cofre)
                     └──► api direto: chat/ao vivo (WebSocket), webhooks, arquivos      └► redis
```

---

## 2. Antes de começar (uma vez só)

1. **Docker Desktop para Mac** — baixe em docker.com → *Docker Desktop* → escolha **Apple Silicon** (M1/M2/M3/M4)
   ou **Intel**, conforme o seu Mac ( → *Sobre Este Mac*). Instale e abra; espere a baleia na barra
   de menu ficar parada.
2. Em Docker Desktop → **Settings → Resources**: deixe **pelo menos 6 GB de memória** (o build do site
   usa bastante memória; com menos, o build pode falhar). Precisa de uns **15 GB livres** em disco.
3. **Terminal**: abra o app *Terminal* e vá até a pasta do projeto:
   ```bash
   cd ~/caminho/da/pasta/rr      # ajuste para onde o projeto está no seu Mac
   ```

> Se você já usava o `docker-compose.yml` antigo (containers `rr-postgres` e `rr-redis` para
> desenvolvimento), eles não conflitam, mas pode removê-los: `docker rm -f rr-postgres rr-redis`.
> O banco antigo de desenvolvimento **não** é usado pela nova stack (ela cria um banco novo e vazio).

---

## 3. Criar o arquivo de configuração (`.env`)

O `.env` é o **molho de chaves + caderno de endereços** do prédio. O script cria tudo sozinho:
gera senhas e chaves fortes e descobre o IP do seu Mac na rede.

```bash
./scripts/gerar-env.sh
```

No fim ele mostra:
- o **endereço** para abrir (ex.: `http://192.168.0.10`)
- o **e-mail e a senha** do super admin e do treinador (anote; também ficam dentro do `.env`)

Se o IP aparecer errado ou "localhost", descubra o IP com `ipconfig getifaddr en0` e rode:
```bash
./scripts/gerar-env.sh --ip 192.168.0.10 --so-enderecos
```

### Chaves que você pode preencher agora (opcional)

Abra o `.env` num editor (`open -e .env`) e preencha o que quiser testar:

| Para testar... | Preencha |
|---|---|
| E-mails (recuperar senha, convites) | `RESEND_API_KEY`, `EMAIL_FROM` (domínio verificado no Resend) |
| Recursos de IA | `ANTHROPIC_API_KEY` |
| Mapas | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (exige rebuild do web) |
| Pagamento "de verdade" em sandbox | `ASAAS_API_KEY='$aact_...'` **entre aspas simples** (a chave começa com `$`) |

### Pagamentos na rede local: escolha um caminho

- **A) Asaas sandbox (mais realista):** preencha `ASAAS_API_KEY` com a chave do **sandbox**
  (`ASAAS_BASE_URL` já vem com o sandbox). Você consegue gerar PIX/boleto de teste. **Porém** a
  confirmação do pagamento chega por *webhook* (o Asaas "liga de volta" para o sistema) e o Asaas
  não enxerga o seu Mac dentro de casa. Resultado: o pedido fica "pendente". A confirmação
  automática você valida na VPS (ou com um túnel — ver seção 9).
- **B) Pagamentos simulados (fluxo completo, sem dinheiro nem gateway):**
  ```bash
  ./scripts/gerar-env.sh --pagamentos-falsos --so-enderecos
  ```
  Isso liga `PAYMENTS_FAKE_PROVIDER=true` e coloca `NODE_ENV=development` **só na API** — o código
  só permite o pagamento falso fora de "production" e só quando nenhum gateway real está configurado.
  Efeitos colaterais do modo development na API: logs mais detalhados e a documentação `/api/docs`
  ligada. Como trava de segurança, **a API se recusa a subir** com pagamento falso se o `APP_URL`
  não for um endereço de rede local — não tem como isso escapar para a VPS por engano.
  Para voltar ao normal: `./scripts/gerar-env.sh --so-enderecos` e `docker compose up -d`.

---

## 4. Ligar o prédio

```bash
docker compose up -d --build
```

- `--build` = "construa as salas com o código atual". Na **primeira vez** demora bastante (baixa as
  imagens e instala tudo — vários minutos). Nas próximas, só o que mudou.
- `-d` = roda em segundo plano (pode fechar o Terminal).

Confira se está tudo de pé:
```bash
docker compose ps
```
Espere `api` e `web` aparecerem como **healthy** (a API aplica as *migrations* do banco ao ligar, então
leva um pouco mais na primeira vez).

---

## 5. Criar as primeiras contas

```bash
./scripts/rr.sh seed
```
Cria o **super admin** e o **treinador** com as senhas mostradas pelo `gerar-env.sh`, além de contas
de exemplo (admin e dois atletas — as senhas destes aparecem **uma vez** na saída do comando).
Quer uma assessoria de demonstração cheia de dados? `./scripts/rr.sh seed-demo`.

> O seed pode ser rodado de novo sem duplicar nada. Mas atenção: se a senha estiver definida no
> `.env` (`SEED_SUPER_ADMIN_PASSWORD`, `SEED_COACH_PASSWORD`), rodar o seed **volta** a senha da conta
> para a do `.env`.

---

## 6. Abrir no Mac e nos celulares

- **No Mac:** `http://localhost` (ou o endereço mostrado pelo script)
- **No celular:** conectado **no mesmo Wi-Fi**, abra `http://<IP-do-Mac>` (ex.: `http://192.168.0.10`)

Não abriu no celular?
- Wi-Fi de **convidados** costuma isolar os aparelhos — use a rede principal.
- macOS → Ajustes do Sistema → Rede → **Firewall**: se estiver ligado, permita conexões para o Docker.
- O IP do Mac pode mudar (o roteador "empresta" IPs). Se mudou:
  `./scripts/gerar-env.sh --so-enderecos` e `docker compose up -d --build`.
  Dica: no roteador, reserve um IP fixo para o Mac (DHCP reservation).

---

## 7. Instalar como app (PWA)

**iPhone (Safari):** abra o endereço → botão **Compartilhar** (quadrado com seta) → **Adicionar à Tela
de Início** → Adicionar.

**Android (Chrome):** abra o endereço → menu **⋮** → **Instalar app** (ou **Adicionar à tela inicial**).

### ⚠ A limitação do HTTP (cadeado) na rede local

Em `http://` (sem cadeado) o navegador trata o site como "não seguro" e **bloqueia** algumas peças:

| Recurso | Em `http://IP` | Em `https://` |
|---|---|---|
| Abrir, logar, usar telas, chat, ao vivo | ✅ | ✅ |
| Ícone na tela de início (iPhone) | ✅ (atalho que abre em tela cheia) | ✅ |
| *Service worker* (modo offline, "app de verdade") | ❌ | ✅ |
| Botão "Instalar app" do Android | ❌ (só "Adicionar à tela inicial") | ✅ |
| Câmera (leitor de QR da entrega de kits) | ❌ | ✅ |
| Microfone (áudio no chat) | ❌ | ✅ |

Ou seja: **HTTP serve para validar telas e fluxos**. Para validar o PWA completo, câmera e microfone,
use o modo HTTPS local abaixo (ou valide esses itens direto na VPS, onde o HTTPS é automático).

### Modo HTTPS na rede local (opcional, nível avançado)

O Caddy cria uma "autoridade certificadora" própria — um **cartório particular** que assina o
certificado do seu Mac. Os celulares só confiam nesse cartório depois que você instala o certificado
dele, uma vez em cada aparelho.

1. Trocar para HTTPS e religar:
   ```bash
   ./scripts/gerar-env.sh --https-local --so-enderecos
   docker compose up -d --build
   ```
   (preenche `SITE_ADDRESS=<IP>`, `SITE_TLS="tls internal"`, `CADDY_GLOBAL_OPTIONS="default_sni <IP>"`
   e `APP_URL=https://<IP>`)
2. Exportar o certificado do "cartório":
   ```bash
   ./scripts/rr.sh cert        # gera ./caddy-root.crt
   ```
3. Instalar nos aparelhos:
   - **iPhone:** envie o `caddy-root.crt` por AirDrop (ou e-mail) → Ajustes → **Perfil Baixado** →
     Instalar. Depois: Ajustes → Geral → Sobre → **Ajustes de Confiança de Certificados** → ative o
     certificado "Caddy Local Authority".
   - **Android:** Configurações → Segurança → Criptografia e credenciais → **Instalar certificado** →
     **Certificado CA** → escolha o arquivo. (O caminho exato muda por fabricante.)
   - **Mac:** dê dois cliques no arquivo → Acesso às Chaves → abra o certificado → Confiar →
     **Sempre confiar**.
4. Abra `https://<IP-do-Mac>`.

> Alternativa: a ferramenta `mkcert` faz o mesmo papel do "cartório". Como o Caddy já faz isso
> sozinho, prefira o caminho acima.

---

## 8. Dia a dia

| Quero... | Comando |
|---|---|
| Ver se está tudo de pé | `./scripts/rr.sh ps` |
| Ver o que está acontecendo (logs) | `./scripts/rr.sh logs api` (ou `web`, `caddy`, `postgres`; sem nome = todos). Sair: `Ctrl+C` |
| Desligar (dados preservados) | `./scripts/rr.sh down` |
| Ligar de novo | `./scripts/rr.sh up` |
| Editei o `.env` | `docker compose up -d` (se mexeu em `APP_URL` ou `NEXT_PUBLIC_*`: `docker compose up -d --build web`) |
| Atualizei o código | `docker compose up -d --build` |
| Backup do banco + arquivos | `./scripts/rr.sh backup` → pasta `backups/` |
| Voltar um backup | `./scripts/rr.sh restore backups/rr-db-....dump [backups/rr-uploads-....tar.gz]` |
| Console SQL | `./scripts/rr.sh psql` |
| **Apagar tudo e começar do zero** | `./scripts/rr.sh reset` → depois `./scripts/rr.sh up` e `./scripts/rr.sh seed` |

Quem preferir pode usar `make up`, `make logs s=api`, `make backup` etc. (mesmos comandos).

Para depurar com ferramentas (abrir o banco no TablePlus/DBeaver, chamar a API direto):
`cp docker-compose.override.example.yml docker-compose.override.yml` e `docker compose up -d`
— abre as portas 5432, 6379, 3000 e 3001 **só para o próprio Mac**. Não use isso na VPS.

---

## 9. Testar webhooks/integrações a partir do Mac (opcional)

Pagamentos (Asaas/Stripe) e relógios (Strava, Garmin...) precisam "ligar de volta" para um endereço
**público com HTTPS**. Na rede local isso não existe. Duas saídas:

1. **Validar esses itens direto na VPS** (recomendado — é lá que vão rodar de verdade).
2. Um **túnel** temporário (ex.: Cloudflare Tunnel `cloudflared tunnel --url http://localhost:80`) gera
   uma URL `https://....trycloudflare.com` apontando para o seu Mac. Aí você ajusta `APP_URL`,
   `FRONTEND_URL` e `ALLOWED_ORIGINS` no `.env` para essa URL, roda `docker compose up -d --build`
   e cadastra os webhooks com ela. A URL muda a cada execução — é só para um teste pontual.

---

## 10. Roteiro de validação (checklist)

- [ ] `docker compose ps` → api e web **healthy**
- [ ] Login como super admin e como treinador
- [ ] Cadastro de atleta pelo celular (link de onboarding do treinador)
- [ ] Chat entre treinador e atleta (enviar e receber mensagem)
- [ ] Tela "Ao vivo" do painel mostra **conectado** (é o teste do WebSocket que passa pelo Caddy → API)
- [ ] Upload de foto/logo e o arquivo aparece depois de recarregar
- [ ] Checkout (Asaas sandbox gera cobrança, **ou** modo simulado aprova)
- [ ] PWA instalado no iPhone e no Android
- [ ] (HTTPS local) câmera no leitor de QR e áudio no chat
- [ ] Backup e restauração: `rr.sh backup`, mudar algo, `rr.sh restore ...`, conferir que voltou
- [ ] E-mail de "esqueci a senha" chega (se configurou o Resend)

---

## Problemas comuns

| Sintoma | Causa provável / solução |
|---|---|
| `Defina POSTGRES_PASSWORD no .env` | Falta o `.env`. Rode `./scripts/gerar-env.sh`. |
| `port is already allocated` (80 ou 443) | Outro programa usa a porta (outro servidor web, outro Docker). Feche-o ou `docker ps` para achar. |
| Build do web para com "heap out of memory" / "Killed" | Aumente a memória do Docker Desktop (Settings → Resources). |
| `api` fica *unhealthy* | `./scripts/rr.sh logs api` — normalmente variável faltando (a mensagem diz qual) ou migration com erro. |
| Celular não abre | Mesmo Wi-Fi? Firewall do Mac? IP mudou? (seção 6) |
| Pagamento fica "pendente" no sandbox | Normal na rede local — o webhook do Asaas não alcança o Mac (seção 3, opção A). |
| A chave do Asaas "sumiu" | Faltaram as **aspas simples**: `ASAAS_API_KEY='$aact_...'`. |
| Troquei a senha do Postgres no `.env` e a API não conecta | O Postgres só lê a senha na criação do volume. Volte a senha antiga ou faça `reset` (apaga os dados). |
