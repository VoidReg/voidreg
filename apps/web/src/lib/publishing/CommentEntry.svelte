<script lang="ts">
  import type { DiscussionComment } from './discussion';
  let {
    comment,
    onreply
  }: { comment: DiscussionComment; onreply: (comment: DiscussionComment) => void } = $props();
</script>

<article
  id={'comment-' + comment.id}
  class="discussion-entry"
  aria-label={'Comment by ' + comment.author_name}
>
  <header>
    <p class="comment-author">
      <strong>{comment.author_name}</strong>{#if comment.verified}<small>Verified account</small
        >{/if}
    </p>
    <a
      class="comment-date"
      href={'#comment-' + comment.id}
      aria-label={'Link to comment by ' + comment.author_name}
      ><time datetime={comment.created_at}>{new Date(comment.created_at).toLocaleDateString()}</time
      ></a
    >
  </header>
  {#if comment.replying_to}<p class="reply-context">Replying to {comment.replying_to}</p>{/if}
  <p class="comment-body">{comment.removed ? 'This comment was removed.' : comment.body}</p>
  {#if !comment.removed}<button class="button button-secondary" onclick={() => onreply(comment)}
      >Reply<span class="sr-only"> to {comment.author_name}</span></button
    >{/if}
</article>

<style>
  .discussion-entry {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
    scroll-margin-block-start: 6rem;
  }
  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .comment-author {
    display: flex;
    gap: 0.75rem;
    align-items: baseline;
    flex-wrap: wrap;
    overflow-wrap: anywhere;
  }
  small,
  .comment-date,
  .reply-context {
    color: var(--muted-foreground);
    font-size: 0.875rem;
  }
  .comment-date {
    display: inline-flex;
    align-items: center;
    min-height: 2.75rem;
    text-decoration: underline;
  }
  .comment-body {
    margin: 0;
  }
  button {
    justify-self: start;
  }
</style>
