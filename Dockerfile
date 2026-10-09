# syntax=docker/dockerfile:1
# AccountEX: Next.js pages + NestJS API served from one Node process on PORT (default 3000).

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
# prisma generate (postinstall) only needs DATABASE_URL to be present, not reachable.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npm ci
COPY . .
# next build type-checks the whole repo and exceeds the default ~2 GB Node heap on CI runners.
RUN NODE_OPTIONS=--max-old-space-size=4096 npm run build
RUN npm prune --omit=dev

FROM node:24-alpine AS runtime
# pg_dump for on-demand backups (System Health > Backups)
RUN apk add --no-cache postgresql-client
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    BACKUP_DIR=/data/backups \
    UPLOAD_DIR=/data/uploads
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./
RUN mkdir -p /data/backups /data/uploads && chown -R node:node /data /app
USER node
EXPOSE 3000
CMD ["node", "dist/server/main"]
