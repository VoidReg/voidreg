<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { apiBase, request, type Page } from './api';
  import type { DiscussionComment } from './discussion';
  import CommentEntry from './CommentEntry.svelte';
  import CommentComposer from './CommentComposer.svelte';
  let { slug }: { slug: string } = $props();
  type Replies = Page<DiscussionComment> & { loading: boolean; error: string; open: boolean };
  let comments = $state<Page<DiscussionComment>>({ items: [], page: 1, per_page: 20, total: 0 });
  let replies = $state<Record<string, Replies>>({});
  let providers = $state<string[]>([]),
    identity = $state<{ name: string } | undefined>();
  let loading = $state(true),
    error = $state(''),
    notice = $state('');
  let target = $state<DiscussionComment | undefined>();

  async function load(page = 1) {
    loading = true;
    error = '';
    try {
      comments = await request(`/blogs/${encodeURIComponent(slug)}/comments?page=${page}`);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }
  async function loadReplies(root: string, page = 1) {
    const previous = replies[root];
    replies[root] = {
      items: previous?.items ?? [],
      page: previous?.page ?? 0,
      per_page: 20,
      total: previous?.total ?? 0,
      loading: true,
      error: '',
      open: true
    };
    try {
      const next = await request<Page<DiscussionComment>>(
        `/blogs/${encodeURIComponent(slug)}/comments/${encodeURIComponent(root)}/replies?page=${page}`
      );
      replies[root] = {
        ...next,
        items: next.items,
        loading: false,
        error: '',
        open: replies[root]?.open ?? true
      };
    } catch (e) {
      replies[root].error = (e as Error).message;
      replies[root].loading = false;
    }
  }
  onMount(() => {
    void load();
    void request<string[]>('/auth/providers')
      .then((v) => (providers = v))
      .catch(() => {});
    void request<{ identity?: { name: string } }>('/auth/session')
      .then((s) => (identity = s.identity))
      .catch(() => {});
  });
  function reply(comment: DiscussionComment) {
    if (target && target.id !== comment.id && !confirm('Discard your unfinished reply?')) return;
    target = comment;
  }
  function discardReply() {
    if (target && !confirm('Discard your unfinished reply?')) return false;
    target = undefined;
    return true;
  }
  function changeReplyPage(root: string, page: number) {
    if (target?.thread_id === root && !discardReply()) return;
    void loadReplies(root, page);
  }
  function changeDiscussionPage(page: number) {
    if (!discardReply()) return;
    void load(page);
  }
  async function closeReply() {
    const id = target?.id;
    target = undefined;
    await tick();
    const button = document.getElementById('comment-' + id)?.querySelector('button');
    if (button instanceof HTMLButtonElement) button.focus();
  }
  async function posted(status: string, root?: string) {
    notice =
      status === 'pending'
        ? 'Thank you. Your contribution is awaiting approval.'
        : 'Your contribution is published.';
    if (status === 'approved') {
      await load(root ? comments.page : 1);
      if (root)
        await loadReplies(
          root,
          Math.max(1, Math.ceil((comments.items.find((c) => c.id === root)?.reply_count ?? 0) / 20))
        );
    }
    if (root) await closeReply();
  }
  async function signOut() {
    try {
      await request('/auth/session', { method: 'DELETE' });
      identity = undefined;
    } catch (e) {
      error = (e as Error).message;
    }
  }
  const returnTo = $derived('/blog/' + encodeURIComponent(slug) + '#discussion');
</script>

<section id="discussion" class="section-stack comments" aria-labelledby="comments-heading">
  <header class="section-stack">
    <h2 id="comments-heading">Discussion</h2>
    <p>
      Ask a question, share an idea, or reply to another reader. Anonymous contributions are
      reviewed before appearing.
    </p>
  </header>
  {#if identity}<div class="button-row">
      <p>Signed in as {identity.name}.</p>
      <button class="button button-secondary" onclick={signOut}>Sign out</button>
    </div>
  {:else if providers.length}<div class="button-row">
      {#each providers as provider (provider)}
        <!-- eslint-disable svelte/no-navigation-without-resolve -->
        <a
          class="button button-secondary"
          href={`${apiBase}/auth/${provider}/start?return_to=${encodeURIComponent(returnTo)}`}
          >Continue with {provider === 'github' ? 'GitHub' : 'Google'}</a
        >
        <!-- eslint-enable svelte/no-navigation-without-resolve -->
      {/each}
    </div>{/if}
  <CommentComposer {slug} {identity} onposted={(status) => posted(status)} />
  {#if notice}<p role="status">{notice}</p>{/if}
  {#if error}<p role="alert">{error}</p>
    <button class="button button-secondary" onclick={() => load(comments.page)}
      >Retry loading discussion</button
    >{/if}
  {#if loading}<p role="status">Loading discussion…</p>
  {:else if !error && comments.items.length === 0}<p>No discussions yet. Start the conversation.</p>
  {:else if comments.items.length}
    <ol class="comment-list">
      {#each comments.items as comment (comment.id)}
        <li class="discussion-thread">
          <CommentEntry {comment} onreply={reply} />
          {#if target?.id === comment.id}{#key target.id}<CommentComposer
                {slug}
                {identity}
                {target}
                onposted={(status) => posted(status, comment.id)}
                oncancel={closeReply}
              />{/key}{/if}
          {#if comment.reply_count > 0 || replies[comment.id]?.items.length}
            <button
              class="button button-secondary"
              aria-expanded={replies[comment.id]?.open ?? false}
              onclick={() => {
                if (replies[comment.id]?.open) {
                  if (target?.thread_id === comment.id && !discardReply()) return;
                  replies[comment.id].open = false;
                } else void loadReplies(comment.id);
              }}
            >
              {replies[comment.id]?.open
                ? 'Hide replies'
                : `View ${comment.reply_count} ${comment.reply_count === 1 ? 'reply' : 'replies'}`}
            </button>
          {/if}
          {#if replies[comment.id]?.open}
            <div class="thread-replies">
              {#if replies[comment.id].error}<p role="alert">{replies[comment.id].error}</p>
                <button class="button button-secondary" onclick={() => loadReplies(comment.id)}
                  >Retry replies</button
                >{/if}
              <ol class="comment-list">
                {#each replies[comment.id].items as child (child.id)}<li>
                    <CommentEntry comment={child} onreply={reply} />
                    {#if target?.id === child.id}{#key target.id}<CommentComposer
                          {slug}
                          {identity}
                          {target}
                          onposted={(status) => posted(status, comment.id)}
                          oncancel={closeReply}
                        />{/key}{/if}
                  </li>{/each}
              </ol>
              {#if replies[comment.id].loading}<p role="status">Loading replies…</p>
              {:else if replies[comment.id].total > replies[comment.id].per_page}
                <nav class="button-row" aria-label={'Reply pages for ' + comment.author_name}>
                  <button
                    class="button button-secondary"
                    disabled={replies[comment.id].page <= 1}
                    onclick={() => changeReplyPage(comment.id, replies[comment.id].page - 1)}
                    >Previous replies</button
                  >
                  <span>Page {replies[comment.id].page}</span>
                  <button
                    class="button button-secondary"
                    disabled={replies[comment.id].page * replies[comment.id].per_page >=
                      replies[comment.id].total}
                    onclick={() => changeReplyPage(comment.id, replies[comment.id].page + 1)}
                    >Next replies</button
                  >
                </nav>
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ol>
    {#if comments.total > comments.per_page}<nav class="button-row" aria-label="Discussion pages">
        <button
          class="button button-secondary"
          disabled={comments.page <= 1}
          onclick={() => changeDiscussionPage(comments.page - 1)}>Previous</button
        ><span>Page {comments.page}</span><button
          class="button button-secondary"
          disabled={comments.page * comments.per_page >= comments.total}
          onclick={() => changeDiscussionPage(comments.page + 1)}>Next</button
        >
      </nav>{/if}
  {/if}
</section>

<style>
  .discussion-thread {
    display: grid;
    gap: 1.5rem;
    min-width: 0;
    border-block-start: 1px solid var(--border);
    padding-block-start: 1.5rem;
  }
  .discussion-thread > button {
    justify-self: start;
  }
  .thread-replies {
    border-inline-start: 2px solid var(--border);
    padding-inline-start: 1.5rem;
    display: grid;
    gap: 1.5rem;
    min-width: 0;
  }
  .thread-replies li {
    display: grid;
    gap: 1.5rem;
    min-width: 0;
  }
  @media (max-width: 47.999rem) {
    .thread-replies {
      padding-inline-start: 0.75rem;
    }
  }
</style>
