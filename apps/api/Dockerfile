# Playwright's own image, so the Chromium build the scraper needs ships with every
# OS-level dependency already installed. Using the plain node:20 image here works
# right up until the first live audit, which needs a real browser to render pages
# and export PDFs (apps/api/src/collectors/browser.ts).
FROM mcr.microsoft.com/playwright:v1.62.1-jammy AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace @sensi/shared --workspace @sensi/api

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY tsconfig.base.json ./
RUN npm run build --workspace @sensi/shared && npm run build --workspace @sensi/api

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api ./apps/api
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "dist/index.js"]
