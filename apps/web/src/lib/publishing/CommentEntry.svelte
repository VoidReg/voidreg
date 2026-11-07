<script lang="ts">
  import type { Snippet } from 'svelte';
  import Avatar from '$lib/components/Avatar.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import { age, type DiscussionComment } from './discussion';
  let {
    comment,
    onreply,
    reply = false,
    threaded = false,
    children
  }: {
    comment: DiscussionComment;
    onreply: (comment: DiscussionComment) => void;
    /** A reply inside a thread: smaller avatar. */
    reply?: boolean;
    /** Draws the thread line down the avatar column while replies are open. */
    threaded?: boolean;
    /** Composer, reply toggle and replies, shown under the comment. */
    children?: Snippet;
  } = $props();
</script>

<article
  id={'comment-' + comment.id}
  class="entry"
  class:reply
  class:threaded
  aria-label={'Comment by ' + comment.author_name}
>
  <span class="avatar-cell"
    ><Avatar
      name={comment.author_name}
      src={comment.removed ? null : comment.avatar_url}
      size={reply ? 32 : 40}
    /></span
  >
  {#if threaded}<span class="rail" aria-hidden="true"></span>{/if}
  <div class="main">
    <header>
      <strong class="author">{comment.author_name}</strong>
      {#if comment.verified}<span class="badge">Verified</span>{/if}
      <time
        class="when"
        datetime={comment.created_at}
        title={new Date(comment.created_at).toLocaleString()}>{age(comment.created_at)}</time
      >
    </header>
    {#if comment.replying_to && comment.parent_id !== comment.thread_id}<p class="context">
        <Icon name="reply" size={14} />Replying to {comment.replying_to}
      </p>{/if}
    <p class="comment-body" class:removed={comment.removed}>
      {comment.removed ? 'This comment is unavailable.' : comment.body}
    </p>
    {#if !comment.removed}<div class="actions">
        <button type="button" class="action" onclick={() => onreply(comment)}
          ><Icon name="reply" size={16} />Reply<span class="sr-only">
            to {comment.author_name}</span
          ></button
        >
      </div>{/if}
    {@render children?.()}
  </div>
</article>

<style>
  .entry {
    display: grid;
    grid-template-columns: 2.5rem minmax(0, 1fr);
    grid-template-rows: auto 1fr;
    column-gap: 0.875rem;
    min-width: 0;
    scroll-margin-block-start: 6rem;
  }
  .entry.reply {
    grid-template-columns: 2rem minmax(0, 1fr);
    column-gap: 0.75rem;
  }
  .avatar-cell {
    display: grid;
    grid-row: 1;
    grid-column: 1;
    align-self: start;
  }

  /* The line that ties open replies back to the comment they answer. */
  .rail {
    grid-row: 2;
    grid-column: 1;
    justify-self: center;
    width: 2px;
    margin-block: 0.375rem;
    border-radius: 1px;
    background: var(--border);
  }
  .main {
    grid-row: 1 / span 2;
    grid-column: 2;
    display: grid;
    gap: 0.25rem;
    align-content: start;
    min-width: 0;
  }
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem 0.625rem;
    min-height: 1.5rem;
  }
  .author {
    overflow-wrap: anywhere;
    font-weight: 600;
  }
  .badge {
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0 0.5rem;
    color: var(--muted-foreground);
    font: 500 0.6875rem/1.5 var(--font-code);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .when {
    color: var(--muted-foreground);
    font-size: 0.8125rem;
  }
  .context {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    margin: 0;
    color: var(--muted-foreground);
    font-size: 0.8125rem;
  }
  .comment-body {
    margin: 0.125rem 0 0;
  }
  .comment-body.removed {
    color: var(--muted-foreground);
    font-style: italic;
  }
  .actions {
    display: flex;
    gap: 0.25rem;
    margin-inline-start: -0.5rem;
  }
  .action {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    min-height: 2.25rem;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    padding: 0 0.5rem;
    color: var(--muted-foreground);
    font: 500 0.8125rem/1 var(--font-ui);
    cursor: pointer;
  }
  .action:hover {
    background: var(--secondary);
    color: var(--foreground);
  }
</style>
