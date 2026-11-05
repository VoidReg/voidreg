# Voidreg publishing MCP

The server exposes saved articles and draft authoring through Streamable HTTP.
It uses the official MCP TypeScript SDK, with current and 2025-era compatibility.
It shares the editor's Publisle registry and compilation pipeline.

## Connect

1. Sign in at `https://www.voidreg.xyz/admin/` with the approved GitHub account.
2. Open **MCP connections**, name your client, and create an access token.
3. Configure your desktop or CLI client:
   - Transport: Streamable HTTP
   - URL: `https://www.voidreg.xyz/mcp`
   - Header: `Authorization: Bearer YOUR_TOKEN`
4. Store the token in private client settings or an environment variable using
   your client's supported syntax. Never commit it to a repository.

Tokens are shown once, expire after 30 days, and can be revoked in admin.
They read articles and write drafts only. Admin cookies, GitHub client secrets,
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

On a conflict, fetch the current article and reconcile before retrying. Never
blindly retry an old replacement with a newer revision. Unknown input fields and
invalid content fail before saving. HTML is escaped, and dynamic renderer
implementations cannot be supplied by clients. Publishing, deletion, unpublishing,
comment moderation, and unsaved browser workspace changes are not tools.

MCP changes appear when the admin editor opens or reloads the saved draft. The
browser pauses autosave on conflict and offers local JSON export before reload.

## Development and deployment

Run `pnpm mcp:check`, `pnpm mcp:test`, `pnpm check`, `pnpm build`, and
`pnpm mcp:build`. The integration tests use real HTTP MCP clients in legacy and
current negotiation modes. Rust integration tests cover token authorization and
storage permissions.

For development, set `MCP_API_URL` to the Rust API origin and `PUBLIC_BASE_URL`
to the public origin that clients use, then run `pnpm mcp:dev`. The process binds
loopback by default. Production uses `mcp/Dockerfile` and the solution Compose
service. Nginx exposes only `/mcp`, denying the internal Rust bridge prefix.

The service has no database volume. It forwards each request's bearer token to
Rust, which rechecks expiry, revocation, and the GitHub administrator allowlist.
Do not add request-body or Authorization-header logging. Tokens cannot call the
unrestricted cookie-authenticated admin API.
