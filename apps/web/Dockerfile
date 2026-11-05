# syntax=docker/dockerfile:1
# Build context is the repository root: docker build -f apps/web/Dockerfile .
FROM node:24-bookworm-slim AS build
WORKDIR /repo
RUN npm install --global pnpm@11.17.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/
COPY packages/publishing-ui/package.json packages/publishing-ui/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --filter voidreg-web...
COPY packages/publishing-ui packages/publishing-ui
COPY apps/web apps/web
RUN pnpm --filter voidreg-web build \
    && pnpm --filter voidreg-web deploy --prod --legacy /out \
    && cp -r apps/web/build /out/build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /out/build ./build
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/package.json ./package.json
USER node
EXPOSE 3000
CMD ["node", "build"]
