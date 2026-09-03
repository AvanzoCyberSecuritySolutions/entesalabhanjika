# syntax=docker/dockerfile:1

# ---- build stage --------------------------------------------------------
# poppler-utils provides pdftoppm/pdftocairo for scripts/build-assets.ts
# (ADR 0002) — not present in a stock Node image, so it's installed here
# rather than assumed on the host.
FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends poppler-utils \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
# npm run build == npm run build:assets && vite build (package.json)
RUN npm run build

# ---- serve stage ---------------------------------------------------------
FROM nginx:1.27-alpine AS serve

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
