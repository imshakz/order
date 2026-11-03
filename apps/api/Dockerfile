# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npx prisma generate && npm run build

# ---- runtime ----
FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache openssl tini
ENV NODE_ENV=production
COPY package*.json ./
COPY prisma ./prisma
RUN npm install --omit=dev --no-audit --no-fund && npx prisma generate && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s CMD wget -qO- http://localhost:4000/api/health || exit 1
ENTRYPOINT ["/sbin/tini", "--", "./docker-entrypoint.sh"]
