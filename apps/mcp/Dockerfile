# syntax=docker/dockerfile:1
# Build context is the repository root: docker build -f apps/mcp/Dockerfile .
FROM node:25-bookworm-slim AS build
WORKDIR /repo
RUN npm install --global pnpm@11.17.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/mcp/package.json apps/mcp/
COPY packages/authoring/package.json packages/authoring/
COPY packages/publishing-ui/package.json packages/publishing-ui/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --filter voidreg-mcp...
COPY packages packages
COPY apps/mcp apps/mcp
RUN pnpm --filter voidreg-mcp build \
    && pnpm --filter voidreg-mcp deploy --prod --legacy /out \
    && cp -r apps/mcp/dist /out/dist

FROM node:25-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8090 NODE_OPTIONS=--max-old-space-size=384
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/dist ./dist
USER node
EXPOSE 8090
CMD ["node", "dist/server.mjs"]
