# Auditoria de UX com o Jev (TypeSafe)

## O que é

Um robô que **abre todas as páginas do app** (como visitante, atleta, treinador e dono da equipe), em **tela de celular (390px) e de computador (1366px)**, copia o que aparece na tela e pergunta a um modelo de IA, o **Jev** da TypeSafe, sete coisas sobre cada página:

| Pergunta | O que quer saber |
|---|---|
| Inglês / texto técnico | Aparece inglês ou mensagem de programador ("undefined", "Unexpected token", "500")? |
| Tela de erro | A página mostra erro em vez do conteúdo normal? |
| Beco sem saída | O usuário fica sem botão ou link para seguir ou voltar? |
| Clareza para o papel | De 1 a 5, quão clara a página é para quem está usando (corredor amador, treinador, dono da assessoria)? |
| Mensagem de erro útil | Se aparece um erro, ele explica o que houve e o que fazer? |
| Problema principal | Qual o maior problema: idioma, erro, texto confuso, falta de retorno, navegação, lista vazia sem orientação, dado estranho, outro ou nenhum. |
| Placeholder / dado falso | Aparece "não informado", "lorem ipsum", "[RAZÃO SOCIAL]", "TODO", "teste"? |

O Jev não escreve textos. Ele devolve **números**: a probabilidade de "sim", uma nota ou uma opção com o grau de certeza. O script compara esses números com limites definidos em `scripts/qa/jev-audit.config.json` e monta um relatório em português.

Além disso, o próprio script marca duas coisas sem usar IA: **página que mandou para o login** (o usuário logado perdeu acesso) e **erros 5xx da API** durante o carregamento.

## 1. Conseguir a chave (TYPESAFE_API_KEY)

1. Entre em **https://console.typesafe.ai/keys**, crie uma conta e gere uma chave.
2. **Atenção:** um relato de terceiros diz que **os cadastros novos foram pausados em 22/09/2026**. Se não conseguir criar conta, esse mesmo relato cita o **Vercel AI Gateway** como outro caminho de acesso ao Jev. Neste caso o endereço e o formato da chave podem ser diferentes (não informado na documentação que consultei). O script hoje fala direto com `https://api.typesafe.ai/v1/systemone`. O endereço pode ser trocado no campo `apiUrl` da configuração, mas confirme antes se o gateway aceita o mesmo formato de requisição.

## 2. Colocar a chave e as contas de teste no `.env`

No arquivo `.env` da **raiz do projeto** (ele já é ignorado pelo git e nunca vai para o GitHub), acrescente:

```bash
TYPESAFE_API_KEY=cole_a_chave_aqui

# Contas DEMO (do seed), nunca contas de clientes reais
QA_ATHLETE_EMAIL=atleta01@demo.rafinharunning.com
QA_ATHLETE_PASSWORD=senha_do_atleta_demo
QA_COACH_EMAIL=assistente@demo.rafinharunning.com
QA_COACH_PASSWORD=senha_do_treinador_demo
QA_OWNER_EMAIL=rafinha@rafinharunning.com.br
QA_OWNER_PASSWORD=senha_do_dono_demo
```

Um papel sem e-mail e senha é pulado, e o relatório avisa. O papel "Visitante" não precisa de login.

## 3. Preparar o Mac (uma vez só)

```bash
cd caminho/do/projeto
pnpm install
npx playwright install chromium     # baixa o navegador que o robô usa
```

Suba o sistema normalmente (por exemplo `docker compose up -d`). O endereço padrão é `http://localhost`. Se o seu app estiver em outro endereço, use `--base-url http://localhost:3001`.

## 4. Rodar

**Passo 1: ensaio sem custo (dry run).** Abre as páginas, mas NÃO chama o Jev. Grava o que seria enviado:

```bash
node scripts/qa/jev-ux-audit.mjs --dry-run
```

Abra `scripts/qa/out/requests.jsonl` (uma linha por página × tela) e `scripts/qa/out/dry-run-summary.json` (quantidade e tamanho médio). Confira se não há dado pessoal sobrando.

**Passo 2: teste pequeno, já pago.** Só 4 capturas:

```bash
node scripts/qa/jev-ux-audit.mjs --max-pages 4
```

**Passo 3: auditoria completa** (hoje são cerca de 180 capturas: 90 páginas × 2 telas):

```bash
node scripts/qa/jev-ux-audit.mjs
```

Outras opções úteis:

| Opção | Para quê |
|---|---|
| `--roles athlete,owner` | Auditar só alguns papéis (`public`, `athlete`, `coach`, `owner`). |
| `--viewports mobile-390` | Só celular (ou `desktop-1366`). |
| `--max-pages N` | No máximo N capturas. Uma captura = uma página em um tamanho de tela = uma requisição ao Jev. |
| `--concurrency N` | Quantas páginas ao mesmo tempo (padrão 3). |
| `--base-url URL` | Endereço do app. |

Se o Jev responder "muitas requisições" (429) ou "sobrecarregado" (529), o script espera e tenta de novo sozinho, com intervalos cada vez maiores.

## 5. Ler o relatório

Abra **`scripts/qa/out/jev-report.md`**:

1. **Resumo por papel.** Para cada papel: quantas capturas foram feitas, quantas foram sinalizadas, quantas ficaram para revisar, quantas tiveram cada tipo de problema e a clareza média (1 a 5).
2. **Páginas sinalizadas, da mais grave para a menos grave.** Cada uma traz os motivos com os números (ex.: `Tela de erro: P(sim)=0.93`) e um **trecho de evidência**: mensagens de erro visíveis, chamadas de API que falharam e frases suspeitas.
3. **Para revisar.** O modelo ficou em dúvida (probabilidade entre 0,4 e 0,7, ou certeza baixa na escolha do problema principal). Vale um olho humano.
4. **Capturas que falharam.** Login que não funcionou, página que não abriu, etc.
5. **Uso de tokens.** Total enviado e recebido.

`scripts/qa/out/jev-report.json` guarda tudo em formato bruto: o que foi enviado e as respostas completas com probabilidades e `usage`. Serve para mudar limites depois sem pagar de novo.

**Como interpretar os números:**
- "P(sim)" perto de 1 = o modelo acha que sim. Perto de 0 = acha que não. Perto de 0,5 = não sabe.
- Clareza: 1 = incompreensível, 3 = dá para entender com esforço, 5 = muito clara.
- Os limites (0,7 para sinalizar, clareza ≤ 2, certeza < 0,5 para "revisar") ficam em `thresholds` na configuração. São **pontos de partida**: ajuste depois de conferir algumas páginas na mão.
- O Jev é uma IA. Ele erra. Trate o relatório como uma **lista de suspeitas para conferir**, não como veredito.
- No banco demo, nomes como "QA2 Evento", "atleta01" ou "demo" vão acionar "placeholder / dado falso". Isso é esperado.

## 6. Custo

Cada requisição informa os tokens usados (`usage`), e o relatório soma tudo. O dry run estima por alto cerca de 2.700 tokens por requisição (tamanho em bytes ÷ 4). É uma estimativa grosseira: o número real só aparece depois da execução real. **Preço por token: não informado.** Confira no console da TypeSafe antes da rodada completa. Faça o passo 2 (4 capturas) e multiplique para ter uma ideia do total.

## 7. LGPD e privacidade (importante)

- O texto das páginas é **enviado para um serviço externo (TypeSafe)**. Páginas de usuários logados mostram nomes, e-mails, treinos, pagamentos.
- **Rode apenas contra o banco demo/seed**, nunca contra produção ou contra um banco com dados de clientes reais.
- Antes de enviar, o script **apaga automaticamente**: e-mails (mantém só o domínio, ex.: `«oculto:email»@gmail.com`), CPF, CNPJ, telefones, tokens de login (JWT), sequências de 6 ou mais dígitos, a senha e o e-mail das contas usadas. Valores digitados em campos de formulário nunca são capturados.
- Essa limpeza é uma **rede de proteção, não uma garantia**. Nomes de pessoas, endereços e datas de nascimento, por exemplo, **não** são removidos. Por isso a regra de usar só dados demo vale sempre.
- A pasta `scripts/qa/out/` fica fora do git (`.gitignore`). Não compartilhe esses arquivos.

## Arquivos

| Arquivo | O que é |
|---|---|
| `scripts/qa/jev-ux-audit.mjs` | O script. |
| `scripts/qa/jev-audit.config.json` | Papéis, rotas, telas, limites e pesos de gravidade. |
| `scripts/qa/jev-ux-audit.test.mjs` | Testes automáticos (`node --test scripts/qa/`), sem internet e sem chave. |
| `scripts/qa/out/` | Saídas (`requests.jsonl`, `dry-run-summary.json`, `jev-report.json`, `jev-report.md`). |

Para auditar uma página nova, acrescente a rota na lista do papel em `jev-audit.config.json`. As rotas atuais saíram das pastas `apps/web/src/app/**/page.tsx` e do menu lateral (`apps/web/src/app/dashboard/layout.tsx`). Ficaram de fora as páginas de administrador da plataforma e as que exigem um link/token específico (`/reset-password`, `/join`, `/pedido/<id>`, `/onboarding/<slug>`, `/coach/<slug>`, `/loja/<slug>`).
