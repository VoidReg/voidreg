# Voidreg

Source for the Voidreg site: public reader, admin workspace, API, and deployment.

| Path | What it is |
| --- | --- |
| `apps/web` | SvelteKit reader (server-rendered blog and projects, Node adapter) |
| `apps/admin` | SvelteKit single-page admin and editor, served at `/admin/` |
| `apps/mcp` | MCP server for draft authoring (HTTP, Node) |
| `apps/publishing` | Internal compiler: diagrams to PNG, math validation (Node, Chromium) |
| `apps/api` | Rust API (Actix, Turso/libSQL) |
| `packages/publishing-ui` | Reader components, sanitizer and renderer allowlist shared by web and admin |
| `packages/authoring` | Block definitions and document compilation shared by admin, mcp and publishing |
| `deploy` | Docker Compose, nginx and operations docs |

The Penpot design workspace lives in the separate `voidreg-ui` repository.

## Publisle

[Publisle](https://github.com/VoidReg/publisle) is a separate project. Voidreg consumes
its published `@publisle/*` packages from the npm registry. Versions are declared once
in the `catalog:` block of `pnpm-workspace.yaml`, and Dependabot opens one grouped pull
request per upgrade wave. Never point the build at unreleased Publisle output.

## Development

Requires Node 24, pnpm 11 and (for the API) a stable Rust toolchain.

```sh
pnpm install
pnpm check      # type-check all TypeScript workspaces
pnpm lint
pnpm test       # web, admin and mcp unit and integration tests
pnpm build

pnpm dev:web    # reader, proxies /api to localhost:8080
pnpm dev:admin  # admin on port 5174

cd apps/api && cargo test && cargo lint
```

Per-app notes: [web](apps/web/README.md), [admin](apps/admin/README.md),
[mcp](apps/mcp/README.md), [publishing](apps/publishing/README.md),
[api publishing contract](apps/api/PUBLISHING.md), and [deploy](deploy/PUBLISHING.md).

## Docker and deployment

Images build from the repository root:

```sh
docker build -f apps/web/Dockerfile -t voidreg-web .
docker build -f apps/mcp/Dockerfile -t voidreg-mcp .
docker build -f apps/publishing/Dockerfile -t voidreg-publishing .
docker build -t voidreg-api apps/api
```

`deploy/compose.yaml` builds web, mcp and publishing from this checkout and pulls the
API image from GHCR. Production data lives in external `voidreg_*` volumes. CI is in
`.github/workflows`: `node.yml` for the TypeScript workspaces and image builds, and
`api.yml` for Rust checks and the API image. CI never deploys: production is
updated from a local machine with [`deploy/deploy.sh`](deploy/DEPLOY.md).
