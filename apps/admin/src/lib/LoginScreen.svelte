<script lang="ts">
  import ProviderButton from '@voidreg/publishing-ui/ProviderButton.svelte';
  import { isSignInProvider } from '@voidreg/publishing-ui/provider-button';
  import { session } from './session.svelte';
  import { theme } from './ui/theme.svelte';
  import Icon from './components/Icon.svelte';
  let { onsignedin, error = '' }: { onsignedin: () => void; error?: string } = $props();
  let password = $state('');
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (await session.login(password)) {
      password = '';
      onsignedin();
    }
  }
</script>

<main id="main-content" class="login">
  <button
    type="button"
    class="ui-btn ui-btn-quiet login-theme"
    aria-label={theme.dark ? 'Switch to light theme' : 'Switch to dark theme'}
    onclick={() => theme.toggle()}><Icon name={theme.dark ? 'sun' : 'moon'} size={18} /></button
  >
  <section class="login-card" aria-labelledby="sign-in-title">
    <p class="login-kicker">Voidreg</p>
    <h1 id="sign-in-title">Sign in to publishing</h1>
    <p class="login-lead">Use an approved GitHub or Google account to manage content.</p>
    {#if error || session.notice}
      <p class="ui-notice ui-notice-error" role="alert">{error || session.notice}</p>
    {/if}
    {#if session.rejectedAccount}
      <p class="ui-field-hint">Account ID: <code>{session.rejectedAccount}</code></p>
    {/if}
    {#if session.optionsError}
      <p class="ui-notice ui-notice-error" role="alert">{session.optionsError}</p>
      <button type="button" class="ui-btn" onclick={() => session.loadOptions()}>Retry</button>
    {:else if !session.options}
      <div class="login-skeleton" role="status" aria-label="Loading sign-in options">
        <span class="ui-skeleton"></span><span class="ui-skeleton"></span>
      </div>
    {:else}
      <div class="login-providers">
        {#each session.options.providers.filter(isSignInProvider) as provider (provider)}
          <ProviderButton {provider} href={'/api/v1/auth/' + provider + '/start?purpose=admin'} />
        {/each}
      </div>
      {#if session.options.providers.length === 0 && !session.options.password_enabled}
        <p class="ui-notice">Admin sign-in is not available yet. Contact the site owner.</p>
      {/if}
      {#if session.options.password_enabled}
        <form onsubmit={submit} class="login-form">
          <label class="ui-field"
            >Admin password<input
              type="password"
              bind:value={password}
              autocomplete="current-password"
              required
            /></label
          >
          {#if session.loginError}<p class="ui-notice ui-notice-error" role="alert">
              {session.loginError}
            </p>{/if}
          <button class="ui-btn" disabled={session.busy || !password}
            >{session.busy ? 'Signing in...' : 'Sign in with password'}</button
          >
        </form>
      {/if}
    {/if}
  </section>
</main>

<style>
  .login {
    position: relative;
    display: grid;
    min-height: 100dvh;
    place-items: center;
    padding: 1.5rem;
  }
  .login-theme {
    position: absolute;
    inset-block-start: 1rem;
    inset-inline-end: 1rem;
  }
  .login-card {
    display: grid;
    gap: 1rem;
    border: 1px solid var(--border);
    background: var(--card);
    padding: 2rem;
    width: min(26rem, 100%);
  }
  .login-kicker {
    color: var(--muted-foreground);
    font-family: var(--font-code);
    font-size: 0.75rem;
    text-transform: uppercase;
  }
  h1 {
    font-size: 1.5rem;
    line-height: 1.2;
  }
  .login-lead {
    color: var(--muted-foreground);
  }
  .login-providers,
  .login-form,
  .login-skeleton {
    display: grid;
    gap: 0.75rem;
  }
  .login-skeleton .ui-skeleton {
    height: 2.75rem;
  }
  .login-form {
    border-top: 1px solid var(--border);
    padding-top: 1rem;
  }
</style>
