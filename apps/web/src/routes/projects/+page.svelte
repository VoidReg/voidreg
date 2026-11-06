<script lang="ts">
  import copy from '$lib/content/portfolio-copy.json';
  import EmptyContent from '$lib/components/EmptyContent.svelte';
  import { resolve } from '$app/paths';
  import ProjectCard from '$lib/components/ProjectCard.svelte';
  import Seo from '$lib/Seo.svelte';
  let { data } = $props();
  const href = (next: { tag?: string; category?: string; page?: number }) => {
    const tag = next.tag ?? data.tag;
    const category = next.category ?? data.category;
    const params = [];
    if (category) params.push('category=' + encodeURIComponent(category));
    if (tag) params.push('tag=' + encodeURIComponent(tag));
    if (next.page && next.page > 1) params.push('page=' + next.page);
    return (params.length ? `/projects?${params.join('&')}` : '/projects') as '/projects';
  };
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
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
  {#if data.categories.length || data.tags.length}<div class="filter-groups">
      {#if data.categories.length}<nav aria-label="Filter projects by category">
          <p class="filter-label">Category</p>
          <ul class="chip-row">
            <li>
              <a
                class="chip"
                href={resolve(href({ category: '' }))}
                aria-current={data.category ? undefined : 'true'}>All</a
              >
            </li>
            {#each data.categories as category (category)}<li>
                <a
                  class="chip"
                  href={resolve(href({ category }))}
                  aria-current={same(data.category, category) ? 'true' : undefined}>{category}</a
                >
              </li>{/each}
          </ul>
        </nav>{/if}
      {#if data.tags.length}<nav aria-label="Filter projects by technology">
          <p class="filter-label">Technology</p>
          <ul class="chip-row">
            <li>
              <a
                class="chip"
                href={resolve(href({ tag: '' }))}
                aria-current={data.tag ? undefined : 'true'}>All</a
              >
            </li>
            {#each data.tags as tag (tag)}<li>
                <a
                  class="chip"
                  href={resolve(href({ tag }))}
                  aria-current={same(data.tag, tag) ? 'true' : undefined}>{tag}</a
                >
              </li>{/each}
          </ul>
        </nav>{/if}
    </div>{/if}
  {#if data.tag || data.category}<p class="filter-status" role="status">
      {data.result.total}
      {data.result.total === 1 ? 'project matches' : 'projects match'} these filters.
      <a class="text-link" href={resolve('/projects')}>Clear filters</a>
    </p>{/if}
  <section class="card-grid" aria-label="Projects">
    {#each data.result.items as project (project.slug)}<ProjectCard
        {project}
        heading="h2"
      />{:else}<EmptyContent kind="projects" heading="h2" />{/each}
  </section>
  {#if data.result.total > 0}<nav class="button-row" aria-label="Project pages">
      {#if data.result.page > 1}<a
          class="button button-secondary"
          href={resolve(href({ page: data.result.page - 1 }))}>Previous</a
        >{/if}<span>Page {data.result.page}</span
      >{#if data.result.page * data.result.per_page < data.result.total}<a
          class="button button-secondary"
          href={resolve(href({ page: data.result.page + 1 }))}>Next</a
        >{/if}
    </nav>{/if}
</main>
