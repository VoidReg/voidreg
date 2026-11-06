<script lang="ts">
  let {
    conflict,
    busy,
    dirty,
    failures,
    savedAt,
    stored,
    message = '',
    onretry
  }: {
    conflict: boolean;
    busy: boolean;
    dirty: boolean;
    failures: number;
    savedAt: Date | null;
    stored: boolean;
    message?: string;
    onretry: () => unknown;
  } = $props();
  const time = new Intl.DateTimeFormat('en', { timeStyle: 'short' });
  const GIVE_UP = 5;
  const text = $derived(
    conflict
      ? 'Autosave paused. Resolve the editing conflict.'
      : busy
        ? 'Saving...'
        : failures >= GIVE_UP
          ? 'Autosave stopped after repeated failures. Your edits are still on this page.'
          : failures > 0
            ? 'Save failed. Retrying automatically.'
            : dirty
              ? 'Unsaved changes'
              : message ||
                (savedAt
                  ? `Saved at ${time.format(savedAt)}`
                  : stored
                    ? 'All changes saved'
                    : 'Not saved yet')
  );
</script>

<p class="save-status" class:failed={failures > 0 || conflict} role="status" aria-live="polite">
  <span class="save-dot" class:pending={dirty || busy} aria-hidden="true"></span>{text}
  {#if failures > 0 && !busy && !conflict}
    <button type="button" class="save-retry" onclick={onretry}>Retry now</button>
  {/if}
</p>

<style>
  .save-status {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    margin: 0;
    font-size: 0.8125rem;
  }
  .save-status.failed {
    color: var(--danger);
  }
  .save-dot {
    border: 1px solid currentColor;
    border-radius: 50%;
    background: currentColor;
    width: 0.5rem;
    height: 0.5rem;
  }
  .save-dot.pending {
    background: transparent;
  }
  .save-retry {
    border: 1px solid currentColor;
    background: transparent;
    padding: 0.25rem 0.5rem;
    min-height: 2rem;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
</style>
