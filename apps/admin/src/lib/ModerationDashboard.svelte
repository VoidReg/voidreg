<script lang="ts">
  import { onMount } from 'svelte';
  import { afterNavigate, goto } from '$app/navigation';
  import { page } from '$app/state';
  import { adminUrl } from '$lib/navigation';
  import { adminRequest } from './api';
  import { confirmDialog } from './ui/confirm.svelte';
  import { notify } from './ui/toast.svelte';
  import Pager from './components/Pager.svelte';
  import Select from '@voidreg/publishing-ui/ui/Select.svelte';
  import Tabs from './ui/Tabs.svelte';
  import CommentsList from './moderation/CommentsList.svelte';
  import PeopleList from './moderation/PeopleList.svelte';
  import RecordList from './moderation/RecordList.svelte';
  import { COLLECTIONS, type Collection, type Entry } from './moderation/types';
  import type { Article, Page } from '@voidreg/publishing-ui/api';

  const empty = (): Page<Entry> => ({ items: [], page: 1, per_page: 20, total: 0 });
  let collection = $state<Collection>('comments');
  let result = $state<Page<Entry>>(empty());
  let summary = $state<Record<string, number>>({});
  let status = $state('pending'),
    query = $state(''),
    user = $state(''),
    source = $state(''),
    article = $state(''),
    since = $state(''),
    until = $state('');
  let loading = $state(false),
    busy = $state(false),
    failure = $state('');
  let reason = $state('');
  let selected = $state<Set<string>>(new Set());
  let articles = $state<{ slug: string; title: string }[]>([]);
  let requestId = 0;
  let previewRequest = 0;
  let blockTarget = $state<{ kind: string; target: string; name: string } | null>(null);
  let blockReason = $state(''),
    blockHours = $state('24'),
    affected = $state<number | null>(null);
  let ip = $state('');
  const pages = $derived(Math.max(1, Math.ceil(result.total / result.per_page)));
  const filtered = $derived(!!(query || user || source || article || since || until));

  async function load(pageNumber = 1) {
    const id = ++requestId;
    loading = true;
    failure = '';
    const params = new URLSearchParams({ page: String(pageNumber), q: query });
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
        selected = new Set();
      }
    } catch (e) {
      if (id === requestId) failure = (e as Error).message;
    } finally {
      if (id === requestId) loading = false;
    }
  }
  async function loadArticles() {
    if (articles.length) return;
    try {
      const list = await adminRequest<Page<Article>>('/articles?per_page=100');
      articles = list.items.map((a) => ({ slug: a.slug, title: a.title }));
    } catch {
      /* the filter falls back to the slug typed into the URL */
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
    collection = (COLLECTIONS.some((c) => c.id === view) ? view : 'comments') as Collection;
    status = p.get('m_status') === 'all' ? '' : (p.get('m_status') ?? 'pending');
    query = p.get('m_q') ?? '';
    user = p.get('m_user') ?? '';
    source = p.get('m_source') ?? '';
    article = p.get('m_article') ?? '';
    since = p.get('m_since') ?? '';
    until = p.get('m_until') ?? '';
    if (collection === 'comments') void loadArticles();
    void load(Math.max(1, Math.floor(Number(p.get('m_page')) || 1)));
  }
  function change(next: Collection, navigate = true) {
    result = empty();
    collection = next;
    query = user = source = article = since = until = '';
    if (navigate) void browse();
  }
  function history(kind: 'user' | 'source', id: string) {
    result = empty();
    collection = 'comments';
    article = query = since = until = '';
    status = '';
    user = kind === 'user' ? id : '';
    source = kind === 'source' ? id : '';
    void browse();
  }
  function clearFilters() {
    query = user = source = article = since = until = '';
    void browse();
  }

  const REASON_LABEL: Record<string, string> = {
    approve: 'approved',
    spam: 'marked as spam',
    hide: 'hidden',
    restore: 'returned to review',
    remove: 'removed'
  };
  async function apply(id: string, action: string) {
    await adminRequest('/moderation/comments/' + id + '/' + action, 'POST', {
      reason: reason.trim() || 'Admin action: ' + action
    });
  }
  async function moderate(entry: Entry, action: string) {
    if (
      action === 'remove' &&
      !(await confirmDialog({
        title: 'Remove this comment text?',
        body: 'The text is erased permanently. The record stays for moderation history.',
        confirmLabel: 'Remove text',
        danger: true
      }))
    )
      return;
    busy = true;
    try {
      await apply(entry.id!, action);
      notify.success(`Comment ${REASON_LABEL[action] ?? 'updated'}.`);
      await load(result.page);
    } catch (e) {
      notify.error((e as Error).message);
    } finally {
      busy = false;
    }
  }
  async function bulk(action: 'approve' | 'spam' | 'hide') {
    const ids = [...selected];
    if (!ids.length) return;
    busy = true;
    let done = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        await apply(id, action);
        done++;
      } catch {
        failed++;
      }
    }
    await load(result.page);
    busy = false;
    if (failed) notify.error(`${done} ${REASON_LABEL[action]}, ${failed} could not be updated.`);
    else notify.success(`${done} comment${done === 1 ? '' : 's'} ${REASON_LABEL[action]}.`);
  }

  async function prepareBlock(kind: string, target: string, name: string) {
    const id = ++previewRequest;
    blockTarget = { kind, target, name };
    blockReason = '';
    blockHours = kind === 'user' ? '' : '24';
    affected = null;
    try {
      const preview = await adminRequest<{ comments: number }>(
        '/moderation/block-preview',
        'POST',
        {
          kind,
          target
        }
      );
      if (id === previewRequest) affected = preview.comments;
    } catch (e) {
      if (id === previewRequest) {
        notify.error((e as Error).message);
        blockTarget = null;
      }
    }
  }
  async function block(event: SubmitEvent) {
    event.preventDefault();
    if (!blockTarget) return;
    busy = true;
    try {
      await adminRequest('/moderation/blocks', 'POST', {
        kind: blockTarget.kind,
        target: blockTarget.target,
        reason: blockReason,
        hours: blockHours ? Number(blockHours) : null
      });
      blockTarget = null;
      ip = '';
      notify.success(
        'Posting blocked. Existing contributions are hidden and need review after unblocking.'
      );
      await load(result.page);
    } catch (e) {
      notify.error((e as Error).message);
    } finally {
      busy = false;
    }
  }
  async function unblock(entry: Entry) {
    const ok = await confirmDialog({
      title: 'Unblock this target?',
      body: 'Previously hidden comments still need review before they show again.',
      confirmLabel: 'Unblock'
    });
    if (!ok) return;
    busy = true;
    try {
      await adminRequest('/moderation/blocks/' + entry.id + '/revoke', 'POST');
      notify.success('Block revoked. Review old comments before approving them.');
      await load(result.page);
    } catch (e) {
      notify.error((e as Error).message);
    } finally {
      busy = false;
    }
  }
  // The dashboard mounts after the tab switch has already navigated, and afterNavigate does not
  // fire on mount, so load once here and again on every later navigation.
  const syncRoute = () => {
    if (page.url.searchParams.get('tab') === 'comments') restoreRoute();
  };
  onMount(syncRoute);
  afterNavigate(syncRoute);
</script>

<section class="mod" aria-labelledby="moderation-heading">
  <header>
    <h1 id="moderation-heading">Comments and abuse</h1>
  </header>
  <dl class="summary">
    {#each [['Pending', 'pending'], ['Spam', 'spam'], ['Hidden', 'hidden'], ['Users', 'users'], ['Active blocks', 'blocks'], ['Abuse events (24h)', 'rejected_24h']] as [label, key] (key)}
      <div>
        <dt>{label}</dt>
        <dd>{summary[key] ?? 0}</dd>
      </div>
    {/each}
  </dl>

  <Tabs
    label="Community management views"
    idPrefix="mod"
    value={collection}
    tabs={COLLECTIONS}
    onselect={(id) => !busy && change(id as Collection)}
  />
  <div id="mod-panel" role="tabpanel" aria-labelledby={`mod-tab-${collection}`} class="panel">
    <form
      class="filters"
      role="search"
      onsubmit={(e) => {
        e.preventDefault();
        void browse();
      }}
    >
      {#if collection === 'comments'}
        <label class="ui-field"
          >Status<Select
            label="Status"
            bind:value={status}
            options={[
              { value: '', label: 'All' },
              ...['pending', 'approved', 'spam', 'hidden', 'removed'].map((value) => ({
                value,
                label: value[0].toUpperCase() + value.slice(1)
              }))
            ]}
            onchange={() => void browse()}
          /></label
        >
        <label class="ui-field"
          >Article<Select
            label="Article"
            bind:value={article}
            options={[
              { value: '', label: 'All articles' },
              ...articles.map((option) => ({ value: option.slug, label: option.title })),
              ...(article && !articles.some((a) => a.slug === article)
                ? [{ value: article, label: article }]
                : [])
            ]}
            onchange={() => void browse()}
          /></label
        >
      {/if}
      <label class="ui-field grow"
        >Search<input type="search" bind:value={query} placeholder="Text, name or ID" /></label
      >
      {#if collection !== 'users'}
        <label class="ui-field">From<input type="datetime-local" bind:value={since} /></label><label
          class="ui-field">Until<input type="datetime-local" bind:value={until} /></label
        >
      {/if}
      <button class="ui-btn" disabled={loading || busy}>Apply</button>
      {#if filtered}<button type="button" class="ui-btn ui-btn-quiet" onclick={clearFilters}
          >Clear</button
        >{/if}
    </form>
    {#if user || source}
      <p class="chips" aria-label="Active filters">
        {#if user}<span class="ui-badge">User {user.slice(0, 8)}</span>{/if}
        {#if source}<span class="ui-badge">Source {source.slice(0, 8)}</span>{/if}
        <button
          type="button"
          class="ui-btn ui-btn-small ui-btn-quiet"
          onclick={() => ((user = source = ''), void browse())}>Show everyone</button
        >
      </p>
    {/if}

    {#if collection === 'comments'}
      <div class="bulk" role="region" aria-label="Moderation actions">
        <label class="ui-field grow"
          >Reason recorded with each action<input
            bind:value={reason}
            maxlength="200"
            placeholder="Optional, for the moderation history"
          /></label
        >
        {#if selected.size}
          <div class="bulk-actions">
            <strong>{selected.size} selected</strong>
            <button
              type="button"
              class="ui-btn ui-btn-small ui-btn-primary"
              disabled={busy}
              onclick={() => bulk('approve')}>Approve</button
            >
            <button
              type="button"
              class="ui-btn ui-btn-small"
              disabled={busy}
              onclick={() => bulk('spam')}>Spam</button
            >
            <button
              type="button"
              class="ui-btn ui-btn-small"
              disabled={busy}
              onclick={() => bulk('hide')}>Hide</button
            >
            <button
              type="button"
              class="ui-btn ui-btn-small ui-btn-quiet"
              onclick={() => (selected = new Set())}>Clear</button
            >
          </div>
        {:else if result.items.length > 1}
          <button
            type="button"
            class="ui-btn ui-btn-small"
            onclick={() => (selected = new Set(result.items.map((i) => i.id!)))}
            >Select all on this page</button
          >
        {/if}
      </div>
    {/if}

    {#if collection === 'sources' || collection === 'blocks'}
      <form
        class="ip"
        onsubmit={(e) => {
          e.preventDefault();
          void prepareBlock('ip', ip, ip);
        }}
      >
        <label class="ui-field"
          >Block an exact IP address<input
            required
            bind:value={ip}
            placeholder="IPv4 or IPv6"
            autocomplete="off"
          /></label
        >
        <button class="ui-btn" disabled={busy}>Review block</button>
      </form>
      <p class="hint">
        Raw IP addresses are not stored. A shared source does not prove that accounts belong to the
        same person.
      </p>
    {/if}

    {#if blockTarget}
      <section class="review" aria-labelledby="block-review-title">
        <h2 id="block-review-title">
          Block {blockTarget.kind === 'user' ? 'account' : 'source'}: {blockTarget.name}
        </h2>
        <p>
          {affected === null
            ? 'Matching existing contributions will be hidden.'
            : `${affected} existing contributions will be affected.`}
          Posting will be disabled. Unblocking does not restore old comments automatically.
        </p>
        <form onsubmit={block}>
          <label class="ui-field"
            >Reason<textarea required rows="2" maxlength="1000" bind:value={blockReason}
            ></textarea></label
          >
          <label class="ui-field"
            >Duration<Select
              label="Duration"
              bind:value={blockHours}
              options={[
                { value: '24', label: '24 hours' },
                { value: '168', label: '7 days' },
                { value: '', label: 'Permanent' }
              ]}
            /></label
          >
          <div class="row">
            <button class="ui-btn ui-btn-danger" disabled={busy || affected === null}
              >Confirm block</button
            >
            <button
              type="button"
              class="ui-btn"
              disabled={busy}
              onclick={() => (blockTarget = null)}>Cancel</button
            >
          </div>
        </form>
      </section>
    {/if}

    {#if failure}
      <div class="ui-notice ui-notice-error" role="alert">
        <p>{failure}</p>
        <button type="button" class="ui-btn ui-btn-small" onclick={() => load(result.page)}
          >Retry</button
        >
      </div>
    {:else if loading && result.items.length === 0}
      <div role="status" aria-label="Loading">
        {#each [0, 1, 2] as n (n)}<span class="ui-skeleton row-skel"></span>{/each}
      </div>
    {:else if result.items.length === 0}
      <div class="ui-empty">
        <h2>Nothing here</h2>
        <p>{filtered || status ? 'No records match these filters.' : 'No records yet.'}</p>
        {#if filtered || status}<button
            type="button"
            class="ui-btn"
            onclick={() => ((status = ''), clearFilters())}>Clear filters</button
          >{/if}
      </div>
    {:else}
      <div class="ui-busy" aria-busy={loading}>
        {#if collection === 'comments'}
          <CommentsList
            items={result.items}
            {busy}
            bind:selected
            onaction={moderate}
            onblock={prepareBlock}
            onhistory={history}
          />
        {:else if collection === 'users' || collection === 'sources'}
          <PeopleList
            items={result.items}
            {collection}
            {busy}
            onhistory={history}
            onblock={prepareBlock}
            onaccounts={(id) => {
              change('users', false);
              source = id;
              void browse();
            }}
            onmanage={(id) => {
              change('blocks', false);
              query = id;
              void browse();
            }}
          />
        {:else}
          <RecordList
            items={result.items}
            {collection}
            {busy}
            onunblock={unblock}
            onhistory={history}
            onblock={prepareBlock}
          />
        {/if}
      </div>
    {/if}

    <Pager
      page={result.page}
      {pages}
      disabled={loading || busy}
      label="Community activity pages"
      summary={`${result.total} records`}
      onselect={browse}
    />
  </div>
</section>

<style>
  .mod {
    display: grid;
    gap: 1.25rem;
    max-width: 72rem;
    min-width: 0;
  }
  h1 {
    font-size: 1.75rem;
    line-height: 1.2;
  }
  .summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
    gap: 0.75rem;
    margin: 0;
  }
  .summary > div {
    display: grid;
    gap: 0.25rem;
    border: 1px solid var(--border);
    padding: 0.75rem 1rem;
  }
  dt {
    color: var(--muted-foreground);
    font-size: 0.75rem;
    text-transform: uppercase;
  }
  dd {
    margin: 0;
    font-size: 1.5rem;
  }
  .panel {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }
  .filters,
  .bulk,
  .ip {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: end;
  }
  .grow {
    flex: 1 1 14rem;
  }
  .bulk-actions,
  .chips,
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }
  .hint {
    color: var(--muted-foreground);
    font-size: 0.875rem;
  }
  .review {
    display: grid;
    gap: 0.75rem;
    border: 1px solid var(--foreground);
    padding: 1.25rem;
  }
  .review form {
    display: grid;
    gap: 0.75rem;
    max-width: 28rem;
  }
  .row-skel {
    height: 5rem;
    margin-block-end: 0.5rem;
  }
</style>
