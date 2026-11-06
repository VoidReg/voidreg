<script lang="ts">
  // Compact filter bar: search, project, topic and tag. Works as a plain GET form without
  // JavaScript; with it, the project and tag lists ask the server for matches while typing, so
  // the page never renders a catalogue-sized list of options.
  import { resolve } from '$app/paths';
  import { filterChips, type PostFilters } from '$lib/filters';

  type Seed = { value: string; hint: string };
  let {
    filters,
    projectTitle = '',
    topics = [],
    seeds,
    total
  }: {
    filters: PostFilters;
    projectTitle?: string;
    topics?: { slug: string; title: string; count: number }[];
    seeds: { projects: Seed[]; tags: Seed[] };
    total: number;
  } = $props();

  const uid = $props.id();
  // Typed results replace the server rendered seeds; until then the seeds are the options.
  let typed = $state<{ projects?: Seed[]; tags?: Seed[] }>({});
  const projectOptions = $derived(typed.projects ?? seeds.projects);
  const tagOptions = $derived(typed.tags ?? seeds.tags);
  const topicTitle = $derived(
    filters.topic === 'none'
      ? 'Other posts'
      : (topics.find((t) => t.slug === filters.topic)?.title ?? '')
  );
  const chips = $derived(
    filterChips('/blog', filters, {
      project: projectTitle || undefined,
      topic: topicTitle || undefined
    })
  );
  let form = $state<HTMLFormElement>();
  const timers: Record<string, ReturnType<typeof setTimeout>> = {};
  let latest = 0;

  function suggest(kind: 'projects' | 'tags', text: string) {
    clearTimeout(timers[kind]);
    timers[kind] = setTimeout(async () => {
      const mine = ++latest;
      try {
        const response = await fetch(
          resolve('/blog/suggest/[kind]', { kind }) + '?q=' + encodeURIComponent(text.trim())
        );
        if (!response.ok || mine !== latest) return;
        typed = { ...typed, [kind]: await response.json() };
      } catch {
        // The seeded options and plain typing keep working.
      }
    }, 200);
  }
</script>

<form
  bind:this={form}
  class="post-filters"
  method="get"
  action={resolve('/blog')}
  role="search"
  aria-label="Filter posts"
>
  <label class="post-field wide"
    >Search<input
      type="search"
      name="q"
      value={filters.q}
      placeholder="Title or summary"
      maxlength="100"
    /></label
  >
  <label class="post-field"
    >Project<input
      name="project"
      value={projectTitle || filters.project}
      list={`${uid}-projects`}
      placeholder="Any project"
      maxlength="120"
      autocomplete="off"
      oninput={(event) => suggest('projects', event.currentTarget.value)}
    /><datalist id={`${uid}-projects`}
      >{#each projectOptions as option (option.value)}<option
          value={option.value}
          label={option.hint}
        ></option>{/each}</datalist
    ></label
  >
  {#if topics.length}
    <label class="post-field"
      >Topic<select name="topic" onchange={() => form?.requestSubmit()}
        ><option value="">All topics</option><option
          value="none"
          selected={filters.topic === 'none'}>Other posts</option
        >{#each topics as topic (topic.slug)}<option
            value={topic.slug}
            selected={filters.topic === topic.slug}>{topic.title} ({topic.count})</option
          >{/each}</select
      ></label
    >
  {/if}
  <label class="post-field"
    >Tag<input
      name="tag"
      value={filters.tag}
      list={`${uid}-tags`}
      placeholder="Any tag"
      maxlength="40"
      autocomplete="off"
      oninput={(event) => suggest('tags', event.currentTarget.value)}
    /><datalist id={`${uid}-tags`}
      >{#each tagOptions as option (option.value)}<option value={option.value} label={option.hint}
        ></option>{/each}</datalist
    ></label
  >
  <button type="submit" class="button button-secondary post-apply">Apply</button>
</form>

{#if chips.length}
  <div class="post-active">
    <ul class="chip-row" aria-label="Active filters">
      {#each chips as chip (chip.key)}<li>
          <a class="chip" href={resolve(chip.href as '/blog')}
            >{chip.label}: {chip.value}<span aria-hidden="true">&times;</span><span class="sr-only"
              >, remove filter</span
            ></a
          >
        </li>{/each}
    </ul>
    <p class="filter-status" role="status">
      {total}
      {total === 1 ? 'post matches' : 'posts match'}.
      <a class="text-link" href={resolve('/blog')}>Clear all</a>
    </p>
  </div>
{/if}

<style>
  .post-filters {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
    align-items: end;
    gap: 0.75rem 1rem;
  }
  .post-field {
    display: grid;
    gap: 0.25rem;
    min-width: 0;
    color: var(--muted-foreground);
    font-size: 0.8125rem;
  }
  .post-field.wide {
    grid-column: 1 / -1;
  }
  .post-field :where(input, select) {
    min-height: 2.75rem;
    min-width: 0;
    border: 1px solid var(--input);
    border-radius: var(--radius);
    background: var(--background);
    padding: 0.5rem 0.75rem;
    color: var(--foreground);
    font: inherit;
    font-size: 0.9375rem;
  }
  .post-apply {
    min-height: 2.75rem;
  }
  .post-active {
    display: grid;
    gap: 0.75rem;
  }
  @media (min-width: 48rem) {
    .post-field.wide {
      grid-column: span 2;
    }
  }
</style>
