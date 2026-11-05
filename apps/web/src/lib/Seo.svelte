<script lang="ts">
  import { page } from '$app/state';
  let {
    title,
    description,
    image,
    structured
  }: {
    title: string;
    description: string;
    image?: string | null;
    structured?: Record<string, unknown>;
  } = $props();
  const canonical = $derived(
    'https://www.voidreg.xyz' +
      page.url.pathname +
      (page.url.searchParams.has('page') ? '?page=' + page.url.searchParams.get('page') : '')
  );
  const json = $derived(
    structured ? JSON.stringify(structured).replaceAll('<', String.fromCharCode(92) + 'u003c') : ''
  );
  const jsonLdMarkup = $derived('<script type="application/ld+json">' + json + '<' + '/script>');
</script>

<svelte:head>
  <title>{title}</title><meta name="description" content={description} />
  <link rel="canonical" href={canonical} />
  <meta property="og:title" content={title} /><meta
    property="og:description"
    content={description}
  />
  <meta property="og:url" content={canonical} /><meta
    property="og:type"
    content={structured?.['@type'] === 'BlogPosting' ? 'article' : 'website'}
  />
  <meta name="twitter:card" content={image ? 'summary_large_image' : 'summary'} />
  {#if image}<meta
      property="og:image"
      content={new URL(image, 'https://www.voidreg.xyz').href}
    />{/if}
  {#if json}
    <!-- JSON is serialized and escapes every less-than character, including script terminators. -->
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html jsonLdMarkup}
  {/if}
</svelte:head>
