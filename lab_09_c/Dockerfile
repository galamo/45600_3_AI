# Production image: builds the React client and the TypeScript server, runs as non-root.
#   docker compose --profile app up -d --build
FROM node:22-alpine AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npx tsc --noEmit && npx vite build --outDir /app/public --emptyOutDir

FROM node:22-alpine AS server-build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=server-build /app/server/dist ./dist
COPY --from=client /app/public ./public
USER node
EXPOSE 3012
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3012/api/health || exit 1
CMD ["node", "dist/server.js"]
