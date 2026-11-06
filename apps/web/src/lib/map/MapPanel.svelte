<script lang="ts">
  import { resolve } from '$app/paths';
  import { PLATE_POSTS } from './board';
  import { categoryOf, type GraphNode, type MapModel } from './layout';

  let {
    project,
    model,
    loading = false,
    failed = false,
    preview = false,
    onclose,
    onfocus
  }: {
    project: GraphNode;
    model: MapModel;
    loading?: boolean;
    failed?: boolean;
    preview?: boolean;
    onclose: () => void;
    onfocus: (id: string) => void;
  } = $props();

  const byId = $derived(new Map(model.projects.map((p) => [p.id, p])));
  const links = $derived.by(() => {
    const related: GraphNode[] = [];
    const shared: GraphNode[] = [];
    for (const e of model.edges) {
      const other = e.source === project.id ? e.target : e.target === project.id ? e.source : '';
      const node = other ? byId.get(other) : undefined;
      if (node) (e.kind === 'related' ? related : shared).push(node);
    }
    const sort = (list: GraphNode[]) => list.sort((a, b) => a.title.localeCompare(b.title));
    const relatedIds = new Set(related.map((n) => n.id));
    return { related: sort(related), shared: sort(shared.filter((n) => !relatedIds.has(n.id))) };
  });
  const posts = $derived(model.postsOf.get(project.id));
  const postCount = $derived(posts?.total ?? project.post_count ?? 0);
  const href = $derived(
    preview
      ? resolve('/preview/projects/[slug]', { slug: project.slug })
      : resolve('/projects/[slug]', { slug: project.slug })
  );
  const postHref = (slug: string) =>
    preview ? resolve('/preview/blog/[slug]', { slug }) : resolve('/blog/[slug]', { slug });
  const moreHref = $derived(
    preview ? href : resolve(`/blog?project=${encodeURIComponent(project.slug)}` as '/blog')
  );
</script>

<aside class="panel" aria-label="Selected project">
  <header>
    <p class="silk">{categoryOf(project)}</p>
    <button type="button" class="close" onclick={onclose} aria-label="Clear the selected project">
      Clear
    </button>
  </header>
  <h2>{project.title}</h2>
  {#if project.draft || project.changed}
    <p class="state">{project.draft ? 'Draft' : 'Edited'}</p>
  {/if}
  {#if project.tags.length}
    <ul class="tags" aria-label="Technologies">
      {#each project.tags as tag (tag)}<li>{tag}</li>{/each}
    </ul>
  {/if}
  <a class="open-link" {href}>Open project</a>

  <section aria-label="Posts">
    <h3>Posts <span>{postCount}</span></h3>
    {#if posts && posts.items.length}
      <ul class="rows">
        {#each posts.items.slice(0, PLATE_POSTS) as post (post.id)}
          <li><a href={postHref(post.slug)}>{post.title}</a></li>
        {/each}
      </ul>
      {#if posts.total > PLATE_POSTS}
        <a class="more" href={moreHref}>{posts.total - PLATE_POSTS} more</a>
      {/if}
    {:else if loading}
      <p class="muted" role="status">Loading posts and links.</p>
    {:else if failed}
      <p class="muted">Posts could not be loaded.</p>
    {:else}
      <p class="muted">No posts follow this project yet.</p>
    {/if}
  </section>

  {#if links.related.length}
    <section aria-label="Related projects">
      <h3>Related <span>{links.related.length}</span></h3>
      <ul class="rows">
        {#each links.related as node (node.id)}
          <li><button type="button" onclick={() => onfocus(node.id)}>{node.title}</button></li>
        {/each}
      </ul>
    </section>
  {/if}
  {#if links.shared.length}
    <section aria-label="Shared technologies">
      <h3>Shares technology <span>{links.shared.length}</span></h3>
      <ul class="rows">
        {#each links.shared as node (node.id)}
          <li><button type="button" onclick={() => onfocus(node.id)}>{node.title}</button></li>
        {/each}
      </ul>
    </section>
  {/if}
</aside>

<style>
  .panel {
    position: absolute;
    top: 1px;
    right: 1px;
    bottom: 1px;
    z-index: 4;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: min(21rem, calc(100% - 2px));
    overflow-y: auto;
    border-left: 1px solid var(--foreground);
    background: var(--background);
    padding: 1rem 1.25rem 1.25rem;
    overscroll-behavior: contain;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .silk,
  h3,
  .more,
  .state {
    margin: 0;
    font-family: var(--font-code);
    font-size: 0.6875rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .silk {
    color: var(--primary);
  }

  .state {
    align-self: flex-start;
    border: 1px dashed var(--foreground);
    padding: 0.125rem 0.5rem;
  }

  h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    line-height: 1.25;
  }

  h3 {
    display: flex;
    justify-content: space-between;
    margin: 0 0 0.5rem;
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.375rem;
    color: var(--muted-foreground);
  }

  h3 span {
    color: var(--foreground);
  }

  .close {
    border: 1px solid var(--foreground);
    background: transparent;
    padding: 0.375rem 0.75rem;
    min-height: 2.75rem;
    color: var(--foreground);
    font-family: var(--font-code);
    font-size: 0.6875rem;
    text-transform: uppercase;
    cursor: pointer;
  }

  .close:hover {
    background: var(--foreground);
    color: var(--background);
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tags li {
    border: 1px solid var(--border);
    padding: 0.125rem 0.5rem;
    font-family: var(--font-code);
    font-size: 0.6875rem;
  }

  .open-link {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    border: 1px solid var(--foreground);
    background: var(--foreground);
    padding: 0.5rem 1rem;
    min-height: 2.75rem;
    color: var(--background);
    font-size: 0.875rem;
    text-decoration: none;
  }

  .open-link:hover {
    background: transparent;
    color: var(--foreground);
  }

  .rows {
    display: grid;
    gap: 0.125rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .rows a,
  .rows button {
    display: block;
    border: 0;
    background: transparent;
    padding: 0.375rem 0;
    width: 100%;
    color: var(--foreground);
    font: inherit;
    font-size: 0.875rem;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
  }

  .rows a:hover,
  .rows button:hover {
    color: var(--primary);
    text-decoration: underline;
  }

  .more {
    display: inline-block;
    margin-top: 0.25rem;
    color: var(--muted-foreground);
  }

  .muted {
    margin: 0;
    color: var(--muted-foreground);
    font-size: 0.875rem;
  }

  @media (max-width: 47.99rem) {
    .panel {
      top: auto;
      left: 1px;
      width: auto;
      height: 46%;
      border-top: 1px solid var(--foreground);
      border-left: 0;
    }
  }
</style>
