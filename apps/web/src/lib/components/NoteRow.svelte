<script lang="ts">
  import { resolve } from '$app/paths';
  import Icon from './Icon.svelte';

  let {
    slug,
    title,
    summary,
    category,
    publishedAt,
    readingTime,
    projects = [],
    heading = 'h3'
  }: {
    slug: string;
    title: string;
    summary: string;
    category: string;
    publishedAt?: string | null;
    readingTime?: number | null;
    projects?: { slug: string; title: string }[];
    heading?: 'h2' | 'h3';
  } = $props();
</script>

<article class="note-row">
  <div class="note-meta">
    <span class="eyebrow">{category}</span>
    {#if publishedAt}<time datetime={publishedAt}
        >{new Date(publishedAt).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        })}</time
      >{/if}
    {#if readingTime}<span>{readingTime} min read</span>{/if}
  </div>
  <div class="note-main">
    <svelte:element this={heading}
      ><a class="note-title-link" href={resolve('/blog/[slug]', { slug })}>{title}</a
      ></svelte:element
    >
    <p>{summary}</p>
    {#if projects.length}<ul class="chip-row note-projects" aria-label="Projects this post follows">
        {#each projects as project (project.slug)}<li>
            <a class="chip" href={resolve('/projects/[slug]', { slug: project.slug })}
              >{project.title}</a
            >
          </li>{/each}
      </ul>{/if}
  </div>
  <span class="note-arrow"><Icon name="arrow-right" size={20} /></span>
</article>
