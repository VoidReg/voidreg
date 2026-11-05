<script lang="ts">
  import copy from '$lib/content/portfolio-copy.json';
  import EmptyContent from '$lib/components/EmptyContent.svelte';
  import { resolve } from '$app/paths';
  import ProjectCard from '$lib/components/ProjectCard.svelte';
  import Seo from '$lib/Seo.svelte';
  let { data } = $props();
</script>

<Seo title="Projects | Voidreg" description={copy.projectsIntro} />
<main id="main-content" class="site-container page-shell">
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <a href={resolve('/')}>Home</a><span>/</span><span aria-current="page">Projects</span>
  </nav>
  <header class="section-stack">
    <p class="eyebrow">Projects</p>
    <h1 class="display-heading">Projects across layers</h1>
    <p class="lead">{copy.projectsIntro}</p>
  </header>
  <section class="card-grid" aria-label="Projects">
    {#each data.result.items as project (project.slug)}<ProjectCard
        {project}
        heading="h2"
      />{:else}<EmptyContent kind="projects" heading="h2" />{/each}
  </section>
  {#if data.result.total > 0}<nav class="button-row" aria-label="Project pages">
      {#if data.result.page > 1}<a
          class="button button-secondary"
          href={resolve(`/projects?page=${data.result.page - 1}`)}>Previous</a
        >{/if}<span>Page {data.result.page}</span
      >{#if data.result.page * data.result.per_page < data.result.total}<a
          class="button button-secondary"
          href={resolve(`/projects?page=${data.result.page + 1}`)}>Next</a
        >{/if}
    </nav>{/if}
</main>
