# syntax=docker/dockerfile:1

# One pinned, supported base for every stage (the same image the aidr dashboard uses).
# Bump the tag and digest together; never use a floating tag.
ARG NODE_IMAGE=node:24.21.0-alpine3.24@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
ENV CI=1
# pnpm is resolved from package.json "packageManager" via corepack, in build stages only.
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM ${NODE_IMAGE} AS builder
WORKDIR /app
ENV CI=1 \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT=standalone
# Public, build-time values only (they are inlined into the client bundle and the CSP).
# Secrets are runtime environment variables and must never be passed as build args.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_APP_VERSION
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM ${NODE_IMAGE} AS runner
# This runner executes only Node; package managers are not runtime dependencies.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/pnpm /usr/local/bin/pnpx /usr/local/bin/yarn /usr/local/bin/yarnpkg
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0

# Only the traced standalone server, its static assets and public/. Files stay root-owned and
# read-only for the app user; .next/cache is the one writable path (mount a tmpfs there when the
# root filesystem is read-only).
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
RUN mkdir -p .next/cache && chown node:node .next/cache

USER node
EXPOSE 8080

# Liveness only (the process answers); /api/ready reports dependency readiness.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
