# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────────────
# RR — API (NestJS 11 + Prisma 6)
# Build a partir da RAIZ do monorepo:
#   docker build -f apps/api/Dockerfile -t rr-api .
# (o docker-compose.yml da raiz já faz isso)
# ─────────────────────────────────────────────────────────────────────────────

ARG NODE_IMAGE=node:22-bookworm-slim

# ── base: Node + pnpm (corepack) + openssl (Prisma precisa) ──────────────────
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    CI=true
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# ── deps: instala dependências com o lockfile do workspace (sem atualizar nada) ─
FROM base AS deps
# Ferramentas de compilação só para o caso de algum módulo nativo (ex.: bcrypt)
# não ter binário pronto para a arquitetura (Mac M1/M2 = arm64, VPS = amd64).
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/.npmrc apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
COPY packages/shared/package.json packages/shared/
COPY packages/tsconfig/package.json packages/tsconfig/
# Obs.: com node-linker=hoisted o pnpm materializa o lockfile inteiro num único
# node_modules mesmo com --filter. Este estágio é IDÊNTICO ao do apps/web/Dockerfile
# de propósito: o Docker reaproveita o cache e instala uma vez só.
RUN --mount=type=cache,id=rr-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store --filter "@rr/api..." --filter "@rr/web..."

# ── build: prisma generate + nest build ──────────────────────────────────────
FROM deps AS build
COPY packages packages
COPY apps/api apps/api
WORKDIR /app/apps/api

RUN /app/node_modules/.bin/prisma generate --schema prisma/schema.prisma \
 && /app/node_modules/.bin/prisma --version \
 && /app/node_modules/.bin/nest build \
 && test -f dist/main.js

# ── runtime: imagem final, usuário sem privilégios ───────────────────────────
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    UPLOADS_DIR=/data/uploads
# node_modules inclui o CLI do Prisma (migrate deploy) e o tsx (seed) — ambos são
# devDependencies; por isso a imagem leva a árvore completa (ver docs/DEPLOY-VPS.md).
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/packages /app/packages
# apps/api inteiro: dist/ (compilado), prisma/ (schema + migrations + seed), src/ (o seed importa
# ../src/modules/legal/...) e apps/api/node_modules — com node-linker=hoisted, pacotes com versão
# diferente da raiz (ex.: ioredis, multer, uuid) ficam aninhados ali.
COPY --from=build /app/apps/api /app/apps/api
COPY --chmod=755 deploy/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh

RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
WORKDIR /app/apps/api
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/api-entrypoint.sh"]
CMD ["node", "dist/main.js"]
