<script lang="ts">
  import Icon from '$lib/components/Icon.svelte';
  import { resolve } from '$app/paths';
  import type { Project } from '$lib/data/projects';
  let { project, heading = 'h3' }: { project: Project; heading?: 'h2' | 'h3' } = $props();
</script>

<article class="feature-card">
  <div class="feature-copy">
    <span class="eyebrow">{project.category}</span>
    <svelte:element this={heading}>{project.title}</svelte:element>
    <p>{project.summary}</p>
    <a class="button button-secondary" href={resolve('/projects/[slug]', { slug: project.slug })}
      >View project <Icon name="arrow-right" size={16} /></a
    >
  </div>
  <div class="feature-side">
    <span class="feature-index" aria-hidden="true">FEATURED / 01</span>
    <div class="tags" aria-label={`${project.title} technologies`}>
      {#each project.tags as tag (tag)}<span class="tag">{tag}</span>{/each}
    </div>
  </div>
</article>
