<script lang="ts">
  import { date, type Entry } from './types';
  let {
    items,
    busy,
    selected = $bindable(),
    onaction,
    onblock,
    onhistory
  }: {
    items: Entry[];
    busy: boolean;
    selected: Set<string>;
    onaction: (entry: Entry, action: 'approve' | 'spam' | 'hide' | 'restore' | 'remove') => void;
    onblock: (kind: 'user' | 'source', target: string, name: string) => void;
    onhistory: (kind: 'user' | 'source', id: string) => void;
  } = $props();
  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    selected = next;
  };
</script>

<ul class="records">
  {#each items as entry (entry.id)}
    <li class="record" class:picked={selected.has(entry.id!)}>
      <label class="pick"
        ><input
          type="checkbox"
          checked={selected.has(entry.id!)}
          onchange={(e) => toggle(entry.id!, e.currentTarget.checked)}
        /><span class="sr-only">Select comment by {entry.author_name}</span></label
      >
      <div class="main">
        <p class="head">
          <strong>{entry.author_name}</strong>
          <span class={`ui-badge ${entry.status === 'approved' ? 'ui-badge-published' : ''}`}
            >{entry.status}</span
          >
          <span class="meta">{entry.article_slug} | {date(entry.created_at)}</span>
        </p>
        {#if entry.parent_id}
          <p class="meta">Reply to {entry.parent_author ?? 'another reader'}</p>
          <blockquote>{entry.parent_body}</blockquote>
        {/if}
        <p class="body">{entry.body || 'Comment text removed.'}</p>
        {#if entry.reason}<p class="meta">Reason: {entry.reason}</p>{/if}
        <div class="actions">
          {#if entry.status !== 'removed'}
            {#if entry.status !== 'approved'}<button
                type="button"
                class="ui-btn ui-btn-small ui-btn-primary"
                disabled={busy}
                onclick={() => onaction(entry, 'approve')}>Approve</button
              >{/if}
            {#if entry.status !== 'spam'}<button
                type="button"
                class="ui-btn ui-btn-small"
                disabled={busy}
                onclick={() => onaction(entry, 'spam')}>Spam</button
              >{/if}
            {#if entry.status !== 'hidden'}<button
                type="button"
                class="ui-btn ui-btn-small"
                disabled={busy}
                onclick={() => onaction(entry, 'hide')}>Hide</button
              >{/if}
            {#if entry.status === 'spam' || entry.status === 'hidden'}<button
                type="button"
                class="ui-btn ui-btn-small"
                disabled={busy}
                onclick={() => onaction(entry, 'restore')}>Return to review</button
              >{/if}
            <button
              type="button"
              class="ui-btn ui-btn-small ui-btn-danger"
              disabled={busy}
              onclick={() => onaction(entry, 'remove')}>Remove text</button
            >
          {/if}
          <details class="ui-menu">
            <summary class="ui-btn ui-btn-small ui-btn-quiet">More</summary>
            <div class="ui-menu-list">
              {#if entry.identity_id}
                <button type="button" onclick={() => onhistory('user', entry.identity_id!)}
                  >User history</button
                >
                <button
                  type="button"
                  disabled={busy}
                  onclick={() =>
                    onblock('user', entry.identity_id!, entry.author_name ?? entry.identity_id!)}
                  >Block user</button
                >
              {/if}
              {#if entry.source}
                <button type="button" onclick={() => onhistory('source', entry.source!)}
                  >Source history</button
                >
                <button
                  type="button"
                  disabled={busy}
                  onclick={() => onblock('source', entry.source!, entry.source!.slice(0, 12))}
                  >Block source</button
                >
              {/if}
            </div>
          </details>
        </div>
        <p class="id">User: {entry.identity_id ?? 'Anonymous'} | Source: {entry.source}</p>
      </div>
    </li>
  {/each}
</ul>

<style>
  .records {
    display: grid;
    margin: 0;
    border: 1px solid var(--border);
    padding: 0;
    list-style: none;
  }
  .record {
    display: grid;
    grid-template-columns: 2.75rem minmax(0, 1fr);
    border-bottom: 1px solid var(--border);
  }
  .record:last-child {
    border-bottom: 0;
  }
  .record.picked {
    background: var(--secondary);
  }
  .pick {
    display: grid;
    place-items: start center;
    padding-block-start: 1rem;
  }
  .pick input {
    width: 1.25rem;
    height: 1.25rem;
    accent-color: var(--foreground);
  }
  .main {
    display: grid;
    gap: 0.5rem;
    padding: 1rem 1rem 1rem 0;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }
  .meta,
  .id {
    color: var(--muted-foreground);
    font-size: 0.8125rem;
  }
  .id {
    font-family: var(--font-code);
  }
  blockquote {
    margin: 0;
    border-inline-start: 3px solid var(--border);
    padding-inline-start: 0.75rem;
    color: var(--muted-foreground);
    font-size: 0.875rem;
  }
  .body {
    white-space: pre-wrap;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }
</style>
