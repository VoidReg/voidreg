<script lang="ts">
  import { tick } from 'svelte';
  import { request } from './api';
  import type { DiscussionComment } from './discussion';
  let {
    slug,
    identity,
    target,
    onposted,
    oncancel
  }: {
    slug: string;
    identity?: { name: string };
    target?: DiscussionComment;
    onposted: (status: string) => Promise<void>;
    oncancel?: () => void;
  } = $props();
  let name = $state(''),
    body = $state(''),
    website = $state(''),
    busy = $state(false),
    error = $state('');
  let field: HTMLTextAreaElement;
  const key = $derived(target?.id ?? 'new');
  $effect(() => {
    if (target) void tick().then(() => field?.focus());
  });
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = '';
    try {
      const result = await request<{ status: string }>(
        `/blogs/${encodeURIComponent(slug)}/comments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: identity?.name ?? name,
            body,
            website,
            parent_id: target?.id ?? null
          })
        }
      );
      body = '';
      await onposted(result.status);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<form class="publishing-form discussion-composer" onsubmit={submit} aria-busy={busy}>
  {#if target}<p>Reply to <strong>{target.author_name}</strong></p>{/if}
  {#if !identity}<label
      >Name<input bind:value={name} required maxlength="80" autocomplete="name" /></label
    >{/if}
  <label for={'comment-body-' + key}>{target ? 'Your reply' : 'Join the discussion'}</label>
  <textarea
    id={'comment-body-' + key}
    bind:this={field}
    bind:value={body}
    required
    maxlength="2000"
    rows="4"
    aria-describedby={'comment-help-' + key}></textarea>
  <p id={'comment-help-' + key} class="placeholder-note">
    Plain text, up to 2000 characters.{identity
      ? ''
      : ' Your contribution will appear after approval.'}
  </p>
  <div class="sr-only" aria-hidden="true">
    <label>Website<input bind:value={website} tabindex="-1" autocomplete="off" /></label>
  </div>
  {#if error}<p role="alert">{error}</p>{/if}
  <div class="button-row">
    <button class="button" disabled={busy}
      >{busy ? 'Submitting…' : target ? 'Post reply' : 'Post comment'}</button
    >
    {#if oncancel}<button
        type="button"
        class="button button-secondary"
        disabled={busy}
        onclick={oncancel}>Cancel reply</button
      >{/if}
  </div>
</form>

<style>
  .discussion-composer {
    min-width: 0;
    width: 100%;
  }
  textarea {
    resize: vertical;
  }
</style>
