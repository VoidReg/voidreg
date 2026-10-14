<script lang="ts">
  import { onMount } from 'svelte';
  import { apiBase, request, type Page } from './api';
  type Comment = {
    id: string;
    author_name: string;
    body: string;
    created_at: string;
    verified: boolean;
  };
  let { slug }: { slug: string } = $props();
  let comments = $state<Page<Comment>>({ items: [], page: 1, per_page: 20, total: 0 });
  let providers = $state<string[]>([]);
  let identity = $state<{ name: string } | undefined>();
  let loading = $state(true),
    busy = $state(false),
    error = $state(''),
    notice = $state('');
  let name = $state(''),
    body = $state(''),
    website = $state('');
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
  onMount(() => {
    void load();
    void request<string[]>('/auth/providers')
      .then((value) => (providers = value))
      .catch(() => {});
    void request<{ identity?: { name: string } }>('/auth/session')
      .then((s) => (identity = s.identity))
      .catch(() => {});
  });
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = '';
    notice = '';
    try {
      const result = await request<{ status: string }>(
        `/blogs/${encodeURIComponent(slug)}/comments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: identity?.name ?? name, body, website })
        }
      );
      body = '';
      notice =
        result.status === 'pending'
          ? 'Thank you. Your comment is awaiting approval.'
          : 'Your comment is published.';
      if (result.status === 'approved') await load();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<section class="section-stack comments" aria-labelledby="comments-heading">
  <h2 id="comments-heading">Discussion</h2>
  <p>
    Anonymous comments are reviewed before appearing.{providers.length
      ? ' Sign in to publish as a verified commenter.'
      : ''}
  </p>
  {#if identity}
    <p>Signed in as {identity.name}.</p>
    <button
      class="button button-secondary"
      onclick={async () => {
        try {
          await request('/auth/session', { method: 'DELETE' });
          identity = undefined;
        } catch (e) {
          error = (e as Error).message;
        }
      }}>Sign out</button
    >
  {:else}
    <div class="button-row">
      {#if providers.includes('google')}<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
        <a class="button button-secondary" href={`${apiBase}/auth/google/start`}
          >Continue with Google</a
        >{/if}
      {#if providers.includes('github')}<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
        <a class="button button-secondary" href={`${apiBase}/auth/github/start`}
          >Continue with GitHub</a
        >{/if}
    </div>
  {/if}
  <form class="publishing-form" onsubmit={submit} aria-busy={busy}>
    {#if !identity}<label
        >Name<input bind:value={name} required maxlength="80" autocomplete="name" /></label
      >{/if}
    <label
      >Comment<textarea
        bind:value={body}
        required
        maxlength="2000"
        rows="5"
        aria-describedby="comment-help"></textarea></label
    >
    <p id="comment-help" class="placeholder-note">Plain text, up to 2000 characters.</p>
    <div class="sr-only" aria-hidden="true">
      <label>Website<input bind:value={website} tabindex="-1" autocomplete="off" /></label>
    </div>
    <button class="button" disabled={busy}>{busy ? 'Submitting…' : 'Post comment'}</button>
  </form>
  <p role="status">{notice}</p>
  {#if error}<p role="alert">{error}</p>
    <button class="button button-secondary" onclick={() => load(comments.page)}
      >Retry loading comments</button
    >{/if}
  {#if loading}<p role="status">Loading comments…</p>
  {:else if comments.items.length === 0}<p>No comments yet.</p>
  {:else}
    <ol class="comment-list">
      {#each comments.items as comment (comment.id)}
        <li>
          <article>
            <h3>{comment.author_name}{comment.verified ? ' (verified)' : ''}</h3>
            <time datetime={comment.created_at}
              >{new Date(comment.created_at).toLocaleDateString()}</time
            >
            <p class="comment-body">{comment.body}</p>
          </article>
        </li>
      {/each}
    </ol>
    <nav class="button-row" aria-label="Comment pages">
      <button
        class="button button-secondary"
        disabled={comments.page <= 1}
        onclick={() => load(comments.page - 1)}>Previous</button
      >
      <button
        class="button button-secondary"
        disabled={comments.page * comments.per_page >= comments.total}
        onclick={() => load(comments.page + 1)}>Next</button
      >
    </nav>
  {/if}
</section>
