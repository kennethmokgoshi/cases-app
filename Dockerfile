# Monorepo Dockerfile - builds a single app
# Usage: docker build --build-arg APP=cases -t zenowethu-cases .
#        docker build --build-arg APP=insurance -t zenowethu-insurance .
#
# Build args:
#   APP           - which app to build (cases | insurance | legal | forensic-audit | finance)
#   DATABASE_URL  - postgres connection string
#   OPENAI_API_KEY
#   NEXTAUTH_SECRET

ARG APP=cases

# ── deps stage ───────────────────────────────────────────────────────────────
FROM node:20-bullseye AS deps
RUN apt-get update && apt-get install -y openssl libssl1.1 libssl-dev ca-certificates && rm -rf /var/lib/apt/lists/*

# Install pnpm — pin to exact version matching packageManager in package.json
RUN corepack enable && corepack prepare pnpm@10.30.1 --activate

WORKDIR /app

# Copy workspace manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/database/package.json ./packages/database/
COPY packages/shared-lib/package.json ./packages/shared-lib/
COPY packages/ui/package.json ./packages/ui/
COPY packages/config/package.json ./packages/config/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/tsconfig/package.json ./packages/tsconfig/

ARG APP
COPY apps/${APP}/package.json ./apps/${APP}/

# pnpm v10 onlyBuiltDependencies is declared in package.json — no CLI override needed
RUN pnpm install --frozen-lockfile

# ── builder stage ─────────────────────────────────────────────────────────────
FROM node:20-bullseye AS builder

ARG CACHE_BUST=20260220000000
ARG APP=cases

RUN apt-get update && apt-get install -y openssl libssl1.1 libssl-dev ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.30.1 --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=deps /app/apps/${APP}/node_modules ./apps/${APP}/node_modules

# Copy shared packages source
COPY packages/ ./packages/

# Copy the target app
COPY apps/${APP}/ ./apps/${APP}/

# Copy root config
COPY package.json pnpm-workspace.yaml turbo.json ./

# Environment variables required at build time
ARG DATABASE_URL
ARG OPENAI_API_KEY
ARG NEXTAUTH_SECRET

ENV DATABASE_URL=$DATABASE_URL
ENV OPENAI_API_KEY=$OPENAI_API_KEY
ENV NEXTAUTH_SECRET=$NEXTAUTH_SECRET
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Generate Prisma client from shared schema
RUN cd packages/database && npx prisma generate

# Build the target app
RUN cd apps/${APP} && pnpm run build

# ── runner stage ──────────────────────────────────────────────────────────────
FROM node:20-bullseye AS runner

ARG APP=cases

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Puppeteer configuration for Debian
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Install Chromium and all necessary dependencies for Puppeteer on Bullseye
RUN apt-get update && apt-get install -y --fix-missing \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    ca-certificates \
    openssl \
    libssl1.1 \
    && rm -rf /var/lib/apt/lists/*

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/${APP}/public ./public
COPY --from=builder /app/packages/database/prisma ./prisma

# Set correct permissions
RUN mkdir -p .next storage/uploads
RUN chown -R nextjs:nodejs .next storage/uploads

# Leverage output traces
COPY --from=builder --chown=nextjs:nodejs /app/apps/${APP}/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/${APP}/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
