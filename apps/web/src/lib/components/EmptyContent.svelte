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

<div class="empty-content">
  <svelte:element this={heading}>{title}</svelte:element>
  <p>{description}</p>
</div>

<style>
  .empty-content {
    display: grid;
    grid-column: 1 / -1;
    gap: 0.75rem;
    align-content: start;
    border-block: 1px solid var(--border);
    padding-block: 2rem;
  }
  h2,
  h3 {
    font-size: 1.5rem;
    line-height: 1.3;
  }
  p {
    max-width: 68ch;
    color: var(--muted-foreground);
  }
  @media (max-width: 47.999rem) {
    h2,
    h3 {
      font-size: 1.25rem;
    }
  }
</style>
