# syntax=docker/dockerfile:1
# Build context is the repository root: docker build -f apps/publishing/Dockerfile .
FROM node:24-bookworm-slim AS build
WORKDIR /repo
RUN npm install --global pnpm@11.17.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/publishing/package.json apps/publishing/
COPY packages/authoring/package.json packages/authoring/
COPY packages/publishing-ui/package.json packages/publishing-ui/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --filter voidreg-publishing...
COPY packages packages
COPY apps/publishing apps/publishing
RUN pnpm --filter voidreg-publishing build \
    && pnpm --filter voidreg-publishing deploy --prod --legacy /out \
    && cp -r apps/publishing/dist /out/dist

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium graphviz default-jre-headless fonts-dejavu-core curl ca-certificates tini && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /opt/plantuml && curl -fsSL https://github.com/plantuml/plantuml/releases/download/v1.2026.9/plantuml.jar -o /opt/plantuml/plantuml.jar && echo 'aa4a1d06f8911c4b842beff4828dd955be431692b631a312d04c0e9fab9581de  /opt/plantuml/plantuml.jar' | sha256sum -c -
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8092 NODE_OPTIONS=--max-old-space-size=192 COMPILER_SOURCE_ROOT=/app/publishing COMPILER_CSS_PATH=/app/src/app.css COMPILER_DATA_PATH=/data/publishing CHROMIUM_PATH=/usr/bin/chromium
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/dist ./dist
COPY --chown=node:node apps/publishing/browser.mjs ./publishing/browser.mjs
COPY --chown=node:node apps/admin/src/app.css ./src/app.css
RUN mkdir -p /data/publishing && chown -R node:node /data/publishing
USER node
EXPOSE 8092
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/server.mjs"]
