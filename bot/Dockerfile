FROM node:20-alpine AS build
WORKDIR /app
COPY bot/package.json bot/package-lock.json bot/tsconfig.json ./bot/
COPY bot/src ./bot/src
COPY src ./src
COPY public/data/snapshots ./public/data/snapshots
RUN cd bot && npm ci && npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/bot/node_modules ./bot/node_modules
COPY --from=build /app/bot/dist ./bot/dist
COPY --from=build /app/public/data/snapshots ./public/data/snapshots
ENV SNAPSHOTS_DIR=/app/public/data/snapshots
CMD ["node", "bot/dist/bot/src/index.js"]
