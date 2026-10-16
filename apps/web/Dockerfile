# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────────────
# RR — Web (Next.js 14 + PWA)
# Build a partir da RAIZ do monorepo:
#   docker build -f apps/web/Dockerfile -t rr-web .
#
# IMPORTANTE: o Next "congela" no build
#   - API_URL (destino dos rewrites /api/v1/* em next.config.js) → http://api:3000
#   - todas as NEXT_PUBLIC_* (vão para o JavaScript do navegador)
# Mudou alguma delas? Rode `docker compose build web` de novo.
# next.config.js não usa `output: 'standalone'`, então a imagem roda `next start`
# com o node_modules completo.
# ─────────────────────────────────────────────────────────────────────────────

ARG NODE_IMAGE=node:22-bookworm-slim

# ── base (idêntica à da API para reaproveitar cache) ─────────────────────────
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

# ── deps ─────────────────────────────────────────────────────────────────────
FROM base AS deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/.npmrc apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
COPY packages/shared/package.json packages/shared/
COPY packages/tsconfig/package.json packages/tsconfig/
RUN --mount=type=cache,id=rr-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store --filter "@rr/api..." --filter "@rr/web..."

# ── build ────────────────────────────────────────────────────────────────────
FROM deps AS build
# Destino interno dos rewrites do Next (rede do docker compose)
ARG API_URL=http://api:3000
# Relativo de propósito: o navegador chama a MESMA origem (Caddy → web/api),
# então a mesma imagem funciona no IP da rede local e no domínio da VPS.
ARG NEXT_PUBLIC_API_URL=/api/v1
# Usado em metadata/sitemap/robots — coloque a URL pública (APP_URL)
ARG NEXT_PUBLIC_BASE_URL=http://localhost
ARG NEXT_PUBLIC_DEFAULT_COACH_ID=rafinha
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
ARG NEXT_PUBLIC_PAGARME_EK=
ARG NEXT_PUBLIC_SENTRY_DSN=

# SENTRY_* vazios: sem token o plugin do Sentry pula o upload de source maps (build não falha)
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    API_URL=${API_URL} \
    NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_BASE_URL=${NEXT_PUBLIC_BASE_URL} \
    NEXT_PUBLIC_DEFAULT_COACH_ID=${NEXT_PUBLIC_DEFAULT_COACH_ID} \
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=${NEXT_PUBLIC_GOOGLE_MAPS_API_KEY} \
    NEXT_PUBLIC_PAGARME_EK=${NEXT_PUBLIC_PAGARME_EK} \
    NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN} \
    SENTRY_AUTH_TOKEN= \
    SENTRY_ORG= \
    SENTRY_PROJECT= \
    NODE_OPTIONS=--max-old-space-size=4096

COPY packages packages
COPY apps/web apps/web
WORKDIR /app/apps/web
RUN /app/node_modules/.bin/next build

# ── runtime ──────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/packages /app/packages
# .next precisa ser gravável (cache de imagens/ISR) pelo usuário node
COPY --from=build --chown=node:node /app/apps/web /app/apps/web
USER node
WORKDIR /app/apps/web
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/manifest.webmanifest').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/app/node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
