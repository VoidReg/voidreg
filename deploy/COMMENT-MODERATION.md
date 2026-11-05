# Comment abuse protection and moderation

## Deployment

Set `COMMENT_IP_SALT` to a nonempty, persistent secret before starting the API. Keep an existing deployment's value unchanged: source identifiers and IP blocks depend on it. A missing value now stops startup instead of silently generating unsalted identifiers. Use a secret manager or a private environment file. Raw IP addresses are not retained by the moderation database. If an older deployment used an empty secret, historical source hashes cannot be linked to new hashes after setting a secret; account identities remain usable, and historical hashes remain stored for review.

Only explicitly trusted peers may supply the final `X-Forwarded-For` hop. `TRUSTED_PROXY_CIDRS` accepts comma-separated exact addresses or CIDRs; empty means ignore all forwarding headers. The Compose configuration gives nginx a fixed backend address, `${VOIDREG_PROXY_IP:-172.30.45.10}`, on `${VOIDREG_BACKEND_SUBNET:-172.30.45.0/24}` and trusts only that peer. Change both variables together if this subnet conflicts with an existing network. The API is not published directly to the host. Verify the effective client address at the edge when using an additional external proxy; do not trust arbitrary incoming forwarding headers.

Startup runs additive, idempotent migrations. Existing comment bodies, statuses, account IDs, source hashes, and publication discussion keys remain intact. An indexed ancestor table supports hidden-parent placeholders and database pagination without recursive queries, which the current Turso engine does not support.

## Admission policy

Signed-in users continue to publish automatically when checks pass. Anonymous submissions wait for approval. The same rules apply to comments and replies.

Database transactions serialize block checks, quota checks, duplicate detection, parent validation, and comment insertion. Transient write conflicts are retried with bounded backoff; persistent contention fails closed with a temporary-unavailability response. Limits persist across restarts and apply to both the source and authenticated account. Rotating addresses does not reset an account's quota. A shared address can therefore affect several readers; source association is not proof of shared identity.

Default environment settings:

| Setting | Default | Meaning |
| --- | --- | --- |
| `COMMENT_ANON_HOURLY` | 5 | Anonymous source attempts per hour |
| `COMMENT_ANON_ARTICLE_HOURLY` | 2 | Anonymous source attempts per article per hour |
| `COMMENT_USER_HOURLY` | 60 | Signed-in source/account attempts per hour |
| `COMMENT_USER_ARTICLE_HOURLY` | 30 | Signed-in source/account attempts per article per hour |
| `COMMENT_BURST` | 3 | Source/account attempts per 10 seconds |

Values must be integers from 1 to 10000. Repeated normalized text from the same account/source within 10 minutes is rejected. Rate-limit responses use HTTP 429 and include `Retry-After`. Honeypot submissions receive a normal pending acknowledgement without storing their text. Submissions containing at least four HTTP(S) links are stored in the Spam queue, with a reason, and are never automatically published. Public comment JSON is limited to 8 KiB, while the existing 2000-character body limit remains.

Checks fail closed if the moderation database is unavailable. These controls limit abuse; they cannot identify every spam message or distinguish every reader behind a shared network. No external classifier or CAPTCHA service is required.

## Dashboard workflow

Open Comments in the admin dashboard. Views include Comments, Users, Sources, Blocks, Spam activity, and Moderation history. Each list uses server pagination. Filter comments by state, account, source, article, date, or text. Sources show account associations without merging accounts; account profiles come from existing OAuth identities.

Approve publishes a reviewed comment. Mark spam quarantines it. Hide removes it from public display. Return to review changes a spam or hidden comment to pending. Remove text irreversibly clears its public body and name while retaining moderation attribution.

Block user applies to the account across addresses. Block source applies to signed-in and anonymous submissions from that source. Administrators can also enter an exact IPv4/IPv6 address, which is immediately hashed. A required reason, affected contribution count, and explicit confirmation precede every block. Account blocks default to permanent; source blocks default to 24 hours, with 7-day and permanent choices. Subnet blocking is not supported.

Blocking hides existing approved/pending contributions and prevents new submissions. Other readers' visible replies remain available beneath a neutral parent placeholder. Unblocking or expiry permits new submissions but does not restore old contributions. Unblock every active account/source restriction before approving or returning affected comments to review. A second active block for the same target is rejected to avoid ambiguous overlapping blocks.

## Data retention and interfaces

Abuse activity is aggregated by minute, source, account, and reason. It stores no rejected body or raw IP and is pruned after 30 days during admission or list access. Admission fingerprints/counters are retained for one hour. Account/source associations and last-seen metadata persist for administration. Moderator action history and block records persist for accountability. Source IDs, emails, reasons, and audit data are never included in public discussion responses. Reverse proxy access logs have their own retention policy, independent of this database policy.

Admin interfaces require a live admin session; all mutations and previews require its CSRF token:

- `GET /api/v1/admin/moderation/summary`
- `GET /api/v1/admin/moderation/{comments|users|sources|blocks|events|audit}`
- `POST /api/v1/admin/moderation/block-preview` with `{kind,target}`
- `POST /api/v1/admin/moderation/blocks` with `{kind,target,reason,hours}`; kind is `user`, `source`, or `ip`, and null hours means permanent.
- `POST /api/v1/admin/moderation/blocks/{id}/revoke`
- `POST /api/v1/admin/moderation/comments/{id}/{approve|spam|hide|restore|remove}` with `{reason}`

List queries accept `page`, `per_page`, `q`, `status`, `user`, `source`, `article`, `since`, and `until` where applicable. Dates are Unix seconds; comment timestamps remain RFC 3339. List responses retain `{items,page,per_page,total}`. Out-of-range pages clamp to the last available page. Actor labels identify the administrative session by a one-way fingerprint, never the session token.

Pagination checks also cover public comments/replies and admin content lists. Public blog/project listings redirect invalid or out-of-range page URLs to a valid page; project-related writing uses the same normalization. Requests cannot overwrite newer results with stale responses.

## Local review

The isolated preview continues at http://localhost:18181/ and http://localhost:18181/admin/. Its existing preview hashing secret is retained, and only the loopback proxy is trusted. No production rollout is performed by the implementation task.
