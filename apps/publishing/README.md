# Server publishing

The API accepts publication artifacts only from this internal compiler. The admin
editor saves canonical documents, requests a revision-bound compilation, then
publishes its job ID. Invalid LaTeX and diagram source can be saved as drafts but
cannot be published. Editing during compilation requires a new compilation.

Math authoring uses Publisle's block and inline editors and KaTeX validation.
Mermaid, Graphviz, PlantUML and WaveDrom compile to high-resolution PNG pairs for
light and dark themes. Source disclosures and full-size links remain available.
Readers load no static diagram engine. Interactive blocks retain their own loader.

## Deployment

Use the publishing service in `voidreg-solution/compose.yaml`. Set a strong shared
`COMPILER_TOKEN` in the solution's private `.env`. Only the API and worker need
this token. Set API `COMPILER_URL` to the internal service URL. Never expose the
worker port through a public proxy. Its health check is unauthenticated; rendering,
job and asset endpoints require the token.

The image contains Chromium, Graphviz, a checksum-pinned PlantUML jar, WaveDrom,
Mermaid and IBM Plex fonts. A single job queue bounds concurrency. Compose caps
CPU, memory and process count. Browser rendering denies outbound requests and
closes when idle. PlantUML uses its sandbox security profile; WaveDrom accepts
strict JSON. External diagram resources and PlantUML includes are unsupported.

Back up the `publishing-data` volume alongside the database: published snapshots
reference its immutable PNGs. Completed job records expire after 24 hours; PNGs
remain available. Failed or interrupted jobs can be retried. Restarted in-flight
jobs are marked failed rather than silently publishing partial output.

Roll out the compiler and API first. Before deploying the reader without its old
Mermaid loader, regenerate any existing diagram publications:

```sh
PUBLISHING_ORIGIN=https://www.voidreg.xyz \
ADMIN_COOKIE_FILE=/private/admin-cookie.txt node publishing/migrate.mjs
```

The cookie file contains the Cookie header from an authenticated administrator
session, including its CSRF cookie, and should be readable only by its owner.
The script compiles each published snapshot and replaces only that snapshot's
artifact using a revision check. Private working edits, public copy and publication
dates remain unchanged. It stops on failures and is safe to rerun. Remove the
cookie file afterward. Deploy the admin and reader after migration succeeds.

## Local checks

```sh
pnpm check
pnpm exec tsc -p publishing/tsconfig.json
pnpm mcp:check
pnpm mcp:test
pnpm publishing:build
COMPILER_TOKEN=local-test-secret node publishing/smoke.mjs
```

For local development set `COMPILER_TOKEN`, `CHROMIUM_PATH`, `PLANTUML_JAR` and
optionally `COMPILER_DATA_PATH`, then run `pnpm publishing:dev`. The worker listens
on loopback port 18084 by default. API tests use an isolated compiler fixture;
`smoke.mjs` checks all four real engines, both PNG themes, invalid diagram source,
and invalid LaTeX against the running worker.

Preview asset URLs require an admin session. Public asset URLs return images only
while a non-archived published snapshot references them. Draft publication and
migration permissions remain enforced by the API, independently of the editor UI.
