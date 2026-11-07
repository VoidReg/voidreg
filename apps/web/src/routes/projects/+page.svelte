<script lang="ts">
  import Breadcrumb from '$lib/components/Breadcrumb.svelte';
  import copy from '$lib/content/portfolio-copy.json';
  import EmptyContent from '$lib/components/EmptyContent.svelte';
  import { resolve } from '$app/paths';
  import ProjectCard from '$lib/components/ProjectCard.svelte';
  import Pagination from '$lib/components/Pagination.svelte';
  import Seo from '$lib/Seo.svelte';
  import { capChips } from '$lib/filters';
  let { data } = $props();
  const CAP = 8;
  const href = (next: { tag?: string; category?: string; q?: string; page?: number }) => {
    const tag = next.tag ?? data.tag;
    const category = next.category ?? data.category;
    const q = next.q ?? data.q;
    const params = [];
    if (q) params.push('q=' + encodeURIComponent(q));
    if (category) params.push('category=' + encodeURIComponent(category));
    if (tag) params.push('tag=' + encodeURIComponent(tag));
    if (next.page && next.page > 1) params.push('page=' + next.page);
    return (params.length ? `/projects?${params.join('&')}` : '/projects') as '/projects';
  };
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const categories = $derived(capChips(data.categories, CAP, (c) => same(c, data.category)));
  const tags = $derived(capChips(data.tags, CAP, (t) => same(t, data.tag)));
</script>

<Seo title="Projects | Voidreg" description={copy.projectsIntro} />
<main id="main-content" class="site-container page-shell">
  <Breadcrumb items={[{ label: 'Home', href: resolve('/') }, { label: 'Projects' }]} />
  <header class="section-stack">
    <p class="eyebrow">Projects</p>
    <h1 class="display-heading">Projects across layers</h1>
    <p class="lead">{copy.projectsIntro}</p>
  </header>
  <form
    class="project-search"
    method="get"
    action={resolve('/projects')}
    role="search"
    aria-label="Search projects"
  >
    <label class="project-field"
      >Search projects<input
        type="search"
        name="q"
        value={data.q}
        placeholder="Title, summary or technology"
        maxlength="100"
      /></label
    >
    {#if data.category}<input type="hidden" name="category" value={data.category} />{/if}
    {#if data.tag}<input type="hidden" name="tag" value={data.tag} />{/if}
    <button type="submit" class="button button-secondary">Search</button>
  </form>
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
            {#each categories.shown as category (category)}<li>
                <a
                  class="chip"
                  href={resolve(href({ category }))}
                  aria-current={same(data.category, category) ? 'true' : undefined}>{category}</a
                >
              </li>{/each}
          </ul>
          {#if categories.rest.length}<details class="chip-more">
              <summary>Show {categories.rest.length} more categories</summary>
              <ul class="chip-row">
                {#each categories.rest as category (category)}<li>
                    <a class="chip" href={resolve(href({ category }))}>{category}</a>
                  </li>{/each}
              </ul>
            </details>{/if}
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
            {#each tags.shown as tag (tag)}<li>
                <a
                  class="chip"
                  href={resolve(href({ tag }))}
                  aria-current={same(data.tag, tag) ? 'true' : undefined}>{tag}</a
                >
              </li>{/each}
          </ul>
          {#if tags.rest.length}<details class="chip-more">
              <summary>Show {tags.rest.length} more technologies</summary>
              <ul class="chip-row">
                {#each tags.rest as tag (tag)}<li>
                    <a class="chip" href={resolve(href({ tag }))}>{tag}</a>
                  </li>{/each}
              </ul>
            </details>{/if}
        </nav>{/if}
    </div>{/if}
  {#if data.tag || data.category || data.q}<p class="filter-status" role="status">
      {data.result.total}
      {data.result.total === 1 ? 'project matches' : 'projects match'} these filters.
      <a class="text-link" href={resolve('/projects')}>Clear filters</a>
    </p>{/if}
  <section class="card-grid" aria-label="Projects" data-paged-list tabindex="-1">
    {#each data.result.items as project (project.slug)}<ProjectCard
        {project}
        heading="h2"
      />{:else}<EmptyContent kind="projects" heading="h2" />{/each}
  </section>
  <Pagination
    page={data.result.page}
    total={data.result.total}
    perPage={data.result.per_page}
    href={(n) => href({ page: n })}
    label="Project pages"
  />
</main>

<style>
  .project-search {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0.75rem 1rem;
  }
  .project-field {
    display: grid;
    flex: 1 1 16rem;
    gap: 0.25rem;
    color: var(--muted-foreground);
    font-size: 0.8125rem;
  }
  .project-field input {
    min-height: 2.75rem;
    border: 1px solid var(--input);
    border-radius: var(--radius);
    background: var(--background);
    padding: 0.5rem 0.75rem;
    color: var(--foreground);
    font: inherit;
    font-size: 0.9375rem;
  }
  .chip-more {
    margin-top: 0.5rem;
  }
  .chip-more summary {
    min-height: 2.75rem;
    display: flex;
    align-items: center;
    color: var(--muted-foreground);
    font-size: 0.875rem;
    cursor: pointer;
  }
  .chip-more[open] summary {
    margin-bottom: 0.25rem;
  }
</style>
