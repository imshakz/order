FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json .npmrc ./
RUN npm install --no-audit --no-fund
COPY . .
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=""
ARG NEXT_PUBLIC_RESTAURANT_NAME="Ember & Oak"
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_RESTAURANT_NAME=$NEXT_PUBLIC_RESTAURANT_NAME \
    NEXT_TELEMETRY_DISABLED=1
RUN mkdir -p public && npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
