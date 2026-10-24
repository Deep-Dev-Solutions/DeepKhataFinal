# syntax=docker/dockerfile:1
# Build context: repo root.
#   docker build -f apps/agency-admin/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://api.example.com -t deepkhata-admin:local .

# Debian base, not alpine: typescript 7 is a native binary whose optional
# packages are glibc-only (npm skips them on musl and `next build` then fails
# with "Unable to resolve @typescript/typescript-linux-x64").
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends wget ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
ENV npm_config_fetch_retries=5 npm_config_fetch_retry_mintimeout=5000 npm_config_fetch_timeout=60000 npm_config_maxsockets=8 NODE_OPTIONS=--dns-result-order=ipv4first

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/client/package.json apps/client/package.json
COPY apps/agency-admin/package.json apps/agency-admin/package.json
# --ignore-scripts: the server's postinstall (prisma generate) is not needed here.
RUN --mount=type=cache,target=/root/.npm npm ci -w agency-admin --include-workspace-root --ignore-scripts

FROM deps AS build
# NEXT_PUBLIC_* values are inlined into the bundle at build time.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
COPY apps/agency-admin apps/agency-admin
RUN npm run build -w agency-admin

FROM base AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3001 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /repo/apps/agency-admin/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/agency-admin/.next/static ./apps/agency-admin/.next/static
COPY --from=build --chown=node:node /repo/apps/agency-admin/public ./apps/agency-admin/public
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:3001/" || exit 1
CMD ["node", "apps/agency-admin/server.js"]
