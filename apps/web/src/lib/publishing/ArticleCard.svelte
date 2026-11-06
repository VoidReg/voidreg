<script lang="ts">
  import NoteRow from '$lib/components/NoteRow.svelte';
  import type { Article } from '@voidreg/publishing-ui/api';
  let {
    article,
    heading = 'h2',
    hideTopic = false
  }: { article: Article; heading?: 'h2' | 'h3' | 'h4'; hideTopic?: boolean } = $props();
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
  topic={hideTopic ? null : article.topic}
  tags={article.tags ?? []}
/>
