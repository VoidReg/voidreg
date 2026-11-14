<script lang="ts">
  import { resolve } from '$app/paths';
  import { openCookieSettings } from '$lib/consent';
  import CircuitDivider from './CircuitDivider.svelte';
</script>

<footer class="site-footer">
  <div class="site-container">
    <CircuitDivider variant="bus" />
    <p class="footer-wordmark" aria-hidden="true">Void<span>reg</span></p>
    <div class="footer-inner">
      <p>Copyright 2026 Voidreg.<br />All rights reserved (for now).</p>
      <nav class="footer-links" aria-label="Footer">
        <a href={resolve('/privacy')}>Privacy</a>
        <a href={resolve('/terms')}>Terms</a>
        <a href={resolve('/agents')}>For agents</a>
        <a href={resolve('/rss.xml')}>RSS</a>
        <button type="button" onclick={openCookieSettings}>Cookie settings</button>
        <a href="#top">Back to top</a>
      </nav>
    </div>
    <a
      class="publisle-banner"
      href="https://publisle.xyz"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="This website uses Publisle"
    >
      <span>This website uses</span>
      <span class="publisle-lockup">
        <img
          class="publisle-light"
          src="/brand/publisle-lockup-light.svg"
          alt=""
          width="94"
          height="28"
        />
        <img
          class="publisle-dark"
          src="/brand/publisle-lockup-dark.svg"
          alt=""
          aria-hidden="true"
          width="94"
          height="28"
        />
      </span>
    </a>
  </div>
</footer>

<style>
  .publisle-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem 1.5rem;
    margin-top: 2rem;
    border: 1px solid var(--border);
    background: var(--card);
    padding: 0.75rem 1.25rem;
    color: var(--muted-foreground);
    font-size: 0.875rem;
    text-decoration: none;
  }

  .publisle-banner:hover {
    border-color: var(--foreground);
    color: var(--foreground);
  }

  .publisle-lockup {
    display: block;
    flex: none;
    height: 1.75rem;
    aspect-ratio: 803 / 240;
  }

  .publisle-lockup img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .publisle-dark {
    display: none;
  }

  :global(.dark) .publisle-light {
    display: none;
  }

  :global(.dark) .publisle-dark {
    display: block;
  }

  @media (max-width: 47.999rem) {
    .publisle-banner {
      flex-direction: column;
      text-align: center;
    }
  }
</style>
