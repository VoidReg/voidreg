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
    heading = 'h3'
  }: {
    slug: string;
    title: string;
    summary: string;
    category: string;
    publishedAt?: string | null;
    readingTime?: number | null;
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
  </div>
  <span class="note-arrow"><Icon name="arrow-right" size={20} /></span>
</article>
