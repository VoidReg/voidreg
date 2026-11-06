<script lang="ts">
  import type { RevisionDiff, WordPart } from '@voidreg/authoring/diff';
  import { fieldText, eventLabel, formatStamp } from './history';

  let {
    open = $bindable(false),
    revision,
    event,
    createdAt,
    diff,
    onrestore,
    restoring = false
  }: {
    open: boolean;
    revision: number;
    event: string;
    createdAt: string;
    diff: RevisionDiff | null;
    onrestore: () => void;
    restoring?: boolean;
  } = $props();
  let dialog = $state<HTMLDialogElement>();
  $effect(() => {
    if (open && dialog && !dialog.open) dialog.showModal();
    if (!open && dialog?.open) dialog.close();
  });
  const KIND: Record<string, string> = {
    added: 'In the current draft only',
    removed: 'In this revision only',
    changed: 'Changed',
    moved: 'Moved'
  };
  // Left column is the old revision (deletions marked), right is the draft (additions marked).
  const side = (parts: WordPart[], mark: 'add' | 'del') =>
    parts.filter((p) => p.op === 'same' || p.op === mark);
  const counts = $derived(
    diff
      ? {
          added: diff.blocks.filter((b) => b.kind === 'added').length,
          removed: diff.blocks.filter((b) => b.kind === 'removed').length,
          changed: diff.blocks.filter((b) => b.kind === 'changed').length,
          moved: diff.blocks.filter((b) => b.kind === 'moved').length
        }
      : null
  );
</script>

<dialog
  bind:this={dialog}
  class="ui-dialog compare"
  aria-labelledby="compare-title"
  onclose={() => (open = false)}
  onclick={(e) => {
    if (e.target === dialog) open = false;
  }}
>
  <div class="ui-dialog-body">
    <h2 id="compare-title">Revision {revision} compared with the current draft</h2>
    <p>
      {eventLabel(event)} on {formatStamp(createdAt)}. Restoring replaces the draft with the left
      side.
    </p>
    {#if !diff}
      <p role="status">Loading comparison...</p>
    {:else if diff.identical}
      <p class="ui-notice">This revision matches the current draft.</p>
    {:else}
      {#if counts}
        <p class="compare-summary">
          {diff.fields.length} field{diff.fields.length === 1 ? '' : 's'} changed,
          {counts.changed} block{counts.changed === 1 ? '' : 's'} edited, {counts.added} only in the draft,
          {counts.removed} only in this revision, {counts.moved} moved.
        </p>
      {/if}
      {#if diff.fields.length}
        <section aria-label="Changed fields">
          <h3>Details</h3>
          <table class="ui-table compare-fields">
            <thead
              ><tr
                ><th scope="col">Field</th><th scope="col">Revision {revision}</th><th scope="col"
                  >Current draft</th
                ></tr
              ></thead
            >
            <tbody>
              {#each diff.fields as change (change.field)}
                <tr
                  ><th scope="row">{change.field}</th><td>{fieldText(change.before)}</td><td
                    >{fieldText(change.after)}</td
                  ></tr
                >
              {/each}
            </tbody>
          </table>
        </section>
      {/if}
      {#if diff.blocks.length}
        <section aria-label="Changed blocks">
          <h3>Blocks</h3>
          <ol class="compare-blocks">
            {#each diff.blocks as change (change.id)}
              <li>
                <p class="compare-head">
                  <span class="ui-badge">{KIND[change.kind]}</span>
                  <strong>{change.label}</strong>
                  <span class="compare-pos"
                    >{change.from !== undefined ? `was ${change.from + 1}` : ''}{change.from !==
                      undefined && change.to !== undefined
                      ? ', '
                      : ''}{change.to !== undefined ? `now ${change.to + 1}` : ''}</span
                  >
                </p>
                <div class="compare-cols">
                  <div class="compare-col">
                    <h4>Revision {revision}</h4>
                    <p>
                      {#if change.kind === 'added'}<em>Not in this revision</em>
                      {:else if change.kind === 'moved'}{change.before ?? ''}
                      {:else}{#each side(change.words, 'del') as part, i (i)}{#if part.op === 'del'}<del
                              >{part.text}</del
                            >{:else}{part.text}{/if}{' '}{/each}{/if}
                    </p>
                  </div>
                  <div class="compare-col">
                    <h4>Current draft</h4>
                    <p>
                      {#if change.kind === 'removed'}<em>Not in the current draft</em>
                      {:else if change.kind === 'moved'}{change.after ?? ''}
                      {:else}{#each side(change.words, 'add') as part, i (i)}{#if part.op === 'add'}<ins
                              >{part.text}</ins
                            >{:else}{part.text}{/if}{' '}{/each}{/if}
                    </p>
                  </div>
                </div>
              </li>
            {/each}
          </ol>
        </section>
      {/if}
    {/if}
    <div class="ui-dialog-actions">
      <button type="button" class="ui-btn" onclick={() => (open = false)}>Close</button>
      <button
        type="button"
        class="ui-btn ui-btn-primary"
        disabled={restoring || !!diff?.identical}
        onclick={onrestore}>Restore revision {revision}</button
      >
    </div>
  </div>
</dialog>

<style>
  .compare {
    width: min(60rem, calc(100% - 2rem));
    max-height: calc(100dvh - 2rem);
  }
  .compare-summary {
    color: var(--foreground);
  }
  h3 {
    margin-block-end: 0.5rem;
    font-size: 1rem;
  }
  h4 {
    margin: 0 0 0.25rem;
    color: var(--muted-foreground);
    font-family: var(--font-code);
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
  }
  .compare-fields {
    font-size: 0.8125rem;
  }
  .compare-blocks {
    display: grid;
    gap: 1rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .compare-head {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    color: var(--foreground);
  }
  .compare-pos {
    color: var(--muted-foreground);
    font-size: 0.8125rem;
  }
  .compare-cols {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
    margin-block-start: 0.5rem;
  }
  .compare-col {
    border: 1px solid var(--border);
    padding: 0.75rem;
  }
  .compare-col p {
    color: var(--foreground);
    font-size: 0.875rem;
  }
  del {
    text-decoration: line-through;
    text-decoration-thickness: 2px;
    background: var(--secondary);
  }
  ins {
    text-decoration: underline;
    text-decoration-thickness: 2px;
    background: var(--secondary);
  }
  @media (max-width: 47.999rem) {
    .compare-cols {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
