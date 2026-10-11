# syntax=docker/dockerfile:1
# Build context: repo root.
#   docker build -f apps/client/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://api.example.com -t deepkhata-client:local .

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /repo
ENV npm_config_fetch_retries=5 npm_config_fetch_retry_mintimeout=5000 npm_config_fetch_timeout=60000 npm_config_maxsockets=8 NODE_OPTIONS=--dns-result-order=ipv4first

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/client/package.json apps/client/package.json
COPY apps/agency-admin/package.json apps/agency-admin/package.json
# --ignore-scripts: the server's postinstall (prisma generate) is not needed here.
# --force: apps/client pins @tailwindcss/oxide-linux-x64-gnu (glibc only); skip the platform check on musl.
RUN --mount=type=cache,target=/root/.npm npm ci -w client --include-workspace-root --ignore-scripts --force

FROM deps AS build
# NEXT_PUBLIC_* values are inlined into the bundle at build time.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_AGENCY_URL=http://localhost:3001
ENV NEXT_PUBLIC_AGENCY_URL=$NEXT_PUBLIC_AGENCY_URL
ENV NEXT_TELEMETRY_DISABLED=1
COPY apps/client apps/client
RUN npm run build -w client

FROM base AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /repo/apps/client/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/client/.next/static ./apps/client/.next/static
COPY --from=build --chown=node:node /repo/apps/client/public ./apps/client/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:3000/" || exit 1
CMD ["node", "apps/client/server.js"]
