<script lang="ts">
  import { date, type Entry } from './types';
  let {
    items,
    collection,
    busy,
    onunblock,
    onhistory,
    onblock
  }: {
    items: Entry[];
    collection: 'blocks' | 'events' | 'audit';
    busy: boolean;
    onunblock: (entry: Entry) => void;
    onhistory: (kind: 'source', id: string) => void;
    onblock: (kind: string, target: string, name: string) => void;
  } = $props();
</script>

<ul class="records">
  {#each items as entry, index (entry.id ?? index)}
    <li>
      {#if collection === 'blocks'}
        <p class="head">
          <strong>{entry.kind === 'user' ? 'Account block' : 'Source block'}</strong>
          <span class={`ui-badge ${entry.active ? 'ui-badge-published' : 'ui-badge-archived'}`}
            >{entry.active ? 'Active' : 'Inactive'}</span
          >
        </p>
        <p class="id">{entry.target}</p>
        <p>{entry.reason}</p>
        <p class="meta">
          Expires: {entry.expires_at ? date(entry.expires_at) : 'Permanent'} | Created {date(
            entry.created_at
          )} by {entry.actor}
        </p>
        {#if entry.active}<button
            type="button"
            class="ui-btn ui-btn-small"
            disabled={busy}
            onclick={() => onunblock(entry)}>Unblock</button
          >{/if}
      {:else}
        <p class="head"><strong>{entry.reason || entry.action}</strong></p>
        <p class="meta">
          {date(entry.time)}{entry.count ? ' | ' + entry.count + ' attempts' : ''}{entry.actor
            ? ' | Admin: ' + entry.actor
            : ''}
        </p>
        <p class="id">{entry.source || entry.target}</p>
        {#if entry.source}
          <div class="actions">
            <button
              type="button"
              class="ui-btn ui-btn-small"
              onclick={() => onhistory('source', entry.source!)}>Source comments</button
            >
            <button
              type="button"
              class="ui-btn ui-btn-small"
              disabled={busy}
              onclick={() => onblock('source', entry.source!, entry.source!.slice(0, 12))}
              >Block source</button
            >
          </div>
        {/if}
      {/if}
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
  li {
    display: grid;
    gap: 0.375rem;
    justify-items: start;
    border-bottom: 1px solid var(--border);
    padding: 1rem;
    overflow-wrap: anywhere;
  }
  li:last-child {
    border-bottom: 0;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }
  .meta {
    color: var(--muted-foreground);
    font-size: 0.8125rem;
  }
  .id {
    font-family: var(--font-code);
    font-size: 0.8125rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
</style>
