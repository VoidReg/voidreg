<script lang="ts">
  import PreviewNotice from '$lib/views/PreviewNotice.svelte';
  import PostDetail from '$lib/views/PostDetail.svelte';
  let { data } = $props();
</script>

<svelte:head><title>Preview: {data.preview.title}</title></svelte:head>

{#if data.result.state === 'ready' && data.article && data.projects}
  <PostDetail
    article={data.article}
    projects={data.projects}
    newer={data.newer}
    older={data.older}
    topic={data.topic}
    live={false}
  />
{:else if data.result.state === 'failed'}
  <PreviewNotice state="failed" diagnostics={data.result.diagnostics} />
{:else}
  <PreviewNotice state="pending" />
{/if}
