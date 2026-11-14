<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { request, type Page } from '@voidreg/publishing-ui/api';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import ProviderButton from '@voidreg/publishing-ui/ProviderButton.svelte';
  import { isSignInProvider } from '@voidreg/publishing-ui/provider-button';
  import { authErrorMessage, session, signInUrl } from '$lib/session.svelte';
  import type { DiscussionComment } from './discussion';
  import CommentEntry from './CommentEntry.svelte';
  import CommentComposer from './CommentComposer.svelte';
  import Avatar from '$lib/components/Avatar.svelte';
  import Icon from '$lib/components/Icon.svelte';
  let { slug }: { slug: string } = $props();
  type Replies = Page<DiscussionComment> & { loading: boolean; error: string; open: boolean };
  let comments = $state<Page<DiscussionComment>>({ items: [], page: 1, per_page: 20, total: 0 });
  let replies = $state<Record<string, Replies>>({});
  const identity = $derived(session.signedIn ? session.data?.identity : undefined);
  const providers = $derived(session.signedIn ? [] : (session.data?.providers ?? []));
  const authError = $derived(authErrorMessage(page.url.searchParams.get('auth_error')));
  let loading = $state(true),
    error = $state(''),
    notice = $state('');
  let target = $state<DiscussionComment | undefined>();

  let commentRequest = 0;
  const replyRequests: Record<string, number> = {};
  async function load(page = 1) {
    const requestId = ++commentRequest;
    loading = true;
    error = '';
    try {
      const next = await request<Page<DiscussionComment>>(
        `/blogs/${encodeURIComponent(slug)}/comments?page=${page}`
      );
      if (requestId === commentRequest) comments = next;
    } catch (e) {
      if (requestId === commentRequest) error = (e as Error).message;
    } finally {
      if (requestId === commentRequest) loading = false;
    }
  }
  async function loadReplies(root: string, page = replies[root]?.page || 1) {
    const requestId = (replyRequests[root] ?? 0) + 1;
    replyRequests[root] = requestId;
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
      if (replyRequests[root] !== requestId) return;
      replies[root] = {
        ...next,
        items: next.items,
        loading: false,
        error: '',
        open: replies[root]?.open ?? true
      };
    } catch (e) {
      if (replyRequests[root] !== requestId) return;
      replies[root].error = (e as Error).message;
      replies[root].loading = false;
    }
  }
  onMount(() => {
    void load();
    void session.load();
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
    if (replies[root]?.loading) return;
    if (target?.thread_id === root && !discardReply()) return;
    void loadReplies(root, page);
  }
  function changeDiscussionPage(page: number) {
    if (loading) return;
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
          Math.max(
            1,
            Math.ceil(
              (comments.items.find((c) => c.id === root)?.reply_count ?? 0) /
                (replies[root]?.per_page || 20)
            )
          )
        );
    }
    if (root) await closeReply();
  }
  async function signOut() {
    try {
      await session.signOut();
    } catch (e) {
      error = (e as Error).message;
    }
  }
  const returnTo = $derived('/blog/' + encodeURIComponent(slug) + '#discussion');
</script>

<section id="discussion" class="section-stack comments" aria-labelledby="comments-heading">
  <header class="comments-head">
    <h2 id="comments-heading">
      Discussion{#if comments.total}
        <span class="section-count">{comments.total}</span>{/if}
    </h2>
    <p>
      Ask a question, share an idea, or reply to another reader. Anonymous contributions are
      reviewed before appearing.
    </p>
    {#if authError}<p role="alert" class="problem">{authError}</p>{/if}
    {#if identity}
      <div class="identity-bar">
        <Avatar name={identity.name} src={identity.avatar_url} size={40} />
        <p>
          Posting as <strong>{identity.name}</strong>. Your comments publish right away.
        </p>
        <span class="identity-actions">
          <a class="link-button" href={resolve('/account')}>Account settings</a>
          <button type="button" class="link-button" onclick={signOut}>Sign out</button>
        </span>
      </div>
    {:else if providers.length}
      <div class="signin-card">
        <p>
          <strong>Sign in to post as yourself.</strong> Your comments publish right away under one name
          and photo you control. Or comment as a guest below, and a moderator will review it first.
        </p>
        <div class="provider-buttons">
          {#each providers.filter(isSignInProvider) as provider (provider)}
            <ProviderButton {provider} href={signInUrl(provider, returnTo)} />
          {/each}
        </div>
      </div>
    {/if}
  </header>
  <CommentComposer {slug} {identity} onposted={(status) => posted(status)} />
  {#if notice}<p class="notice" role="status">{notice}</p>{/if}
  {#if error}<p role="alert">{error}</p>
    <button class="button button-secondary" onclick={() => load(comments.page)}
      >Retry loading discussion</button
    >{/if}
  {#if loading}<p role="status" class="quiet">Loading discussion...</p>
  {:else if !error && comments.items.length === 0}<p class="quiet">
      No discussion yet. Start the conversation.
    </p>
  {:else if comments.items.length}
    <ol class="comment-list">
      {#each comments.items as comment (comment.id)}
        {@const open = replies[comment.id]?.open && !!replies[comment.id].items.length}
        <li class="discussion-thread">
          <CommentEntry {comment} onreply={reply} threaded={open}>
            {#if target?.id === comment.id}{#key target.id}<CommentComposer
                  {slug}
                  {identity}
                  {target}
                  onposted={(status) => posted(status, comment.id)}
                  oncancel={closeReply}
                />{/key}{/if}
            {#if comment.reply_count > 0 || replies[comment.id]?.items.length}
              <button
                type="button"
                class="thread-toggle"
                class:open={replies[comment.id]?.open}
                aria-expanded={replies[comment.id]?.open ?? false}
                onclick={() => {
                  if (replies[comment.id]?.open) {
                    if (target?.thread_id === comment.id && !discardReply()) return;
                    replies[comment.id].open = false;
                  } else void loadReplies(comment.id);
                }}
              >
                <Icon name="chevron-down" size={16} />
                {replies[comment.id]?.open
                  ? 'Hide replies'
                  : `View ${comment.reply_count} ${comment.reply_count === 1 ? 'reply' : 'replies'}`}
              </button>
            {/if}
            {#if replies[comment.id]?.open}
              <div class="thread-replies">
                {#if replies[comment.id].error}<p role="alert">{replies[comment.id].error}</p>
                  <button type="button" class="link-button" onclick={() => loadReplies(comment.id)}
                    >Retry replies</button
                  >{/if}
                <ol class="comment-list reply-list">
                  {#each replies[comment.id].items as child (child.id)}<li>
                      <CommentEntry comment={child} reply onreply={reply}>
                        {#if target?.id === child.id}{#key target.id}<CommentComposer
                              {slug}
                              {identity}
                              {target}
                              onposted={(status) => posted(status, comment.id)}
                              oncancel={closeReply}
                            />{/key}{/if}
                      </CommentEntry>
                    </li>{/each}
                </ol>
                {#if replies[comment.id].loading}<p role="status" class="quiet">
                    Loading replies...
                  </p>
                {:else if replies[comment.id].total > replies[comment.id].per_page}
                  <nav class="reply-pager" aria-label={'Reply pages for ' + comment.author_name}>
                    <button
                      type="button"
                      class="link-button"
                      disabled={replies[comment.id].loading || replies[comment.id].page <= 1}
                      onclick={() => changeReplyPage(comment.id, replies[comment.id].page - 1)}
                      >Earlier replies</button
                    >
                    <span class="quiet">Page {replies[comment.id].page}</span>
                    <button
                      type="button"
                      class="link-button"
                      disabled={replies[comment.id].loading ||
                        replies[comment.id].page * replies[comment.id].per_page >=
                          replies[comment.id].total}
                      onclick={() => changeReplyPage(comment.id, replies[comment.id].page + 1)}
                      >More replies</button
                    >
                  </nav>
                {/if}
              </div>
            {/if}
          </CommentEntry>
        </li>
      {/each}
    </ol>
    {#if comments.total > comments.per_page}<nav class="button-row" aria-label="Discussion pages">
        <button
          class="button button-secondary"
          disabled={loading || comments.page <= 1}
          onclick={() => changeDiscussionPage(comments.page - 1)}>Previous</button
        ><span>Page {comments.page}</span><button
          class="button button-secondary"
          disabled={loading || comments.page * comments.per_page >= comments.total}
          onclick={() => changeDiscussionPage(comments.page + 1)}>Next</button
        >
      </nav>{/if}
  {/if}
</section>

<style>
  .comments-head {
    display: grid;
    gap: 0.75rem;
  }
  .comments-head p {
    margin: 0;
    color: var(--muted-foreground);
  }
  .identity-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem 1rem;
    border: 1px solid var(--border);
    background: var(--card);
    padding: 0.75rem 1rem;
  }
  .identity-bar p {
    flex: 1 1 14rem;
    min-width: 0;
  }
  .identity-bar strong,
  .signin-card strong {
    color: var(--foreground);
    overflow-wrap: anywhere;
  }
  .identity-actions {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
  }
  .signin-card {
    display: grid;
    gap: 0.75rem;
    border: 1px solid var(--border);
    background: var(--card);
    padding: 1rem;
  }
  .problem {
    color: var(--danger);
  }
  .quiet {
    margin: 0;
    color: var(--muted-foreground);
    font-size: 0.875rem;
  }
  .notice {
    margin: 0;
    border-inline-start: 3px solid var(--primary);
    background: var(--card);
    padding: 0.75rem 1rem;
  }
  .link-button {
    border: 0;
    background: none;
    padding: 0;
    color: var(--link);
    font: inherit;
    text-decoration: underline;
    text-underline-offset: 0.2em;
    cursor: pointer;
  }
  .link-button:disabled {
    color: var(--disabled-foreground);
    cursor: not-allowed;
    text-decoration: none;
  }
  .discussion-thread {
    min-width: 0;
    border-block-start: 1px solid var(--border);
    padding-block-start: 1.5rem;
  }
  .thread-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    justify-self: start;
    min-height: 2.25rem;
    margin-block-start: 0.25rem;
    margin-inline-start: -0.5rem;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    padding: 0 0.5rem;
    color: var(--primary);
    font: 600 0.8125rem/1 var(--font-ui);
    cursor: pointer;
  }
  .thread-toggle:hover {
    background: var(--secondary);
  }
  .thread-toggle :global(.icon) {
    transition: transform var(--duration-fast, 150ms) ease;
  }
  .thread-toggle.open :global(.icon) {
    transform: rotate(180deg);
  }
  .thread-replies {
    display: grid;
    gap: 1.25rem;
    min-width: 0;
    margin-block-start: 0.75rem;
  }
  .thread-replies :global(.comment-list) {
    gap: 1.25rem;
  }
  .reply-pager {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem;
  }
  @media (prefers-reduced-motion: reduce) {
    .thread-toggle :global(.icon) {
      transition: none;
    }
  }
</style>
