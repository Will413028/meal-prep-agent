FROM node:26.8.1-bookworm-slim@sha256:367679cf9792759492a486e4aa4b421764d71a9546a6dae8aab81a99eb797b3e AS build
RUN npm install --global pnpm@11.2.2
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile --filter @meal-prep/web...
COPY apps/web ./apps/web
COPY apps/web/tests/fixtures ./apps/web/tests/fixtures
COPY data/nutrition-v1.json ./data/nutrition-v1.json
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @meal-prep/web build

FROM node:26.8.1-bookworm-slim@sha256:367679cf9792759492a486e4aa4b421764d71a9546a6dae8aab81a99eb797b3e
WORKDIR /app
RUN mkdir -p /var/lib/meal-prep && chown node:node /var/lib/meal-prep
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=14319
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 14319
CMD ["node", "apps/web/server.js"]
