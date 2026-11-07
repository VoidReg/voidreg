<script lang="ts">
  import { page } from '$app/state';
  import { DEFAULT_IMAGE, DEFAULT_IMAGE_ALT, SITE, absolute } from '$lib/seo';
  let {
    title,
    description,
    image,
    imageAlt,
    structured,
    type = 'website',
    published,
    modified,
    tags = [],
    markdown,
    noindex = false
  }: {
    title: string;
    description: string;
    image?: string | null;
    imageAlt?: string;
    structured?: Record<string, unknown>;
    type?: 'website' | 'article';
    published?: string | null;
    modified?: string | null;
    tags?: string[];
    /** Path of the clean Markdown twin of this page, advertised to crawlers and LLMs. */
    markdown?: string;
    /** Filtered and search variants stay reachable but out of the index. */
    noindex?: boolean;
  } = $props();
  const canonical = $derived(
    SITE +
      page.url.pathname +
      (page.url.searchParams.has('page') ? '?page=' + page.url.searchParams.get('page') : '')
  );
  const picture = $derived(absolute(image || DEFAULT_IMAGE));
  const pictureAlt = $derived(image ? (imageAlt ?? title) : DEFAULT_IMAGE_ALT);
  const robots = $derived(
    noindex
      ? 'noindex,follow'
      : 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1'
  );
  const json = $derived(
    structured ? JSON.stringify(structured).replaceAll('<', String.fromCharCode(92) + 'u003c') : ''
  );
  const jsonLdMarkup = $derived('<script type="application/ld+json">' + json + '<' + '/script>');
</script>

<svelte:head>
  <title>{title}</title><meta name="description" content={description} />
  <meta name="robots" content={robots} />
  <link rel="canonical" href={canonical} />
  {#if markdown}<link rel="alternate" type="text/markdown" href={absolute(markdown)} />{/if}
  <meta property="og:title" content={title} /><meta
    property="og:description"
    content={description}
  />
  <meta property="og:url" content={canonical} /><meta property="og:type" content={type} />
  <meta property="og:image" content={picture} /><meta
    property="og:image:alt"
    content={pictureAlt}
  />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={title} /><meta
    name="twitter:description"
    content={description}
  />
  <meta name="twitter:image" content={picture} /><meta
    name="twitter:image:alt"
    content={pictureAlt}
  />
  {#if type === 'article'}
    {#if published}<meta property="article:published_time" content={published} />{/if}
    {#if modified || published}<meta
        property="article:modified_time"
        content={modified || published}
      />{/if}
    {#each tags as tag (tag)}<meta property="article:tag" content={tag} />{/each}
  {/if}
  {#if json}
    <!-- JSON is serialized and escapes every less-than character, including script terminators. -->
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html jsonLdMarkup}
  {/if}
</svelte:head>
