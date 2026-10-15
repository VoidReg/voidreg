# Voidreg Admin

Local SvelteKit SPA for authoring API-backed articles. Static output lives in
`build` and is served at `/admin/` by voidreg-solution. No deployment is required
to publish a new article.

Run `pnpm install`, `pnpm check`, and `pnpm build`. For development, start the API
at localhost:8080, then `pnpm dev`. Requests proxy to the API. Set
`VOIDREG_API_PROXY` to override the development target. Configure provider OAuth credentials and approved account IDs as described in
voidreg-api/PUBLISHING.md. Password login is disabled by default and can be
explicitly enabled for local development.

The editor supports all core block types, footnotes, technical schematics, and a
host-defined counter example. Metadata autosaves after 1.5 seconds when required
fields are present. Save failures preserve the local editor state and pause
autosave until another edit or manual save. Unsaved changes prompt before leaving.
Publish compiles and validates through Publisle first; server validation provides
a second boundary. A published article requires a fresh compilation on every
canonical document update. Unpublish to work on incomplete drafts.

Blocks have typed field panels, JSON fallback, drag reordering, and keyboard
move controls. Markdown export is intended for supported interchange; use JSON
to preserve complete custom payloads. Imports replace the active document after
confirmation. Core schema and accessibility diagnostics appear next to preview.

Custom definitions live in `src/lib/blocks.ts`. Register a namespaced type, schema
parser, descriptor payload schema, editable field specs, and default content.
`SchemaPayload.svelte` renders number, string, and boolean payload forms; complex
payloads use JSON. Reader-approved island implementations and compile renderer
mapping live in `src/lib/publishing/renderers.ts`. Add the same renderer to
voidreg-web first, then run `python3 scripts/refresh-site-renderers.py` here.
The shared source is the reader repository; admin keeps a reviewed snapshot.

Both previews and public reading sanitize compiled HTML. Arbitrary stored module
URLs are never loaded. The counter is an authoring example, not a circuit
simulator. Technical schematics currently show their authored static alternative
until the host supplies a reviewed schematic implementation. Unsupported diagram
engines and embeds similarly retain authored fallbacks. Raw HTML is escaped.

Dependencies use locally packed Publisle tarballs plus pnpm workspace overrides
for all transitive Publisle packages. Build Publisle, then run
`python3 scripts/refresh-publisle.py --source ../publisle` to refresh the pins.
Run install, checks, and build after refreshing. Keep tarballs and lockfile together.
The Vite alias for the packed playground Svelte source works around its current
dist component importing `./index.ts`. Remove the alias after upstream packaging
is fixed and verified. No changes to Publisle source are required.

OAuth provider exchange requires real credentials and remains a deployment check.
Penpot reconciliation is deferred per PLAN-publishing-integration.md. This app
uses the existing site tokens; no Penpot boards were mutated.

## Focused writing workspace

The editor separates document order, writing, and secondary settings. On wide
screens, the outline sits beside the writing column and the Article/Block
inspector. Select a block to open its content form; other blocks remain readable
summaries. Done returns keyboard focus to that block. New blocks insert after the
selection, or at the end when nothing is selected. Drag the outline to reorder,
or use Move up/Move down in Block settings.

Write and Preview are separate modes. The top bar keeps Save and Publish (Update
for published articles) available while scrolling. Slug, category, featuring,
ordering, publishing checks, import/export, and article actions live in Article
settings. Autosave indicates when required article details are incomplete.

At narrower container widths, outline and settings become dedicated views instead
of reducing the writing area. Container queries also respond to enlarged root
text. Content textareas grow with the writing. Advanced JSON remains available in
Block settings. The editor source lives in src/lib/editor/; publishing and session
operations stay in src/routes/+page.svelte.

## Admin sign-in

The sign-in screen discovers configured GitHub/Google providers from the API.
Provider redirects and code exchanges run on the server. Only explicitly
allowlisted provider account IDs can receive an admin session. Commenter login
does not grant admin rights. A denied Google sign-in displays its own account
ID for explicit approval; email addresses and GitHub usernames are not allowlist
keys. Cancellation and unauthorized-account messages stay in the sign-in screen.
Authentication callback parameters are removed from browser history after use.
