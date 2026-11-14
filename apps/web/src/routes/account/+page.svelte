<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import Avatar from '$lib/components/Avatar.svelte';
  import Breadcrumb from '$lib/components/Breadcrumb.svelte';
  import SectionLabel from '$lib/components/SectionLabel.svelte';
  import Seo from '$lib/Seo.svelte';
  import ProviderButton from '@voidreg/publishing-ui/ProviderButton.svelte';
  import { isSignInProvider } from '@voidreg/publishing-ui/provider-button';
  import { authErrorMessage, providerLabel, session, signInUrl } from '$lib/session.svelte';

  const JSON_HEADERS = { 'Content-Type': 'application/json' };
  const profile = $derived(session.data?.profile);
  const identity = $derived(session.data?.identity);
  const providers = $derived(session.data?.providers ?? []);
  const authError = $derived(authErrorMessage(page.url.searchParams.get('auth_error')));
  const photos = $derived(profile?.linked.filter((account) => account.has_avatar) ?? []);
  const unlinkedProviders = $derived(
    providers.filter(
      (provider) => !profile?.linked.some((account) => account.provider === provider)
    )
  );

  let draft = $state<string | undefined>();
  const nameValue = $derived(draft ?? profile?.display_name ?? '');
  let busy = $state(''),
    status = $state(''),
    problem = $state(''),
    confirmDelete = $state(false),
    removeComments = $state(false),
    deleted = $state(false);

  onMount(() => {
    void session.load(true);
  });

  /** Runs one change, reporting success or the API's message in the live regions. */
  async function run(key: string, done: string, action: () => Promise<unknown>) {
    busy = key;
    status = '';
    problem = '';
    try {
      await action();
      status = done;
      return true;
    } catch (e) {
      problem = (e as Error).message;
      return false;
    } finally {
      busy = '';
    }
  }
  const patch = (body: Record<string, unknown>) =>
    session.send('/auth/profile', {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify(body)
    });

  async function saveName(event: SubmitEvent) {
    event.preventDefault();
    if (await run('name', 'Display name saved.', () => patch({ display_name: nameValue })))
      draft = undefined;
  }
  function toggleAvatar(event: Event) {
    const show = (event.currentTarget as HTMLInputElement).checked;
    void run('avatar', show ? 'Your photo is now shown.' : 'Your photo is now hidden.', () =>
      patch({ show_avatar: show })
    );
  }
  function chooseSource(identityId: string) {
    void run('source', 'Photo source changed.', () => patch({ avatar_identity_id: identityId }));
  }
  function disconnect(id: string, label: string) {
    if (!confirm(`Disconnect ${label}? Your comments stay on your profile.`)) return;
    void run('unlink', `${label} disconnected.`, () =>
      session.send(`/auth/identities/${encodeURIComponent(id)}`, { method: 'DELETE' })
    );
  }
  function signOutHere() {
    void run('signout', 'You are signed out.', () => session.signOut());
  }
  function signOutEverywhere() {
    void run('signout-all', 'You are signed out on every device.', () =>
      session.send('/auth/sessions', { method: 'DELETE' })
    );
  }
  async function deleteAccount() {
    const query = removeComments ? '?remove_comments=true' : '';
    if (
      await run('delete', 'Your account was deleted.', () =>
        session.send(`/auth/profile${query}`, { method: 'DELETE' })
      )
    ) {
      deleted = true;
      confirmDelete = false;
    }
  }
</script>

<Seo
  title="Account | Voidreg"
  description="Manage your Voidreg commenter profile: display name, photo, connected accounts and data."
  noindex
/>

<main id="main-content" class="site-container page-shell account-page">
  <Breadcrumb items={[{ label: 'Home', href: resolve('/') }, { label: 'Account' }]} />

  <section class="account-section">
    <p class="eyebrow">Account</p>
    <h1 class="display-heading">Your profile</h1>
    <p class="lead">
      Signing in is optional. It gives your comments one name and photo that you control, instead of
      a guest name that waits for review.
    </p>
  </section>

  <div class="messages" aria-live="polite">
    {#if status}<p class="notice" role="status">{status}</p>{/if}
    {#if problem}<p class="alert" role="alert">{problem}</p>{/if}
    {#if authError}<p class="alert" role="alert">{authError}</p>{/if}
  </div>

  {#if !session.data}
    <p class="muted" role="status">Loading your account...</p>
  {:else if !profile || !identity}
    <section class="account-section">
      <SectionLabel label="01 / Sign in" />
      <h2>{deleted ? 'Your account is gone' : 'Sign in to comment as yourself'}</h2>
      {#if deleted}
        <p class="muted">
          Your profile, connected accounts and sessions were deleted. Your comments are no longer
          linked to you.
        </p>
      {:else}
        <ul class="benefits">
          <li>Your comments publish right away, without waiting for review.</li>
          <li>One name and photo, shown the same way on every post.</li>
          <li>Connect GitHub and Google to the same profile.</li>
          <li>Your photo stays hidden until you choose to show it.</li>
        </ul>
      {/if}
      {#if providers.length && !deleted}
        <div class="provider-buttons">
          {#each providers.filter(isSignInProvider) as provider (provider)}
            <ProviderButton {provider} href={signInUrl(provider, '/account')} />
          {/each}
        </div>
        <p class="muted small">
          We store the name, email and photo address your provider shares, only to run your profile.
          See the <a class="text-link" href={resolve('/privacy')}>privacy notice</a>.
        </p>
      {:else if !deleted}
        <p class="muted">Sign-in is not available right now. You can still comment as a guest.</p>
      {/if}
    </section>
  {:else}
    <section class="account-section" aria-labelledby="profile-heading">
      <SectionLabel label="01 / Profile" />
      <h2 id="profile-heading">Name and photo</h2>
      <div class="preview">
        <Avatar name={profile.display_name} src={profile.avatar_url} size={64} />
        <p>
          <strong>{profile.display_name}</strong>
          <span class="muted small"
            >How your comments appear.
            {profile.avatar_url ? 'Your photo is shown.' : 'Your photo is hidden.'}</span
          >
        </p>
      </div>

      <form class="publishing-form" onsubmit={saveName} aria-busy={busy === 'name'}>
        <label for="display-name">Display name</label>
        <input
          id="display-name"
          value={nameValue}
          oninput={(event) => (draft = event.currentTarget.value)}
          required
          minlength="2"
          maxlength="40"
          autocomplete="nickname"
          aria-describedby="display-name-help"
        />
        <p id="display-name-help" class="muted small">
          2 to 40 characters. Names are unique, and changing yours updates your earlier comments.
        </p>
        <button
          class="button"
          disabled={busy === 'name' || nameValue.trim() === profile.display_name}
          >{busy === 'name' ? 'Saving...' : 'Save name'}</button
        >
      </form>

      <div class="photo-choice">
        <label class="check">
          <input
            type="checkbox"
            checked={profile.show_avatar}
            disabled={busy === 'avatar' || photos.length === 0}
            onchange={toggleAvatar}
          />
          <span>Show my photo on my comments</span>
        </label>
        <p class="muted small">
          {#if photos.length === 0}
            None of your connected accounts shared a photo, so initials are shown.
          {:else}
            Readers load your photo from this site, never from {photos
              .map((p) => providerLabel(p.provider))
              .join(' or ')}. Turn this off and it is removed from view.
          {/if}
        </p>
        {#if photos.length > 1}
          <fieldset class="sources" disabled={busy === 'source'}>
            <legend>Photo from</legend>
            {#each photos as account (account.identity_id)}
              <label class="check">
                <input
                  type="radio"
                  name="photo-source"
                  checked={profile.avatar_identity_id === account.identity_id}
                  onchange={() => chooseSource(account.identity_id)}
                />
                <span>{providerLabel(account.provider)} ({account.name})</span>
              </label>
            {/each}
          </fieldset>
        {/if}
      </div>
    </section>

    <section class="account-section" aria-labelledby="accounts-heading">
      <SectionLabel label="02 / Connected accounts" />
      <h2 id="accounts-heading">Sign-in methods</h2>
      <ul class="accounts">
        {#each profile.linked as account (account.identity_id)}
          {@const label = providerLabel(account.provider)}
          <li>
            <p>
              <strong>{label}</strong>
              {#if account.current}<span class="badge">This session</span>{/if}
              <span class="muted small"
                >{account.name}{account.email ? `, ${account.email}` : ''}</span
              >
            </p>
            <button
              type="button"
              class="button button-secondary"
              disabled={busy === 'unlink' || account.current || profile.linked.length < 2}
              title={account.current
                ? 'Sign in with another account to disconnect this one.'
                : profile.linked.length < 2
                  ? 'Connect another account first.'
                  : undefined}
              onclick={() => disconnect(account.identity_id, label)}
              >Disconnect<span class="sr-only"> {label}</span></button
            >
          </li>
        {/each}
      </ul>
      {#if unlinkedProviders.length}
        <div class="provider-buttons">
          {#each unlinkedProviders.filter(isSignInProvider) as provider (provider)}
            <ProviderButton
              {provider}
              intent="continue"
              href={signInUrl(provider, '/account', true)}
            />
          {/each}
        </div>
        <p class="muted small">
          Accounts that share a verified email join this profile automatically when you sign in.
        </p>
      {/if}
    </section>

    <section class="account-section" aria-labelledby="sessions-heading">
      <SectionLabel label="03 / Sessions" />
      <h2 id="sessions-heading">Where you are signed in</h2>
      <p class="muted">
        You stay signed in on this device for 30 days. Signing out everywhere ends every session of
        your profile.
      </p>
      <div class="button-row">
        <button
          type="button"
          class="button button-secondary"
          disabled={busy === 'signout'}
          onclick={signOutHere}>Sign out</button
        >
        <button
          type="button"
          class="button button-secondary"
          disabled={busy === 'signout-all'}
          onclick={signOutEverywhere}>Sign out everywhere</button
        >
      </div>
    </section>

    <section class="account-section" aria-labelledby="data-heading">
      <SectionLabel label="04 / Your data" />
      <h2 id="data-heading">Download or delete</h2>
      <p class="muted">
        Download your profile, connected accounts and comments as JSON, or delete your account.
        Deleting keeps your comments in their threads as &ldquo;Deleted user&rdquo; unless you also
        remove them.
      </p>
      <div class="button-row">
        <!-- eslint-disable svelte/no-navigation-without-resolve -->
        <a class="button button-secondary" href="/api/v1/auth/profile/export" download
          >Download my data</a
        >
        <!-- eslint-enable svelte/no-navigation-without-resolve -->
        {#if !confirmDelete}
          <button type="button" class="button button-danger" onclick={() => (confirmDelete = true)}
            >Delete account</button
          >
        {/if}
      </div>
      {#if confirmDelete}
        <div class="danger-zone" role="group" aria-labelledby="delete-heading">
          <h3 id="delete-heading">Delete your account?</h3>
          <p>This removes your profile, connected accounts and sessions. It cannot be undone.</p>
          <label class="check">
            <input type="checkbox" bind:checked={removeComments} />
            <span>Also remove the text of my comments</span>
          </label>
          <div class="button-row">
            <button
              type="button"
              class="button button-danger"
              disabled={busy === 'delete'}
              onclick={deleteAccount}
              >{busy === 'delete' ? 'Deleting...' : 'Yes, delete my account'}</button
            >
            <button
              type="button"
              class="button button-secondary"
              disabled={busy === 'delete'}
              onclick={() => (confirmDelete = false)}>Keep my account</button
            >
          </div>
        </div>
      {/if}
    </section>
  {/if}
</main>

<style>
  .account-section {
    display: grid;
    gap: 1rem;
    max-width: 44rem;
  }
  .account-section h2 {
    font-size: 1.5rem;
    line-height: 1.3;
  }
  .messages {
    display: grid;
    gap: 0.75rem;
    max-width: 44rem;
    margin-block: -2rem;
  }
  .messages:not(:has(*)) {
    display: none;
  }
  .notice,
  .alert {
    margin: 0;
    border-inline-start: 3px solid var(--primary);
    background: var(--card);
    padding: 0.75rem 1rem;
  }
  .alert {
    border-inline-start-color: var(--danger);
  }
  .muted {
    color: var(--muted-foreground);
  }
  .small {
    font-size: 0.875rem;
  }
  .benefits {
    display: grid;
    gap: 0.5rem;
    margin: 0;
    padding-inline-start: 1.2rem;
    color: var(--muted-foreground);
  }
  .preview {
    display: flex;
    align-items: center;
    gap: 1rem;
    border: 1px solid var(--border);
    background: var(--card);
    padding: 1rem;
  }
  .preview p {
    display: grid;
    gap: 0.25rem;
    min-width: 0;
  }
  .preview strong {
    overflow-wrap: anywhere;
  }
  .photo-choice {
    display: grid;
    gap: 0.75rem;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: 2.75rem;
  }
  .check input {
    width: 1.25rem;
    height: 1.25rem;
    min-height: 0;
    flex: none;
    accent-color: var(--primary);
  }
  .sources {
    display: grid;
    gap: 0.25rem;
    margin: 0;
    border: 1px solid var(--border);
    padding: 0.75rem 1rem;
  }
  .sources legend {
    padding-inline: 0.25rem;
    font-size: 0.875rem;
  }
  .accounts {
    display: grid;
    gap: 0.75rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .accounts li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    border: 1px solid var(--border);
    padding: 0.75rem 1rem;
  }
  .accounts p {
    display: grid;
    gap: 0.125rem;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .badge {
    justify-self: start;
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0 0.5rem;
    color: var(--muted-foreground);
    font: 500 0.6875rem/1.5 var(--font-code);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .danger-zone {
    display: grid;
    gap: 0.75rem;
    border: 1px solid var(--danger);
    padding: 1rem;
  }
  .danger-zone h3 {
    font-size: 1.125rem;
  }
  .button-danger {
    border-color: var(--danger);
    background: var(--danger);
    color: var(--danger-foreground);
  }
  .button-danger:hover {
    background: var(--danger);
    filter: brightness(0.92);
  }
  .button-danger:disabled {
    background: var(--disabled);
    border-color: var(--disabled);
    color: var(--disabled-foreground);
  }
</style>
