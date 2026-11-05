# syntax=docker/dockerfile:1
# Static admin build. Build context is the repository root. Export the files with:
#   docker build -f apps/admin/Dockerfile --target export --output type=local,dest=apps/admin/build .
FROM node:24-bookworm-slim AS build
WORKDIR /repo
RUN npm install --global pnpm@11.17.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/admin/package.json apps/admin/
COPY packages/authoring/package.json packages/authoring/
COPY packages/publishing-ui/package.json packages/publishing-ui/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --filter voidreg-admin...
COPY packages packages
COPY apps/admin apps/admin
RUN pnpm --filter voidreg-admin build

FROM scratch AS export
COPY --from=build /repo/apps/admin/build /
