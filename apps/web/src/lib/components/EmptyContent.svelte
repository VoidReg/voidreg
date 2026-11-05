<script lang="ts">
  import copy from '$lib/content/portfolio-copy.json';

  let {
    kind,
    heading = 'h3'
  }: {
    kind: 'projects' | 'featured' | 'articles';
    heading?: 'h2' | 'h3';
  } = $props();
  const title = $derived(kind === 'articles' ? copy.articlesEmptyTitle : copy.projectsEmptyTitle);
  const description = $derived(
    kind === 'articles'
      ? copy.articlesEmptyDescription
      : kind === 'featured'
        ? copy.featuredEmptyDescription
        : copy.projectsEmptyDescription
  );
</script>

<div class="empty-block">
  <svelte:element this={heading}>{title}</svelte:element>
  <p>{description}</p>
</div>
