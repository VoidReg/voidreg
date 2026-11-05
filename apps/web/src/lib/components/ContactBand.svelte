<script lang="ts">
  import { resolve } from '$app/paths';
  import Icon from './Icon.svelte';

  let {
    eyebrow,
    title,
    body,
    action
  }: { eyebrow: string; title: string; body: string; action: string } = $props();
</script>

<section class="band band-primary contact-band" aria-labelledby="contact-band-title">
  <div class="site-container contact-grid">
    <div class="contact-copy">
      <p class="eyebrow">{eyebrow}</p>
      <h2 id="contact-band-title" class="display-heading">{title}</h2>
      <p>{body}</p>
    </div>
    <a class="button button-inverse" href={resolve('/about#contact')}
      >{action} <Icon name="arrow-right" size={16} /></a
    >
  </div>
</section>
