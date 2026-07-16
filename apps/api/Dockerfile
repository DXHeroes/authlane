FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.23.0 --activate
ENV PUPPETEER_SKIP_DOWNLOAD=true
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
COPY integrations ./integrations
RUN --mount=type=cache,id=authlane-pnpm-store,target=/pnpm/store \
  pnpm config set store-dir /pnpm/store \
  && pnpm install --frozen-lockfile

RUN pnpm --filter @authlane/api... build \
  && pnpm --filter @authlane/dashboard build \
  && pnpm --filter @authlane/widget build

FROM node:22-alpine AS runner

RUN corepack enable && corepack prepare pnpm@10.23.0 --activate
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 authlane

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --from=builder /app/apps/api ./apps/api
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/integrations ./integrations
RUN --mount=type=cache,id=authlane-pnpm-store,target=/pnpm/store \
  find apps packages integrations -type d -name node_modules -prune -exec rm -rf '{}' + \
  && pnpm config set store-dir /pnpm/store \
  && pnpm install --frozen-lockfile --prod \
  && chown -R authlane:nodejs /app

COPY --from=builder /app/apps/dashboard/dist ./public
COPY --from=builder /app/apps/widget/dist ./public/connect

ENV NODE_ENV=production \
  API_HOST=0.0.0.0 \
  API_PORT=3000 \
  AUTHLANE_PUBLIC_DIR=/app/public

EXPOSE 3000
USER authlane

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["sh", "-c", "node packages/database/dist/migrate.js && node apps/api/dist/index.js"]
