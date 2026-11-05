<script lang="ts">
  import { resolve } from '$app/paths';
  let { data } = $props();
  let copied = $state(false);
  let copyError = $state('');
  async function copy() {
    try {
      await navigator.clipboard.writeText(data.source);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      copyError = 'Select the source text to copy it.';
    }
  }
</script>

<svelte:head
  ><title>Markdown source: {data.article.title} | Voidreg</title><meta
    name="robots"
    content="noindex,follow"
  /></svelte:head
>
<main id="main-content" class="site-container page-shell">
  <a class="text-link" href={resolve('/blog/[slug]', { slug: data.article.slug })}
    >Back to article</a
  >
  <h1 class="display-heading">Markdown source</h1>
  <p class="lead">{data.article.title}</p>
  <div class="button-row">
    <button class="button button-secondary" onclick={copy}
      >{copied ? 'Copied' : 'Copy Markdown'}</button
    ><a
      class="button button-secondary"
      href={resolve('/blog/[slug]/source.md', { slug: data.article.slug })}
      download>Download Markdown</a
    ><a
      class="button button-secondary"
      href={resolve(`/blog/${data.article.slug}/source.md?format=archival`)}
      download>Download complete archival Markdown</a
    >
  </div>
  <p>
    Readable Markdown includes rich-block directives. The complete archival format preserves the
    entire Publisle document for lossless import.
  </p>
  {#each data.notes as note, index (index)}<p class="placeholder-note">{note}</p>{/each}
  <p role="status">{copyError}</p>
  <pre aria-label="Markdown source"><code>{data.source}</code></pre>
</main>

<style>
  pre {
    max-width: 100%;
    overflow: auto;
    padding: 1.5rem;
    background: var(--card);
    border-radius: var(--radius);
    font: 0.8125rem/1.5 var(--font-code);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
