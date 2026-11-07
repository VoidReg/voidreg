<script lang="ts">
  import '../app.css';
  import '$lib/styles/landing.css';
  import { page } from '$app/state';
  import CookieConsent from '$lib/components/CookieConsent.svelte';
  import ErrorHeader from '$lib/components/ErrorHeader.svelte';
  import SiteFooter from '$lib/components/SiteFooter.svelte';
  import SiteHeader from '$lib/components/SiteHeader.svelte';

  let { children } = $props();
</script>

<svelte:head>
  <meta property="og:site_name" content="Voidreg" />
  <meta property="og:locale" content="en_US" />
  <link rel="alternate" type="application/rss+xml" title="Voidreg posts" href="/rss.xml" />
  <link rel="alternate" type="text/plain" title="Voidreg for LLMs" href="/llms.txt" />
  <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content="#0b0f14" media="(prefers-color-scheme: dark)" />
</svelte:head>

<a class="skip-link" href="#main-content">Skip to content</a>
<div id="top">
  {#if page.error}
    <ErrorHeader />
  {:else}
    <SiteHeader />
  {/if}
  {@render children()}
  {#if !page.error}<SiteFooter />{/if}
</div>
<CookieConsent />
