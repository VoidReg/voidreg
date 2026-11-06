<script lang="ts">
  import { untrack } from 'svelte';
  import { adminRequest } from '$lib/api';
  import { confirmDialog } from '$lib/ui/confirm.svelte';
  import { notify } from '$lib/ui/toast.svelte';
  import { diffRevisions, type EntryLike, type RevisionDiff } from '@voidreg/authoring/diff';
  import RevisionCompare from './RevisionCompare.svelte';
  import {
    eventLabel,
    formatStamp,
    type RevisionDetail,
    type RevisionItem,
    type RevisionList
  } from './history';

  let {
    kind,
    slug,
    serverRevision,
    dirty,
    onsave,
    onrestored
  }: {
    kind: string;
    slug: string;
    serverRevision: number;
    dirty: boolean;
    onsave: () => Promise<boolean> | boolean | unknown;
    onrestored: () => unknown;
  } = $props();

  let items = $state<RevisionItem[]>([]);
  let hasMore = $state(false);
  let loading = $state(true);
  let failure = $state('');
  let compareOpen = $state(false);
  let picked = $state<RevisionItem | null>(null);
  let diff = $state<RevisionDiff | null>(null);
  let restoring = $state(false);
  const base = $derived(`/${kind}/${slug}`);

  async function load(more = false) {
    loading = true;
    failure = '';
    try {
      const before = more && items.length ? `&before=${items[items.length - 1].revision}` : '';
      const result = await adminRequest<RevisionList>(`${base}/revisions?limit=25${before}`);
      items = more ? [...items, ...result.items] : result.items;
      hasMore = result.has_more;
    } catch (cause) {
      failure = (cause as Error).message;
    } finally {
      loading = false;
    }
  }
  // Reload the top of the list whenever a save, publish or restore bumps the revision.
  $effect(() => {
    void [slug, serverRevision];
    untrack(() => void load());
  });

  async function compare(item: RevisionItem) {
    picked = item;
    diff = null;
    compareOpen = true;
    try {
      const [detail, current] = await Promise.all([
        adminRequest<RevisionDetail>(`${base}/revisions/${item.revision}`),
        adminRequest<EntryLike>(base)
      ]);
      diff = diffRevisions(detail.snapshot, current);
    } catch (cause) {
      compareOpen = false;
      notify.error((cause as Error).message);
    }
  }

  async function restore(item: RevisionItem) {
    const ok = await confirmDialog({
      title: `Restore revision ${item.revision}?`,
      body: `The draft becomes the ${eventLabel(item.event).toLowerCase()} version from ${formatStamp(item.created_at)}. Your current draft stays in history and the live page does not change until you publish.${dirty ? ' Your unsaved edits are saved to history first.' : ''}`,
      confirmLabel: 'Restore'
    });
    if (!ok) return;
    restoring = true;
    try {
      if (dirty && (await onsave()) === false) return;
      await adminRequest(`${base}/revisions/${item.revision}/restore`, 'POST', {
        expected_revision: serverRevision
      });
      compareOpen = false;
      notify.success(`Restored revision ${item.revision} as the draft.`);
      await onrestored();
    } catch (cause) {
      notify.error((cause as Error).message);
    } finally {
      restoring = false;
    }
  }
</script>

<section class="inspector-section history" aria-labelledby="history-title">
  <h2 id="history-title" class="sidebar-heading">History</h2>
  <p class="editor-help">
    Every save and publish is kept. Rapid autosaves within five minutes share one entry.
  </p>
  {#if failure}
    <p class="ui-notice ui-notice-error" role="alert">{failure}</p>
    <button type="button" class="ui-btn ui-btn-small" onclick={() => load()}>Retry</button>
  {/if}
  {#if loading && items.length === 0}
    <div role="status" aria-label="Loading history">
      <span class="ui-skeleton row"></span><span class="ui-skeleton row"></span>
    </div>
  {/if}
  <ol class="history-list">
    {#each items as item (item.revision)}
      <li class:current={item.revision === serverRevision}>
        <p class="history-head">
          <strong>{eventLabel(item.event)}</strong>
          {#if item.live}<span class="ui-badge ui-badge-published">Live</span>{/if}
          {#if item.revision === serverRevision}<span class="ui-badge">Current</span>{/if}
        </p>
        <p class="history-meta">
          Revision {item.revision} | {formatStamp(item.created_at)}
        </p>
        <p class="history-meta">{item.blocks} blocks | {item.words} words</p>
        {#if item.revision !== serverRevision}
          <div class="history-actions">
            <button type="button" class="ui-btn ui-btn-small" onclick={() => compare(item)}
              >Compare</button
            >
            <button
              type="button"
              class="ui-btn ui-btn-small"
              disabled={restoring}
              onclick={() => restore(item)}>Restore</button
            >
          </div>
        {/if}
      </li>
    {/each}
  </ol>
  {#if hasMore}
    <button type="button" class="ui-btn ui-btn-small" disabled={loading} onclick={() => load(true)}
      >Load older</button
    >
  {:else if items.length > 0 && !loading}
    <p class="editor-help">Start of history.</p>
  {/if}
</section>

{#if picked}
  <RevisionCompare
    bind:open={compareOpen}
    revision={picked.revision}
    event={picked.event}
    createdAt={picked.created_at}
    {diff}
    {restoring}
    onrestore={() => picked && restore(picked)}
  />
{/if}

<style>
  .history {
    display: grid;
    gap: 0.75rem;
  }
  .history-list {
    display: grid;
    gap: 0;
    margin: 0;
    border: 1px solid var(--border);
    padding: 0;
    list-style: none;
  }
  .history-list li {
    display: grid;
    gap: 0.25rem;
    border-bottom: 1px solid var(--border);
    padding: 0.75rem;
  }
  .history-list li:last-child {
    border-bottom: 0;
  }
  .history-list li.current {
    background: var(--secondary);
  }
  .history-head {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    margin: 0;
  }
  .history-meta {
    margin: 0;
    color: var(--muted-foreground);
    font-size: 0.8125rem;
  }
  .history-actions {
    display: flex;
    gap: 0.5rem;
    margin-block-start: 0.25rem;
  }
  .row {
    height: 3rem;
    margin-block-end: 0.5rem;
  }
</style>
