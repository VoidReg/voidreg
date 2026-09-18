<script lang="ts">
  import { resolve } from '$app/paths';
  import { onMount } from 'svelte';
  import {
    OPEN_COOKIE_SETTINGS,
    hasValidConsent,
    readConsent,
    writeConsent,
    type OptionalConsent
  } from '$lib/consent';

  let bannerVisible = $state(false);
  let dialogEl = $state<HTMLDialogElement | undefined>();
  let analytics = $state(false);
  let marketing = $state(false);

  function loadOptional(): OptionalConsent {
    const consent = readConsent();
    analytics = consent?.analytics ?? false;
    marketing = consent?.marketing ?? false;
    return { analytics, marketing };
  }

  function save(optional: OptionalConsent) {
    analytics = optional.analytics;
    marketing = optional.marketing;
    writeConsent(optional);
    bannerVisible = false;
    closePrefs();
  }

  function acceptAll() {
    save({ analytics: true, marketing: true });
  }

  function rejectNonEssential() {
    save({ analytics: false, marketing: false });
  }

  function savePrefs() {
    save({ analytics, marketing });
  }

  function openPrefs() {
    loadOptional();
    dialogEl?.showModal();
  }

  function closePrefs() {
    if (dialogEl?.open) dialogEl.close();
  }

  function onDialogClick(event: MouseEvent) {
    if (event.target === dialogEl) closePrefs();
  }

  function openSettings() {
    openPrefs();
  }

  onMount(() => {
    loadOptional();
    bannerVisible = !hasValidConsent();
    window.addEventListener(OPEN_COOKIE_SETTINGS, openSettings);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS, openSettings);
  });
</script>

{#if bannerVisible}
  <div
    class="cookie-banner"
    role="region"
    aria-labelledby="cookie-banner-title"
    aria-describedby="cookie-banner-copy"
  >
    <div class="site-container cookie-banner-inner">
      <div class="cookie-banner-copy">
        <p id="cookie-banner-title" class="eyebrow">Cookies</p>
        <p id="cookie-banner-copy">
          We use strictly necessary cookies to remember your theme and this choice. Analytics and
          marketing cookies are not used today and stay off unless you opt in.
          <a class="text-link" href={resolve('/privacy')}>Privacy and cookies</a>
        </p>
      </div>
      <div class="cookie-banner-actions">
        <button type="button" class="button button-secondary" onclick={rejectNonEssential}
          >Reject non-essential</button
        >
        <button type="button" class="button button-secondary" onclick={openPrefs}
          >Preferences</button
        >
        <button type="button" class="button button-secondary" onclick={acceptAll}>Accept all</button
        >
      </div>
    </div>
  </div>
{/if}

<dialog
  bind:this={dialogEl}
  class="cookie-dialog"
  aria-labelledby="cookie-prefs-title"
  onclick={onDialogClick}
>
  <form class="cookie-dialog-form" onsubmit={(event) => event.preventDefault()}>
    <p class="eyebrow">Cookies</p>
    <h2 id="cookie-prefs-title">Cookie preferences</h2>
    <p class="cookie-dialog-lead">
      Strictly necessary cookies keep the site working and cannot be turned off. Optional cookies
      stay off unless you choose them. None of the optional categories are used today.
    </p>

    <fieldset class="cookie-categories">
      <legend class="sr-only">Cookie categories</legend>
      <label class="cookie-category">
        <span class="cookie-category-header">
          <input type="checkbox" checked disabled />
          <span>Strictly necessary</span>
          <span class="cookie-category-state">Always on</span>
        </span>
        <span class="cookie-category-copy">
          Remembers your light or dark theme and this cookie choice so the site works the same after
          a refresh.
        </span>
      </label>
      <label class="cookie-category">
        <span class="cookie-category-header">
          <input type="checkbox" bind:checked={analytics} />
          <span>Analytics</span>
        </span>
        <span class="cookie-category-copy">
          Not used today. If analytics are added later, they would only run after you opt in.
        </span>
      </label>
      <label class="cookie-category">
        <span class="cookie-category-header">
          <input type="checkbox" bind:checked={marketing} />
          <span>Marketing</span>
        </span>
        <span class="cookie-category-copy">
          Not used today. If marketing tools are added later, they would only run after you opt in.
        </span>
      </label>
    </fieldset>

    <div class="cookie-dialog-actions">
      <button type="button" class="button button-secondary" onclick={closePrefs}>Cancel</button>
      <button type="button" class="button button-secondary" onclick={rejectNonEssential}
        >Reject non-essential</button
      >
      <button type="button" class="button button-secondary" onclick={acceptAll}>Accept all</button>
      <button type="button" class="button" onclick={savePrefs}>Save preferences</button>
    </div>
  </form>
</dialog>

<style>
  .cookie-banner {
    position: fixed;
    z-index: 80;
    inset: auto 0 0;
    border-top: 1px solid var(--border);
    background: var(--background);
    box-shadow: 0 -12px 28px color-mix(in srgb, var(--foreground) 10%, transparent);
  }

  .cookie-banner-inner {
    display: grid;
    gap: 1.25rem;
    padding-block: 1.25rem 1.5rem;
  }

  .cookie-banner-copy {
    display: grid;
    gap: 0.5rem;
  }

  .cookie-banner-copy p:not(.eyebrow) {
    color: var(--muted-foreground);
    font-size: 0.9375rem;
  }

  .cookie-banner-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
  }

  .cookie-dialog {
    position: fixed;
    inset: 0;
    width: 100%;
    max-width: none;
    height: 100%;
    max-height: none;
    margin: 0;
    overflow: auto;
    border: 0;
    background: transparent;
    padding: 1rem;
    color: var(--foreground);
  }

  .cookie-dialog[open] {
    display: grid;
    place-items: center;
  }

  .cookie-dialog::backdrop {
    background: rgb(23 33 43 / 0.48);
  }

  :global(html.dark) .cookie-dialog::backdrop {
    background: rgb(0 0 0 / 0.66);
  }

  .cookie-dialog-form {
    width: min(100%, 36rem);
    max-height: min(90dvh, 40rem);
    overflow: auto;
    display: grid;
    gap: 1rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--background);
    padding: 1.5rem;
    box-shadow: 0 16px 40px color-mix(in srgb, #000 18%, transparent);
  }

  .cookie-dialog-form h2 {
    font-size: 1.5rem;
    line-height: 1.3;
  }

  .cookie-dialog-lead,
  .cookie-category-copy {
    color: var(--muted-foreground);
    font-size: 0.9375rem;
  }

  .cookie-categories {
    display: grid;
    gap: 0.75rem;
    margin: 0.25rem 0 0;
    border: 0;
    padding: 0;
  }

  .cookie-category {
    display: grid;
    gap: 0.4rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--muted);
    padding: 0.9rem 1rem;
  }

  .cookie-category-header {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    font-size: 0.9375rem;
    font-weight: 500;
  }

  .cookie-category-header input {
    width: 1.1rem;
    height: 1.1rem;
    accent-color: var(--primary);
  }

  .cookie-category-state {
    margin-inline-start: auto;
    color: var(--muted-foreground);
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .cookie-dialog-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }

  @media (min-width: 48rem) {
    .cookie-banner-inner {
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
    }

    .cookie-banner-actions {
      justify-content: end;
    }
  }

  @media (max-width: 47.999rem) {
    .cookie-banner-actions,
    .cookie-dialog-actions {
      display: grid;
    }

    .cookie-banner-actions .button,
    .cookie-dialog-actions .button {
      width: 100%;
    }
  }
</style>
