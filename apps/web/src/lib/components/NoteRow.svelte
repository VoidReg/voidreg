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
    topic = null,
    tags = [],
    heading = 'h3'
  }: {
    slug: string;
    title: string;
    summary: string;
    category: string;
    publishedAt?: string | null;
    readingTime?: number | null;
    projects?: { slug: string; title: string }[];
    topic?: { slug: string; title: string; project_slug: string } | null;
    tags?: string[];
    heading?: 'h2' | 'h3' | 'h4';
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
    {#if projects.length || topic}<ul
        class="chip-row note-projects"
        aria-label="Projects and topic this post belongs to"
      >
        {#if topic}<li>
            <a
              class="chip"
              href={resolve('/projects/[slug]/topics/[topic]', {
                slug: topic.project_slug,
                topic: topic.slug
              })}>Topic: {topic.title}</a
            >
          </li>{/if}
        {#each projects as project (project.slug)}<li>
            <a class="chip" href={resolve('/projects/[slug]', { slug: project.slug })}
              >{project.title}</a
            >
          </li>{/each}
      </ul>{/if}
    {#if tags.length}<ul class="chip-row note-tags" aria-label="Tags">
        {#each tags as tag (tag)}<li>
            <a class="chip" href={resolve(`/blog?tag=${encodeURIComponent(tag)}` as '/blog')}
              >{tag}</a
            >
          </li>{/each}
      </ul>{/if}
  </div>
  <span class="note-arrow"><Icon name="arrow-right" size={20} /></span>
</article>
