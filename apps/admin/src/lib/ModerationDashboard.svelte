<script lang="ts">
  import { afterNavigate, goto } from '$app/navigation';
  import { page } from '$app/state';
  import { adminUrl } from '$lib/navigation';
  import { adminRequest } from './api';
  import type { Page } from '@voidreg/publishing-ui/api';
  type Collection = 'comments' | 'users' | 'sources' | 'blocks' | 'events' | 'audit';
  type Entry = {
    id?: string;
    name?: string;
    email?: string;
    provider?: string;
    kind?: string;
    target?: string;
    status?: string;
    source?: string;
    identity_id?: string;
    article_slug?: string;
    author_name?: string;
    body?: string;
    parent_id?: string;
    parent_author?: string;
    parent_body?: string;
    reason?: string;
    created_at?: string | number;
    last_seen?: number;
    first_seen?: number;
    time?: number;
    expires_at?: number;
    revoked_at?: number;
    active?: number;
    blocked?: number;
    comments?: number;
    spam?: number;
    rejections?: number;
    count?: number;
    accounts?: string[];
    accounts_total?: number;
    action?: string;
    actor?: string;
  };
  let collection = $state<Collection>('comments');
  let result = $state<Page<Entry>>({ items: [], page: 1, per_page: 20, total: 0 });
  let summary = $state<Record<string, number>>({});
  let status = $state('pending'),
    query = $state(''),
    user = $state(''),
    source = $state(''),
    article = $state('');
  let since = $state(''),
    until = $state('');
  let loading = $state(false),
    busy = $state(false),
    error = $state(''),
    notice = $state('');
  let requestId = 0;
  let previewRequest = 0;
  let blockTarget = $state<{ kind: string; target: string; name: string } | null>(null);
  let blockReason = $state(''),
    blockHours = $state('24'),
    affected = $state<number | null>(null);
  let ip = $state('');
  const pages = $derived(Math.max(1, Math.ceil(result.total / result.per_page)));
  const date = (value?: number | string | null) =>
    value
      ? new Date(typeof value === 'number' ? value * 1000 : value).toLocaleString()
      : 'Not recorded';
  async function load(page = 1) {
    const id = ++requestId;
    loading = true;
    error = '';
    const params = new URLSearchParams({ page: String(page), q: query });
    if (collection === 'comments') {
      params.set('status', status);
      params.set('user', user);
      params.set('source', source);
      params.set('article', article);
    }
    if (collection === 'users' && source) params.set('source', source);
    if (since) params.set('since', String(Math.floor(new Date(since).getTime() / 1000)));
    if (until) params.set('until', String(Math.floor(new Date(until).getTime() / 1000)));
    try {
      const [next, counts] = await Promise.all([
        adminRequest<Page<Entry>>('/moderation/' + collection + '?' + params),
        adminRequest<Record<string, number>>('/moderation/summary')
      ]);
      if (id === requestId) {
        result = next;
        summary = counts;
      }
    } catch (e) {
      if (id === requestId) error = (e as Error).message;
    } finally {
      if (id === requestId) loading = false;
    }
  }
  function browse(nextPage = 1) {
    return goto(
      adminUrl(page.url, {
        view: collection,
        m_page: nextPage === 1 ? null : nextPage,
        m_status: status || 'all',
        m_q: query,
        m_user: user,
        m_source: source,
        m_article: article,
        m_since: since,
        m_until: until
      }),
      { reset: false }
    );
  }
  function restoreRoute() {
    const p = page.url.searchParams;
    const view = p.get('view') ?? 'comments';
    collection = (
      ['comments', 'users', 'sources', 'blocks', 'events', 'audit'].includes(view)
        ? view
        : 'comments'
    ) as Collection;
    status = p.get('m_status') === 'all' ? '' : (p.get('m_status') ?? 'pending');
    query = p.get('m_q') ?? '';
    user = p.get('m_user') ?? '';
    source = p.get('m_source') ?? '';
    article = p.get('m_article') ?? '';
    since = p.get('m_since') ?? '';
    until = p.get('m_until') ?? '';
    void load(Math.max(1, Math.floor(Number(p.get('m_page')) || 1)));
  }
  function change(next: Collection, navigate = true) {
    result = { items: [], page: 1, per_page: 20, total: 0 };
    collection = next;
    query = '';
    user = '';
    source = '';
    article = '';
    since = '';
    until = '';
    if (navigate) void browse();
  }
  function history(kind: 'user' | 'source', id: string) {
    result = { items: [], page: 1, per_page: 20, total: 0 };
    collection = 'comments';
    article = '';
    status = '';
    query = '';
    user = kind === 'user' ? id : '';
    source = kind === 'source' ? id : '';
    since = '';
    until = '';
    void browse();
  }
  async function moderate(entry: Entry, action: string) {
    if (
      action === 'remove' &&
      !confirm('Permanently remove this comment text? This cannot be undone.')
    )
      return;
    busy = true;
    error = '';
    notice = '';
    try {
      await adminRequest('/moderation/comments/' + entry.id + '/' + action, 'POST', {
        reason: 'Admin action: ' + action
      });
      notice = 'Comment updated.';
      await load(result.page);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
  async function prepareBlock(kind: string, target: string, name: string) {
    const id = ++previewRequest;
    blockTarget = { kind, target, name };
    blockReason = '';
    blockHours = kind === 'user' ? '' : '24';
    affected = null;
    error = '';
    {
      try {
        const preview = await adminRequest<{ comments: number }>(
          '/moderation/block-preview',
          'POST',
          { kind, target }
        );
        if (id === previewRequest) affected = preview.comments;
      } catch (e) {
        if (id === previewRequest) {
          error = (e as Error).message;
          blockTarget = null;
        }
      }
    }
  }
  async function block(event: SubmitEvent) {
    event.preventDefault();
    if (!blockTarget) return;
    busy = true;
    error = '';
    try {
      await adminRequest('/moderation/blocks', 'POST', {
        kind: blockTarget.kind,
        target: blockTarget.target,
        reason: blockReason,
        hours: blockHours ? Number(blockHours) : null
      });
      blockTarget = null;
      ip = '';
      notice =
        'Posting blocked. Existing contributions are hidden and require review after unblocking.';
      await load(result.page);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
  async function unblock(entry: Entry) {
    if (!confirm('Unblock this target? Previously hidden comments will still require review.'))
      return;
    busy = true;
    error = '';
    try {
      await adminRequest('/moderation/blocks/' + entry.id + '/revoke', 'POST');
      notice = 'Block revoked. Review old comments before approving them.';
      await load(result.page);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
  afterNavigate(() => {
    if (page.url.searchParams.get('tab') === 'comments') restoreRoute();
  });
</script>

<section class="section-stack moderation" aria-labelledby="moderation-heading">
  <header>
    <p class="eyebrow">Community management</p>
    <h2 id="moderation-heading">Comments and abuse</h2>
  </header>
  <dl class="moderation-summary">
    {#each [['Pending', 'pending'], ['Spam', 'spam'], ['Hidden', 'hidden'], ['Users', 'users'], ['Active blocks', 'blocks'], ['Abuse events (24h)', 'rejected_24h']] as [label, key]}
      <div>
        <dt>{label}</dt>
        <dd>{summary[key] ?? 0}</dd>
      </div>
    {/each}
  </dl>
  <nav class="button-row" aria-label="Community management views">
    {#each ['comments', 'users', 'sources', 'blocks', 'events', 'audit'] as value}
      <button
        class="button button-secondary"
        aria-pressed={collection === value}
        disabled={busy}
        onclick={() => change(value as Collection)}
        >{value === 'events'
          ? 'Spam activity'
          : value === 'audit'
            ? 'Moderation history'
            : value[0].toUpperCase() + value.slice(1)}</button
      >
    {/each}
  </nav>
  <form
    class="moderation-filters"
    onsubmit={(e) => {
      e.preventDefault();
      void browse();
    }}
  >
    {#if collection === 'comments'}
      <label
        >Status<select bind:value={status}
          ><option value="">All</option
          >{#each ['pending', 'approved', 'spam', 'hidden', 'removed'] as value}<option {value}
              >{value}</option
            >{/each}</select
        ></label
      >
      <label>Article<input bind:value={article} placeholder="Article slug" /></label>
      <label>User ID<input bind:value={user} /></label><label
        >Source ID<input bind:value={source} /></label
      >
    {/if}
    {#if collection === 'users'}<label>Source ID<input bind:value={source} /></label>{/if}
    <label>Search<input type="search" bind:value={query} /></label>
    {#if collection !== 'users'}<label>From<input type="datetime-local" bind:value={since} /></label
      ><label>Until<input type="datetime-local" bind:value={until} /></label>{/if}
    <button class="button button-secondary" disabled={loading || busy}>Apply filters</button>
  </form>
  {#if collection === 'sources' || collection === 'blocks'}
    <form
      class="button-row"
      onsubmit={(e) => {
        e.preventDefault();
        void prepareBlock('ip', ip, ip);
      }}
    >
      <label
        >Exact IP address<input
          required
          bind:value={ip}
          placeholder="IPv4 or IPv6"
          autocomplete="off"
        /></label
      >
      <button class="button button-secondary" disabled={busy}>Block address</button>
    </form>
    <p class="placeholder-note">
      Raw IP addresses are not stored. A shared source does not prove that accounts belong to the
      same person.
    </p>
  {/if}
  {#if blockTarget}
    <section class="block-review" aria-labelledby="block-review-title">
      <h3 id="block-review-title">
        Block {blockTarget.kind === 'user' ? 'account' : 'source'}: {blockTarget.name}
      </h3>
      <p>
        {affected === null
          ? 'Matching existing contributions will be hidden.'
          : `${affected} existing contributions will be affected.`} Posting will be disabled. Unblocking
        will not automatically restore old comments.
      </p>
      <form class="publishing-form" onsubmit={block}>
        <label>Reason<textarea required maxlength="1000" bind:value={blockReason}></textarea></label
        >
        <label
          >Duration<select bind:value={blockHours}
            ><option value="24">24 hours</option><option value="168">7 days</option><option value=""
              >Permanent</option
            ></select
          ></label
        >
        <div class="button-row">
          <button class="button" disabled={busy || affected === null}>Confirm block</button><button
            type="button"
            class="button button-secondary"
            disabled={busy}
            onclick={() => (blockTarget = null)}>Cancel</button
          >
        </div>
      </form>
    </section>
  {/if}
  {#if error}<p role="alert">{error}</p>
    <button class="button button-secondary" onclick={() => load(result.page)}>Retry</button>{/if}
  {#if notice}<p role="status">{notice}</p>{/if}
  <div class="section-stack" aria-busy={loading}>
    {#if loading}<p role="status">Loading community activity...</p>{/if}
    {#if !loading && result.items.length === 0}<p>No matching records.</p>{/if}
    {#each result.items as entry, index (entry.id ?? index)}
      <article class="moderation-record">
        {#if collection === 'comments'}
          <h3>{entry.author_name}</h3>
          <p>{entry.article_slug} | {entry.status} | {date(entry.created_at)}</p>
          {#if entry.reason}<p>Reason: {entry.reason}</p>{/if}
          {#if entry.parent_id}<p>Reply to {entry.parent_author ?? 'another reader'}</p>
            <blockquote class="comment-body">{entry.parent_body}</blockquote>{/if}
          <p class="comment-body">{entry.body || 'Comment text removed.'}</p>
          <div class="button-row">
            {#if entry.status !== 'removed'}
              {#if entry.status !== 'approved'}<button
                  class="button"
                  disabled={busy || loading}
                  onclick={() => moderate(entry, 'approve')}>Approve</button
                >{/if}
              {#if entry.status !== 'spam'}<button
                  class="button button-secondary"
                  disabled={busy || loading}
                  onclick={() => moderate(entry, 'spam')}>Mark spam</button
                >{/if}
              {#if entry.status !== 'hidden'}<button
                  class="button button-secondary"
                  disabled={busy || loading}
                  onclick={() => moderate(entry, 'hide')}>Hide</button
                >{/if}
              {#if entry.status === 'spam' || entry.status === 'hidden'}<button
                  class="button button-secondary"
                  disabled={busy || loading}
                  onclick={() => moderate(entry, 'restore')}>Return to review</button
                >{/if}
              <button
                class="button button-secondary"
                disabled={busy || loading}
                onclick={() => moderate(entry, 'remove')}>Remove text</button
              >
            {/if}
            {#if entry.identity_id}<button
                class="button button-secondary"
                disabled={busy}
                onclick={() =>
                  prepareBlock('user', entry.identity_id!, entry.author_name ?? entry.identity_id!)}
                >Block user</button
              ><button
                class="button button-secondary"
                onclick={() => history('user', entry.identity_id!)}>User history</button
              >{/if}
            {#if entry.source}<button
                class="button button-secondary"
                disabled={busy}
                onclick={() => prepareBlock('source', entry.source!, entry.source!.slice(0, 12))}
                >Block source</button
              ><button
                class="button button-secondary"
                onclick={() => history('source', entry.source!)}>Source history</button
              >{/if}
          </div>
          <p class="record-id">User: {entry.identity_id ?? 'Anonymous'} | Source: {entry.source}</p>
        {:else if collection === 'users' || collection === 'sources'}
          <h3>{entry.name}</h3>
          <p>
            {entry.blocked ? 'Blocked' : 'No active block'}{entry.provider
              ? ' | ' + entry.provider
              : ''}
          </p>
          {#if entry.email}<p>{entry.email}</p>{/if}
          <p>
            {entry.comments ?? 0} comments | {entry.spam ?? 0} marked spam{collection === 'sources'
              ? ' | ' + (entry.rejections ?? 0) + ' abuse events'
              : ''}
          </p>
          <p>Last observed: {date(entry.last_seen)}</p>
          <p class="record-id">{entry.id}</p>
          {#if entry.accounts?.length}<p>
              Accounts observed on this source (up to 20 recent accounts):
            </p>
            <div class="button-row">
              {#each entry.accounts as id}<button
                  class="text-link"
                  onclick={() => history('user', id)}>{id}</button
                >{/each}
            </div>{/if}
          <div class="button-row">
            {#if collection === 'sources'}<button
                class="button button-secondary"
                onclick={() => {
                  const id = entry.id!;
                  change('users', false);
                  source = id;
                  void browse();
                }}>View accounts</button
              >{/if}
            <button
              class="button button-secondary"
              onclick={() => history(collection === 'users' ? 'user' : 'source', entry.id!)}
              >View comments</button
            ><button
              class="button button-secondary"
              disabled={busy}
              onclick={() => prepareBlock(entry.kind!, entry.target!, entry.name!)}
              >Block {collection === 'users' ? 'user' : 'source'}</button
            >{#if entry.blocked}<button
                class="button button-secondary"
                onclick={() => {
                  change('blocks', false);
                  query = entry.id!;
                  void browse();
                }}>Manage blocks</button
              >{/if}
          </div>
        {:else if collection === 'blocks'}
          <h3>{entry.kind === 'user' ? 'Account block' : 'Source block'}</h3>
          <p class="record-id">{entry.target}</p>
          <p>{entry.reason}</p>
          <p>
            {entry.active ? 'Active' : 'Inactive'} | Expires: {entry.expires_at
              ? date(entry.expires_at)
              : 'Permanent'}
          </p>
          <p>Created: {date(entry.created_at)} | Admin: {entry.actor}</p>
          {#if entry.active}<button
              class="button button-secondary"
              disabled={busy}
              onclick={() => unblock(entry)}>Unblock</button
            >{/if}
        {:else}
          <h3>{entry.reason || entry.action}</h3>
          <p>{date(entry.time)}{entry.count ? ' | ' + entry.count + ' attempts' : ''}</p>
          <p class="record-id">{entry.source || entry.target}</p>
          {#if entry.actor}<p>Admin: {entry.actor}</p>{/if}
          {#if entry.source}<div class="button-row">
              <button
                class="button button-secondary"
                onclick={() => history('source', entry.source!)}>Source comments</button
              ><button
                class="button button-secondary"
                disabled={busy}
                onclick={() => prepareBlock('source', entry.source!, entry.source!.slice(0, 12))}
                >Block source</button
              >
            </div>{/if}
        {/if}
      </article>
    {/each}
  </div>
  <nav class="button-row" aria-label="Community activity pages">
    <button
      class="button button-secondary"
      disabled={loading || busy || result.page <= 1}
      onclick={() => browse(result.page - 1)}>Previous</button
    >
    <span aria-live="polite">Page {result.page} of {pages} | {result.total} records</span>
    <button
      class="button button-secondary"
      disabled={loading || busy || result.page >= pages}
      onclick={() => browse(result.page + 1)}>Next</button
    >
  </nav>
</section>

<style>
  .moderation,
  .moderation-record {
    min-width: 0;
  }
  .moderation > header {
    display: grid;
    gap: 0.75rem;
  }
  .moderation-summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
    gap: 1rem;
  }
  .moderation-summary > div {
    display: grid;
    gap: 0.5rem;
    padding: 1rem;
    border: 1px solid var(--border);
  }
  dd {
    font-size: 1.5rem;
  }
  .moderation > form.button-row {
    align-items: end;
  }
  .moderation-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: end;
    padding: 1.5rem;
    background: var(--card);
    border: 1px solid var(--border);
  }
  label {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
    max-width: 100%;
  }
  input,
  select {
    min-width: 0;
    max-width: 100%;
    min-height: 2.875rem;
    padding: 0.5rem;
    border: 1px solid var(--input);
    background: var(--background);
    color: var(--foreground);
    border-radius: var(--radius);
  }
  .moderation-record,
  .block-review {
    display: grid;
    gap: 1rem;
    border: 1px solid var(--border);
    padding: 1.5rem;
    overflow-wrap: anywhere;
  }
  .record-id {
    font-family: var(--font-code);
    font-size: 0.8125rem;
    overflow-wrap: anywhere;
  }
</style>
