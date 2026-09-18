<script lang="ts">
  import { resolve } from '$app/paths';
  import { openCookieSettings } from '$lib/consent';
</script>

<footer class="site-footer">
  <div class="site-container footer-inner">
    <p>© 2026 Voidreg.<br />All rights reserved (for now).</p>
    <nav class="footer-links" aria-label="Legal">
      <a href={resolve('/privacy')}>Privacy</a>
      <button type="button" onclick={openCookieSettings}>Cookie settings</button>
      <a href="#top">Back to top</a>
    </nav>
  </div>
</footer>
