<script lang="ts">
  import NoteRow from '$lib/components/NoteRow.svelte';
  import type { Article } from '@voidreg/publishing-ui/api';
  let { article, heading = 'h2' }: { article: Article; heading?: 'h2' | 'h3' } = $props();
</script>

<NoteRow
  {heading}
  slug={article.slug}
  title={article.title}
  summary={article.summary}
  category={article.category}
  publishedAt={article.published_at}
  readingTime={article.reading_time_minutes}
  projects={article.projects}
  tags={article.tags ?? []}
/>
