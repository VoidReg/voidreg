<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { session } from '$lib/session.svelte';
  import Avatar from './Avatar.svelte';

  /** Show a plain "Sign in" link while signed out (the desktop bar has room for it). */
  let { signInLink = false }: { signInLink?: boolean } = $props();
  const id = $props.id();
  let open = $state(false);
  let root = $state<HTMLElement>();
  let trigger = $state<HTMLButtonElement>();
  let failed = $state(false);

  onMount(() => {
    void session.load();
  });

  const identity = $derived(session.data?.identity);
  const canSignIn = $derived(!!session.data?.providers?.length);

  function outside(event: MouseEvent) {
    if (open && root && !root.contains(event.target as Node)) open = false;
  }
  function escape(event: KeyboardEvent) {
    if (event.key === 'Escape' && open) {
      open = false;
      trigger?.focus();
    }
  }
  async function signOut() {
    failed = false;
    try {
      await session.signOut();
      open = false;
    } catch {
      failed = true;
    }
  }
</script>

<svelte:window onclick={outside} onkeydown={escape} />

{#if session.signedIn && identity}
  <div class="account-menu" bind:this={root}>
    <button
      type="button"
      class="account-trigger"
      bind:this={trigger}
      aria-expanded={open}
      aria-controls={id}
      aria-label={`Account menu for ${identity.name}`}
      onclick={() => (open = !open)}
    >
      <Avatar name={identity.name} src={identity.avatar_url} size={40} />
    </button>
    {#if open}
      <div {id} class="account-popover">
        <p class="who">
          <strong>{identity.name}</strong>
          <span>{identity.email}</span>
        </p>
        <a
          class="item"
          href={resolve('/account')}
          aria-current={page.url.pathname === '/account' ? 'page' : undefined}
          onclick={() => (open = false)}>Account settings</a
        >
        <button type="button" class="item" onclick={signOut}>Sign out</button>
        {#if failed}<p class="problem" role="alert">Sign out failed. Try again.</p>{/if}
      </div>
    {/if}
  </div>
{:else if signInLink && canSignIn}
  <a
    class="nav-link"
    href={resolve('/account')}
    aria-current={page.url.pathname === '/account' ? 'page' : undefined}>Sign in</a
  >
{/if}

<style>
  .account-menu {
    position: relative;
  }
  .account-trigger {
    display: inline-grid;
    place-items: center;
    width: 3rem;
    height: 3rem;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    padding: 0;
    cursor: pointer;
  }
  .account-trigger:hover,
  .account-trigger[aria-expanded='true'] {
    background: var(--secondary);
  }
  .account-popover {
    position: absolute;
    inset-block-start: calc(100% + 0.5rem);
    inset-inline-end: 0;
    z-index: 30;
    display: grid;
    width: min(18rem, calc(100vw - 2rem));
    border: 1px solid var(--border);
    background: var(--background);
    padding: 0.5rem;
  }
  /* In the compact header the trigger sits mid-row, so span the header instead. */
  @container site-header (max-width: 63.999rem) {
    .account-menu {
      position: static;
    }
    .account-popover {
      inset-block-start: calc(100% + 0.25rem);
      inset-inline: 1rem;
      width: auto;
    }
  }
  .who {
    display: grid;
    gap: 0.125rem;
    min-width: 0;
    border-block-end: 1px solid var(--border);
    margin-block-end: 0.5rem;
    padding: 0.5rem 0.75rem 0.75rem;
  }
  .who strong,
  .who span {
    overflow-wrap: anywhere;
  }
  .who span {
    color: var(--muted-foreground);
    font-size: 0.8125rem;
  }
  .item {
    display: flex;
    align-items: center;
    min-height: 2.75rem;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    padding: 0 0.75rem;
    color: var(--foreground);
    font: 500 0.875rem/1.2 var(--font-ui);
    text-align: start;
    text-decoration: none;
    cursor: pointer;
  }
  .item:hover,
  .item[aria-current='page'] {
    background: var(--secondary);
  }
  .problem {
    margin: 0.5rem 0.75rem 0.25rem;
    color: var(--danger);
    font-size: 0.8125rem;
  }
</style>
