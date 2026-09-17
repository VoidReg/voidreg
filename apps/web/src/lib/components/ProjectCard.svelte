<script lang="ts">
  import type { Project } from '$lib/data/projects';
  let { project }: { project: Project } = $props();
</script>

<article class="project-card">
  <span class="eyebrow">{project.category}</span>
  <h3>{project.title}</h3>
  <p>{project.summary}</p>
  <div class="tags" aria-label={`${project.title} technologies`}>
    {#each project.tags as tag (tag)}<span class="tag">{tag}</span>{/each}
  </div>
  <span class="button button-secondary button-disabled" aria-disabled="true">Read case study</span>
</article>
