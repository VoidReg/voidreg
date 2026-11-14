<script lang="ts">
  import githubMark from './brand/github-invertocat.svg';
  import githubMarkWhite from './brand/github-invertocat-white.svg';
  import googleMark from './brand/google-g.png';
  import { providerButtonLabel, type ProviderIntent, type SignInProvider } from './provider-button';

  // The address is the OAuth start URL, not an in-app route.
  let {
    provider,
    href,
    intent = 'signin'
  }: {
    provider: SignInProvider;
    href: string;
    intent?: ProviderIntent;
  } = $props();
  const label = $derived(providerButtonLabel(provider, intent));
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->
<a class="provider-button" class:google={provider === 'google'} class:github={provider === 'github'} {href}>
  {#if provider === 'google'}
    <img class="mark" src={googleMark} alt="" width="20" height="20" />
  {:else}
    <img class="mark mark-light" src={githubMark} alt="" width="20" height="20" />
    <img class="mark mark-dark" src={githubMarkWhite} alt="" width="20" height="20" />
  {/if}
  <span>{label}</span>
</a>
<!-- eslint-enable svelte/no-navigation-without-resolve -->

<style>
  @font-face {
    font-family: 'Google Sans';
    font-style: normal;
    font-weight: 500;
    font-display: swap;
    src: url('./brand/GoogleSans-Medium.woff2') format('woff2');
  }

  :global(.provider-buttons) {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    width: 100%;
    max-width: 400px;
  }

  .provider-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    box-sizing: border-box;
    width: 100%;
    min-height: 40px;
    margin: 0;
    padding: 0 12px;
    border: 1px solid #747775;
    border-radius: 4px;
    background: #fff;
    color: #1f1f1f;
    font-size: 14px;
    font-weight: 500;
    line-height: 20px;
    letter-spacing: normal;
    text-decoration: none;
    white-space: nowrap;
    cursor: pointer;
  }

  .provider-button:hover,
  .provider-button:active {
    translate: none;
    box-shadow: none;
  }

  .provider-button:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
  }

  .google {
    font-family: 'Google Sans', sans-serif;
  }

  .github {
    font-family: var(--font-ui);
  }

  :global(.dark) .provider-button {
    border-color: #8e918f;
    background: #131314;
    color: #e3e3e3;
  }

  .mark {
    display: block;
    width: 20px;
    height: 20px;
    flex: none;
    object-fit: contain;
  }

  .google .mark {
    background: #fff;
  }

  .mark-dark {
    display: none;
  }

  :global(.dark) .mark-light {
    display: none;
  }

  :global(.dark) .mark-dark {
    display: block;
  }
</style>
