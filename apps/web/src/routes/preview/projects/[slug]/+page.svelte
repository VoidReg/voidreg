<script lang="ts">
  import PreviewNotice from '$lib/views/PreviewNotice.svelte';
  import ProjectDetail from '$lib/views/ProjectDetail.svelte';
  let { data } = $props();
</script>

<svelte:head><title>Preview: {data.preview.title}</title></svelte:head>

{#if data.result.state === 'ready' && data.project && data.posts}
  <ProjectDetail project={data.project} posts={data.posts} />
{:else if data.result.state === 'failed'}
  <PreviewNotice state="failed" diagnostics={data.result.diagnostics} />
{:else}
  <PreviewNotice state="pending" />
{/if}
