# syntax=docker/dockerfile:1

##########  BUILD STAGE  ##########
FROM node:22-slim AS build
WORKDIR /app

# OS packages needed to compile native modules (bcrypt) and for Prisma (openssl)
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies first (better build caching)
COPY package*.json ./
RUN npm install

# Copy the rest of the source and build (prisma generate + tsc)
COPY . .

# Build-only Prisma vars (override via --build-arg if needed)
ARG DIRECT_URL
ENV DIRECT_URL=$DIRECT_URL

# Compile: prisma generate + tsc -> dist/  (REQUIRED — do not remove; without it dist/ is empty)
RUN npm run build

# Prisma may emit non-.ts runtime assets (e.g. .wasm) that tsc doesn't copy —
# make sure they land next to the compiled client in dist/
RUN cp -R src/generated/client/. dist/generated/client/ 2>/dev/null || true

# Drop dev dependencies to slim the runtime node_modules
RUN npm prune --omit=dev

##########  RUNTIME STAGE  ##########
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# openssl is required by Prisma at runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

EXPOSE 8080
CMD ["node", "dist/server.js"]
