<script lang="ts">
  import { onMount } from 'svelte';
  import '../app.css';
  import '$lib/ui/ui.css';
  import ConfirmDialog from '$lib/ui/ConfirmDialog.svelte';
  import Toasts from '$lib/ui/Toasts.svelte';
  import { theme } from '$lib/ui/theme.svelte';
  let { children } = $props();
  onMount(() => theme.init());
</script>

<a class="skip-link" href="#main-content">Skip to content</a>
{@render children()}
<ConfirmDialog />
<Toasts />
