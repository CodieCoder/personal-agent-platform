# syntax=docker/dockerfile:1.7

FROM node:24.15.0-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

FROM base AS build

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm build
RUN pnpm --filter @pap/worker deploy --legacy --prod /prod/worker

FROM node:24.15.0-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PAP_ENVIRONMENT=self_hosted
ENV PAP_BIND_HOST=0.0.0.0
ENV PAP_PORT=3000
ENV PAP_DATABASE_URL=file:/app/data/pap.db
ENV PAP_DATA_DIR=/app/data
ENV PAP_LOG_PRETTY=false

WORKDIR /app

RUN groupadd --system --gid 1001 pap \
  && useradd --system --uid 1001 --gid pap --home-dir /app --shell /usr/sbin/nologin pap \
  && mkdir -p /app/data \
  && chown -R pap:pap /app

COPY --from=build --chown=pap:pap /prod/worker /app

USER pap

VOLUME ["/app/data"]

CMD ["node", "dist/index.js"]
