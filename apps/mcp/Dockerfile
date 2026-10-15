# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@11.17.0
COPY package.json pnpm-lock.yaml ./
COPY vendor ./vendor
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY mcp ./mcp
COPY src/lib/blocks.ts src/lib/authoring.ts ./src/lib/
COPY src/lib/publishing/renderers.ts ./src/lib/publishing/renderers.ts
RUN pnpm mcp:build && pnpm prune --prod --ignore-scripts

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8090 NODE_OPTIONS=--max-old-space-size=384
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist-mcp ./dist-mcp
USER node
EXPOSE 8090
CMD ["node", "dist-mcp/server.mjs"]
