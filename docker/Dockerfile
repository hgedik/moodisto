# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Moodisto container images
# ---------------------------------------------------------------------------
# Both services come out of the same pnpm workspace, so they share one
# Dockerfile and are selected with `target`: the dependency install and the
# shared-package build become layers both images reuse, and the second build is
# almost entirely cache.
#
#   docker build -f docker/Dockerfile --target api .
#   docker build -f docker/Dockerfile --target web .
#
# Next.js inlines `NEXT_PUBLIC_*` into the bundle at build time. By default
# those addresses are left empty, which means "the API answers on the page's
# own origin" — one image behind any domain, given a reverse proxy in front.
# Building for a separate API host is the exception and needs the build
# arguments below. The API image is not environment-specific at all — it reads
# every setting at run time.

# ---------------------------------------------------------------------------
# base — shared by every stage
# ---------------------------------------------------------------------------
# A glibc image, because the native parts of argon2 and the Prisma engine take
# extra work against Alpine's musl. openssl is the Prisma engine's runtime
# dependency; ca-certificates is for TLS out to the music and payment providers.
FROM node:22-bookworm-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates openssl \
 && rm -rf /var/lib/apt/lists/*
# The corepack cache goes somewhere world-readable instead of root's home: the
# runtime stages drop to the `node` user and still have to run pnpm.
ENV COREPACK_HOME=/opt/corepack
WORKDIR /app
# The pnpm version is read from the `packageManager` field and baked into the
# image, so no container downloads a package manager at run time.
COPY package.json ./
RUN corepack enable \
 && corepack prepare --activate \
 && chmod -R a+rX /opt/corepack

# ---------------------------------------------------------------------------
# deps — dependencies
# ---------------------------------------------------------------------------
# Only the manifests are copied, so a source change leaves this layer cached
# and the install does not run again.
FROM base AS deps
# argon2 falls back to compiling from source when it finds no prebuilt binary.
# The toolchain lives in this stage alone and never reaches the runtime images.
RUN apt-get update \
 && apt-get install -y --no-install-recommends g++ make python3 \
 && rm -rf /var/lib/apt/lists/*
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/validation/package.json packages/validation/
COPY packages/queue-engine/package.json packages/queue-engine/
COPY packages/music-provider/package.json packages/music-provider/
COPY packages/database/package.json packages/database/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/e2e/package.json apps/e2e/
# The lockfile decides: a version drift fails the build instead of quietly
# changing what ships.
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# workspace — the shared packages
# ---------------------------------------------------------------------------
FROM deps AS workspace
COPY tsconfig.base.json ./
COPY packages packages
COPY apps/api apps/api
COPY apps/web apps/web
# `prisma generate` and the package build scripts expect a root .env
# (dotenv -e ../../.env). The image holds no real connection string — it must
# not — so a placeholder is written for the build and removed again afterwards.
# Generating the client only needs the schema to be readable.
RUN printf 'DATABASE_URL="postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder?schema=public"\n' > .env \
 && pnpm run build:packages \
 && rm -f .env

# ---------------------------------------------------------------------------
# api-build / api
# ---------------------------------------------------------------------------
FROM workspace AS api-build
RUN pnpm --filter @moodisto/api build

FROM base AS api
# The toolchain stays behind; the runtime image carries the built tree only.
# node_modules comes over whole, because this same image also applies Prisma
# migrations and runs the seed (see docker-compose.yml).
COPY --from=api-build --chown=node:node /app /app
USER node
EXPOSE 3001
# The health check goes through the app's own /health, so a process that is up
# but cannot reach the database is not reported as healthy.
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/main.js"]

# ---------------------------------------------------------------------------
# web-build / web
# ---------------------------------------------------------------------------
FROM workspace AS web-build
# The addresses the browser uses are build arguments, because Next.js inlines
# them into the bundle and they cannot be changed at run time. Nothing is
# fetched server-side, so these are the addresses the browser sees — not the
# service names inside the container network.
#
# Empty is the default on purpose: the browser then calls the origin it loaded
# the page from, so the shipped image carries no host name of its own. Set them
# only when the API really lives somewhere else.
ARG NEXT_PUBLIC_API_URL=
ARG NEXT_PUBLIC_APP_URL=
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    NODE_ENV=production
RUN pnpm --filter @moodisto/web build

FROM base AS web
ENV NODE_ENV=production
# `next start` writes to .next/cache, so the tree has to belong to `node`.
COPY --from=web-build --chown=node:node /app /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["pnpm", "--filter", "@moodisto/web", "start"]
