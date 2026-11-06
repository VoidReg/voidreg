<script lang="ts">
  import { resolve } from '$app/paths';
  import { outlineOf, type MapFilter, type MapModel } from './layout';

  let {
    model,
    filter,
    preview = false
  }: { model: MapModel; filter: MapFilter; preview?: boolean } = $props();
  const PAGE = 40;
  const groups = $derived(outlineOf(model, filter));
  let counts = $state<Record<string, number>>({});
  const limit = (name: string) => counts[name] ?? PAGE;
  const projectHref = (slug: string) =>
    preview ? resolve('/preview/projects/[slug]', { slug }) : resolve('/projects/[slug]', { slug });
  const postHref = (slug: string) =>
    preview ? resolve('/preview/blog/[slug]', { slug }) : resolve('/blog/[slug]', { slug });
  const postsHref = (slug: string) =>
    resolve(`/blog?project=${encodeURIComponent(slug)}` as '/blog');
  const status = (node: { draft: boolean; changed: boolean }) =>
    node.draft ? ' (draft)' : node.changed ? ' (edited)' : '';
  const total = $derived(groups.reduce((sum, g) => sum + g.projects.length, 0));
</script>

{#each groups as group, index (group.name)}
  <details class="text-group" open={index === 0 || total <= PAGE}>
    <summary>{group.name} <span class="text-meta">{group.projects.length}</span></summary>
    <ul class="text-tree">
      {#each group.projects.slice(0, limit(group.name)) as entry (entry.node.id)}
        <li class="text-project" id={`text-${entry.node.slug}`}>
          <a class="text-link" href={projectHref(entry.node.slug)}
            >{entry.node.title}{status(entry.node)}</a
          >
          {#if entry.posts.length}<ul aria-label={`Posts following ${entry.node.title}`}>
              {#each entry.posts as post (post.id)}<li>
                  <a href={postHref(post.slug)}>{post.title}{status(post)}</a>
                </li>{/each}
            </ul>
            {#if entry.postsTotal > entry.posts.length && !preview}<p class="text-meta">
                <a href={postsHref(entry.node.slug)}
                  >All {entry.postsTotal} posts following {entry.node.title}</a
                >
              </p>{/if}
          {:else if entry.postsTotal && !preview}<p class="text-meta">
              <a href={postsHref(entry.node.slug)}
                >{entry.postsTotal} {entry.postsTotal === 1 ? 'post' : 'posts'}</a
              >
            </p>{/if}
          {#if entry.related.length}<p class="text-meta">
              Related:
              {#each entry.related as other, i (other.id)}<a href={projectHref(other.slug)}
                  >{other.title}</a
                >{i < entry.related.length - 1 ? ', ' : ''}{/each}
            </p>{/if}
          {#if entry.shared.length}<p class="text-meta">
              Shares technologies with:
              {#each entry.shared as other, i (other.id)}<a href={projectHref(other.slug)}
                  >{other.title}</a
                >{i < entry.shared.length - 1 ? ', ' : ''}{/each}
            </p>{/if}
        </li>
      {/each}
    </ul>
    {#if group.projects.length > limit(group.name)}
      <button
        type="button"
        class="text-more"
        onclick={() => (counts[group.name] = limit(group.name) + PAGE)}
        >Show {Math.min(PAGE, group.projects.length - limit(group.name))} more ({group.projects
          .length - limit(group.name)} left)</button
      >
    {/if}
  </details>
{:else}
  <p class="text-meta">No projects match these filters.</p>
{/each}

<style>
  .text-group {
    display: grid;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .text-group > summary {
    cursor: pointer;
    font-weight: 500;
    padding-block: 0.5rem;
  }

  .text-tree,
  .text-tree ul {
    display: grid;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .text-tree {
    gap: 1.25rem;
    margin-top: 0.75rem;
  }

  .text-project {
    display: grid;
    gap: 0.5rem;
    justify-items: start;
    border-inline-start: 2px solid var(--primary);
    padding-inline-start: 1rem;
  }

  .text-project > ul {
    padding-inline-start: 1rem;
  }

  .text-meta {
    color: var(--muted-foreground);
    font-family: var(--font-code);
    font-size: 0.75rem;
    line-height: 1.5;
  }

  .text-more {
    justify-self: start;
    margin-top: 0.75rem;
    border: 1px solid var(--input);
    background: var(--background);
    padding: 0.5rem 1rem;
    min-height: 2.75rem;
    font-size: 0.875rem;
    cursor: pointer;
  }

  .text-tree a:not(.text-link) {
    color: var(--link);
    text-underline-offset: 0.2em;
  }
</style>
