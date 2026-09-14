# Four deployables out of one tree, so four targets out of one Dockerfile.
# Build a single one with:  docker build --target storefront .

# ---------------------------------------------------------------- build ----
FROM node:20-slim AS build
WORKDIR /app

# The workspace manifests have to land before `npm ci`, because npm resolves the
# workspace graph from them — with only the root package.json here, the install
# does not know apps/pos exists and the lockfile check fails.
COPY package.json package-lock.json ./
COPY packages/domain/package.json packages/domain/
COPY apps/core/package.json apps/core/
COPY apps/pos/package.json apps/pos/
COPY apps/admin/package.json apps/admin/
COPY apps/storefront/package.json apps/storefront/
RUN npm ci

COPY . .
RUN npm run build

# ----------------------------------------------------------------- core ----
# The only image that talks to Postgres.
FROM node:20-slim AS core
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist/server.mjs ./dist/server.mjs
# The till is still served by the core in production, exactly as it was before
# this feature — apps/core/index.ts falls back to dist/public for any non-API
# path. The pos image below is the new, independent way to serve it; this is the
# old one, kept because changing behaviour is a non-goal of Feature 27.
COPY --from=build /app/dist/public ./dist/public
EXPOSE 5000
CMD ["node", "dist/server.mjs"]

# ------------------------------------------------------- the three SPAs ----
# Static bundles behind nginx, each proxying /api to the core. They share one
# config because they are the same shape: a single-page app that needs its
# unknown paths handed back to index.html rather than 404'd.
FROM nginx:alpine AS pos
COPY docker/spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/public /usr/share/nginx/html
EXPOSE 80

FROM nginx:alpine AS admin
COPY docker/spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/admin /usr/share/nginx/html
EXPOSE 80

FROM nginx:alpine AS storefront
COPY docker/spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/storefront /usr/share/nginx/html
EXPOSE 80
