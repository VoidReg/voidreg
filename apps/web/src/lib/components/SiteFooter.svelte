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
  </div>
</footer>
