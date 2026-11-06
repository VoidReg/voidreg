<script lang="ts">
  import { date, type Entry } from './types';
  let {
    items,
    collection,
    busy,
    onhistory,
    onblock,
    onaccounts,
    onmanage
  }: {
    items: Entry[];
    collection: 'users' | 'sources';
    busy: boolean;
    onhistory: (kind: 'user' | 'source', id: string) => void;
    onblock: (kind: string, target: string, name: string) => void;
    onaccounts: (sourceId: string) => void;
    onmanage: (id: string) => void;
  } = $props();
</script>

<div class="ui-table-wrap">
  <table class="ui-table">
    <caption class="sr-only">{collection === 'users' ? 'Users' : 'Sources'}</caption>
    <thead>
      <tr>
        <th scope="col">{collection === 'users' ? 'User' : 'Source'}</th>
        <th scope="col">Comments</th>
        <th scope="col">Spam</th>
        {#if collection === 'sources'}<th scope="col">Abuse events</th>{/if}
        <th scope="col">Last seen</th>
        <th scope="col"><span class="sr-only">Actions</span></th>
      </tr>
    </thead>
    <tbody>
      {#each items as entry (entry.id)}
        <tr>
          <th scope="row">
            <span class="name">{entry.name}</span>
            {#if entry.blocked}<span class="ui-badge warn">Blocked</span>{/if}
            {#if entry.provider}<span class="meta">{entry.provider}</span>{/if}
            {#if entry.email}<span class="meta">{entry.email}</span>{/if}
            <span class="id">{entry.id}</span>
            {#if entry.accounts?.length}
              <span class="meta">Accounts on this source:</span>
              <span class="chips">
                {#each entry.accounts as id (id)}<button
                    type="button"
                    class="ui-btn ui-btn-small"
                    onclick={() => onhistory('user', id)}>{id.slice(0, 8)}</button
                  >{/each}
              </span>
            {/if}
          </th>
          <td>{entry.comments ?? 0}</td>
          <td>{entry.spam ?? 0}</td>
          {#if collection === 'sources'}<td>{entry.rejections ?? 0}</td>{/if}
          <td>{date(entry.last_seen)}</td>
          <td class="end">
            <details class="ui-menu">
              <summary class="ui-btn ui-btn-small"
                >Actions<span class="sr-only"> for {entry.name}</span></summary
              >
              <div class="ui-menu-list">
                <button
                  type="button"
                  onclick={() => onhistory(collection === 'users' ? 'user' : 'source', entry.id!)}
                  >View comments</button
                >
                {#if collection === 'sources'}<button
                    type="button"
                    onclick={() => onaccounts(entry.id!)}>View accounts</button
                  >{/if}
                {#if entry.blocked}<button type="button" onclick={() => onmanage(entry.id!)}
                    >Manage blocks</button
                  >{/if}
                <button
                  type="button"
                  class="danger"
                  disabled={busy}
                  onclick={() => onblock(entry.kind!, entry.target!, entry.name!)}
                  >Block {collection === 'users' ? 'user' : 'source'}</button
                >
              </div>
            </details>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  th[scope='row'] {
    display: grid;
    gap: 0.25rem;
    min-width: 12rem;
    font-weight: 400;
    overflow-wrap: anywhere;
  }
  .name {
    font-weight: 600;
  }
  .meta {
    color: var(--muted-foreground);
    font-size: 0.8125rem;
  }
  .id {
    color: var(--muted-foreground);
    font-family: var(--font-code);
    font-size: 0.75rem;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .warn {
    border-color: var(--danger);
    width: fit-content;
    color: var(--danger);
  }
  .end {
    text-align: end;
  }
</style>
