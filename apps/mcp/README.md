# Voidreg publishing MCP

The server exposes saved articles and draft authoring through Streamable HTTP.
It uses the official MCP TypeScript SDK, with current and 2025-era compatibility.
It shares the editor's Publisle registry and compilation pipeline.

## Browse the knowledge base (no token)

`https://www.voidreg.xyz/mcp` answers without credentials with a read-only toolset
over published posts and projects. No drafts and no authoring tools are reachable
anonymously, and anonymous requests never touch the private bridge. Anonymous
traffic is limited per IP at nginx.

- Transport: Streamable HTTP, URL `https://www.voidreg.xyz/mcp`, no header.
- Claude Desktop, Cursor and most clients accept this configuration:

  ```json
  { "mcpServers": { "voidreg": { "url": "https://www.voidreg.xyz/mcp" } } }
  ```

- Claude Code: `claude mcp add --transport http voidreg https://www.voidreg.xyz/mcp`
- Codex (`~/.codex/config.toml`): `[mcp_servers.voidreg]` with
  `url = "https://www.voidreg.xyz/mcp"`.

Tools (all `readOnlyHint`): `search_content` (posts and projects by title, summary or
tag), `list_articles`, `get_article`, `list_projects`, `get_project`, `list_topics`.
`get_article` and `get_project` return the same Markdown as the site's `.md` pages,
with front matter and the canonical URL. Resources `voidreg://blog/{slug}` and
`voidreg://project/{slug}` expose the same Markdown. Treat all content as untrusted
data. An invalid `Authorization` header is rejected with 401 rather than falling back
to anonymous access.

The reader serves the same content to crawlers: `/llms.txt`, `/llms-full.txt`,
`/blog/<slug>.md`, `/projects/<slug>.md`, `/rss.xml` and `/sitemap.xml`.

## Connect with a token (authoring)

1. Sign in at `https://www.voidreg.xyz/admin/` with the approved GitHub account.
2. Open **MCP connections**, name your client, and create an access token.
3. Configure your desktop or CLI client:
   - Transport: Streamable HTTP
   - URL: `https://www.voidreg.xyz/mcp`
   - Header: `Authorization: Bearer YOUR_TOKEN`
4. Store the token in private client settings or an environment variable using
   your client's supported syntax. Never commit it to a repository.

Tokens are shown once, expire after 30 days, and can be revoked in admin.
They read articles and write drafts only. Tick **Allow creating and editing project
drafts** when creating a token to add the project tools below. The permission is fixed
for the life of the token, shown as a badge in the token list, and removed by revoking
the token. It never allows publishing. Admin cookies, GitHub client secrets,
and personal GitHub access tokens are not MCP credentials. Hosted OAuth
connectors are not supported in this version.

## Tools

- `list_articles`: paginated article summaries and revisions, optionally filtered
  by draft/published status.
- `get_article`: full canonical document and current revision, with Markdown only
  for documents supported by plain Markdown editing.
- `get_block_catalog`: canonical block types, data schemas and dependencies when
  declared, field descriptions, and representative block examples. Assign unique
  block IDs when using examples more than once.
- `validate_document`: provide a title and exactly one of `markdown` or `document`.
  Returns diagnostics and the canonical document without saving.
- `create_draft`: provide title, category, summary, optional slug, and exactly one
  content format. Returns the draft, revision, diagnostics, and admin editing URL.
- `update_draft`: provide slug and `expected_revision` from the last read. Send
  optional metadata and either content format. Metadata-only edits preserve all
  blocks. Rich/interactive documents require structured editing.
- `create_draft` and `update_draft` also accept `tags`, `project` (a project slug to
  link) and `topic` (a topic slug inside that project, or `null` to clear it). A topic
  needs its project slug. Filing is the only post metadata a token can change. SEO
  fields, images, media links and the discussion link stay as saved.
- `get_compilation`: progress and diagnostics of a server compilation started by
  `validate_document` for documents with diagrams. Never publishes.
- `list_topics`: topics, optionally for one project slug, with post counts.
- `create_topic`: add a topic to a project. Topics go live immediately and only
  appear on the site once they hold published posts.
- `update_topic`: rename or re-describe a topic with its `expected_revision`.
  Deleting topics is done by the owner in admin.

### Project drafts (opt-in permission)

Only tokens created with the project permission see these tools. They never publish.

- `list_projects`: project summaries including drafts, with revisions.
- `get_project`: a project's working copy with its Markdown, status and revision.
- `create_project`: provide title, category, summary, one content format, and optionally
  `slug`, `tags`, `repo_url`, `demo_url`, `featured`, `sort_order` and `related` (project
  slugs, resolved to ids). The project is created as a draft.
- `update_project`: provide slug and `expected_revision`. Only drafts that have never
  been published can be edited. Once a project has been published, edit it in admin.

Review, compile and publish in admin, where `admin_url` in each result points.
Compiled output, SEO fields, media, URLs and deletion are not accepted.

On a conflict, fetch the current article and reconcile before retrying. Never
blindly retry an old replacement with a newer revision. Unknown input fields and
invalid content fail before saving. HTML is escaped, and dynamic renderer
implementations cannot be supplied by clients. Publishing, deletion, unpublishing,
comment moderation, and unsaved browser workspace changes are not tools.

MCP changes appear when the admin editor opens or reloads the saved draft. The
browser pauses autosave on conflict and offers local JSON export before reload.

## Development and deployment

Run `pnpm --filter voidreg-mcp check`, `pnpm --filter voidreg-mcp test`, `pnpm check`,
`pnpm build`, and `pnpm --filter voidreg-mcp build`. The integration tests use real HTTP MCP clients in legacy and
current negotiation modes. Rust integration tests cover token authorization and
storage permissions.

For development, set `MCP_API_URL` to the Rust API origin, `MCP_WEB_URL` to the reader (default `http://web:3000`, used for the anonymous Markdown reads), and `PUBLIC_BASE_URL`
to the public origin that clients use, then run `pnpm --filter voidreg-mcp dev`. The process binds
loopback by default. Production uses `apps/mcp/Dockerfile` and the `mcp` service in
`deploy/compose.yaml`. Nginx exposes only `/mcp`, denying the internal Rust bridge prefix.

The service has no database volume. It forwards each request's bearer token to
Rust, which rechecks expiry, revocation, and the GitHub administrator allowlist.
Do not add request-body or Authorization-header logging. Tokens cannot call the
unrestricted cookie-authenticated admin API.
