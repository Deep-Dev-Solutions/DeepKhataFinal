# syntax=docker/dockerfile:1
# Build context: repo root.  docker build -f apps/server/Dockerfile -t deepkhata-api:local .

FROM node:22-alpine AS base
RUN apk add --no-cache openssl libc6-compat
WORKDIR /repo
ENV npm_config_fetch_retries=5 npm_config_fetch_retry_mintimeout=5000 npm_config_fetch_timeout=60000 npm_config_maxsockets=8 NODE_OPTIONS=--dns-result-order=ipv4first

# ---- full deps (build + prisma CLI) ----
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
# Workspaces not needed for the API are stubbed so npm sees a consistent tree.
RUN mkdir -p apps/client apps/agency-admin apps/e2e
COPY apps/client/package.json apps/client/package.json
COPY apps/agency-admin/package.json apps/agency-admin/package.json
# postinstall runs `prisma generate`, which needs the schema.
COPY apps/server/prisma apps/server/prisma
#: apps/client/package.json pins @tailwindcss/oxide-linux-x64-gnu (glibc only), which
# fails the platform check on alpine/musl. The musl binary is installed as an optional dep.
RUN --mount=type=cache,target=/root/.npm npm ci -w server --include-workspace-root

# ---- build ----
FROM deps AS build
COPY apps/server/nest-cli.json apps/server/tsconfig.json apps/server/tsconfig.build.json apps/server/
COPY apps/server/src apps/server/src
RUN npm run build -w server

# ---- production deps only ----
FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/client/package.json apps/client/package.json
COPY apps/agency-admin/package.json apps/agency-admin/package.json
RUN --mount=type=cache,target=/root/.npm npm ci -w server --include-workspace-root --omit=dev --ignore-scripts \
 && npm rebuild bcrypt
# Generated Prisma client (with musl engine) and the prisma CLI for `migrate deploy`.
COPY --from=deps /repo/node_modules/.prisma node_modules/.prisma
COPY --from=deps /repo/node_modules/prisma node_modules/prisma
COPY --from=deps /repo/node_modules/@prisma node_modules/@prisma
COPY --from=deps /repo/node_modules/.bin/prisma node_modules/.bin/prisma

# ---- runtime ----
FROM base AS runtime
ENV NODE_ENV=production PORT=5000
WORKDIR /repo/apps/server
COPY --from=prod-deps --chown=node:node /repo/node_modules /repo/node_modules
COPY --from=build --chown=node:node /repo/apps/server/dist ./dist
COPY --chown=node:node apps/server/package.json ./package.json
COPY --chown=node:node apps/server/prisma ./prisma
COPY --chown=node:node deploy/server-entrypoint.sh /usr/local/bin/server-entrypoint.sh
RUN chmod +x /usr/local/bin/server-entrypoint.sh
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/health" || exit 1
ENTRYPOINT ["/usr/local/bin/server-entrypoint.sh"]
