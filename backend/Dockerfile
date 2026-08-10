# syntax=docker/dockerfile:1

# ---------- Base ----------
FROM node:18-alpine AS base
WORKDIR /app
RUN apk add --no-cache python3 make g++

# ---------- Dependencies ----------
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ---------- Runtime ----------
FROM node:18-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S nodegroup && adduser -S nodeuser -G nodegroup

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN mkdir -p logs uploads && chown -R nodeuser:nodegroup /app

USER nodeuser

EXPOSE 5000

CMD ["node", "src/server.js"]