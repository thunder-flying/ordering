# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable \
  && for attempt in 1 2 3; do \
    corepack prepare pnpm@11.19.0 --activate && break; \
    if [ "$attempt" = "3" ]; then exit 1; fi; \
    echo "corepack prepare failed (attempt ${attempt}/3), retrying"; \
    sleep "$((attempt * 5))"; \
  done \
  && groupadd --gid 10001 kaifanla \
  && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin kaifanla
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/miniapp/package.json apps/miniapp/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile --filter @ordering/server...

FROM deps AS build
COPY packages/contracts packages/contracts
COPY apps/server apps/server
RUN mkdir -p apps/server/public \
  && pnpm --filter @ordering/server build

FROM build AS tooling
ENV NODE_ENV=production
ENV HOME=/tmp
USER 10001:10001
CMD ["pnpm", "--filter", "@ordering/server", "prisma:migrate"]

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV NODE_OPTIONS=--max-old-space-size=384
ENV HOME=/tmp
WORKDIR /app
RUN groupadd --gid 10001 kaifanla \
  && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin kaifanla
COPY --from=build --chown=10001:10001 /app/apps/server/.next/standalone ./
COPY --from=build --chown=10001:10001 /app/apps/server/.next/static ./apps/server/.next/static
COPY --from=build --chown=10001:10001 /app/apps/server/public ./apps/server/public
COPY --from=build --chown=10001:10001 /app/apps/server/dist-cli ./apps/server/dist-cli
USER 10001:10001
EXPOSE 3000
CMD ["node", "apps/server/server.js"]
