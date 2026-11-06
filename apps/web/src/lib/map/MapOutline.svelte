<script lang="ts">
  import { resolve } from '$app/paths';
  import { outlineOf, type Graph } from './layout';

  let { graph, preview = false }: { graph: Graph; preview?: boolean } = $props();
  const outline = $derived(outlineOf(graph));
  const projectHref = (slug: string) =>
    preview ? resolve('/preview/projects/[slug]', { slug }) : resolve('/projects/[slug]', { slug });
  const postHref = (slug: string) =>
    preview ? resolve('/preview/blog/[slug]', { slug }) : resolve('/blog/[slug]', { slug });
  const status = (node: { draft: boolean; changed: boolean }) =>
    node.draft ? ' (draft)' : node.changed ? ' (edited)' : '';
</script>

<ul class="text-tree">
  {#each outline.projects as entry (entry.node.id)}
    <li class="text-project" id={`text-${entry.node.slug}`}>
      <a class="text-link" href={projectHref(entry.node.slug)}
        >{entry.node.title}{status(entry.node)}</a
      >
      <span class="text-meta">{entry.node.category}</span>
      {#if entry.posts.length}<ul aria-label={`Posts following ${entry.node.title}`}>
          {#each entry.posts as post (post.id)}<li>
              <a href={postHref(post.slug)}>{post.title}{status(post)}</a>
            </li>{/each}
        </ul>{/if}
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
  {#if outline.standalone.length}<li class="text-project">
      <span class="text-title">Standalone notes</span>
      <ul aria-label="Posts that do not follow a project">
        {#each outline.standalone as post (post.id)}<li>
            <a href={postHref(post.slug)}>{post.title}{status(post)}</a>
          </li>{/each}
      </ul>
    </li>{/if}
</ul>

<style>
  .text-tree,
  .text-tree ul {
    display: grid;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .text-tree {
    gap: 1.5rem;
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

  .text-title {
    font-weight: 500;
  }

  .text-meta {
    color: var(--muted-foreground);
    font-family: var(--font-code);
    font-size: 0.75rem;
    line-height: 1.5;
  }

  .text-tree a:not(.text-link) {
    color: var(--link);
    text-underline-offset: 0.2em;
  }
</style>
