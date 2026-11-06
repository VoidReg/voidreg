<script lang="ts">
  import { onMount } from 'svelte';
  import { adminRequest } from './api';
  import type { Article, ContentMeta, Page, Topic } from '@voidreg/publishing-ui/api';
  import TopicManager from './TopicManager.svelte';
  import ChipPicker from './components/ChipPicker.svelte';
  import { normalizeTag, type Option } from './pickers';
  let {
    meta = $bindable(),
    tags = $bindable(),
    repo = $bindable(),
    kind,
    selfId = '',
    onchange
  }: {
    meta: ContentMeta;
    tags: string[];
    repo: string;
    kind: string;
    selfId?: string;
    onchange: () => void;
  } = $props();
  let media = $state<{ id: string; url: string; name: string; alt: string }[]>([]);
  let error = $state('');
  onMount(() => {
    void adminRequest<{ items: typeof media }>('/media')
      .then((v) => (media = v.items))
      .catch(() => (error = 'Media could not be loaded. Open Media to retry.'));
  });
  async function searchTags(query: string): Promise<Option[]> {
    const found = await adminRequest<{
      items: { name: string; count_projects: number; count_posts: number }[];
    }>(`/tags?limit=20&q=${encodeURIComponent(query)}`);
    return found.items.map((tag) => ({
      value: tag.name,
      label: tag.name,
      hint: `${tag.count_projects} projects, ${tag.count_posts} posts`
    }));
  }
  // Projects are found by server search, never loaded as a whole catalogue, so this stays
  // fast with thousands of projects. Titles of already linked ids are resolved in one request.
  let titles = $state<Record<string, string>>({});
  const titleOf = (project: Article) => project.title + (project.archived ? ' (Archived)' : '');
  function remember(items: Article[]) {
    const next = { ...titles };
    for (const project of items) if (project.id) next[project.id] = titleOf(project);
    titles = next;
  }
  async function searchProjects(query: string, exclude = ''): Promise<Option[]> {
    const found = await adminRequest<Page<Article>>(
      `/projects?per_page=20&sort=title&q=${encodeURIComponent(query)}`
    );
    remember(found.items);
    return found.items
      .filter((project) => project.id && project.id !== exclude)
      .map((project) => ({
        value: project.id ?? '',
        label: titleOf(project),
        hint: project.category || undefined
      }));
  }
  $effect(() => {
    const missing = [...(meta.project_ids ?? []), ...(meta.related_project_ids ?? [])].filter(
      (id) => !(id in titles)
    );
    if (!missing.length) return;
    void adminRequest<Page<Article>>(
      `/projects?per_page=100&ids=${missing.slice(0, 100).map(encodeURIComponent).join(',')}`
    )
      .then((found) => remember(found.items))
      .catch(() => undefined);
  });
  const projectLabel = (id: string) => titles[id] ?? 'Unknown project';

  // Topics offered to a post come only from its linked projects, a bounded set per project.
  const TOPIC_PROJECTS = 6;
  let topicsByProject = $state<Record<string, Topic[]>>({});
  let topicsFailed = $state(false);
  const linkedIds = $derived((meta.project_ids ?? []).slice(0, TOPIC_PROJECTS));
  $effect(() => {
    if (kind === 'projects') return;
    const missing = linkedIds.filter((id) => !(id in topicsByProject));
    if (!missing.length) return;
    for (const id of missing) {
      void adminRequest<Page<Topic>>(`/topics?project_id=${encodeURIComponent(id)}&per_page=100`)
        .then((found) => {
          topicsByProject = { ...topicsByProject, [id]: found.items };
          topicsFailed = false;
        })
        .catch(() => (topicsFailed = true));
    }
  });
  const topicGroups = $derived(
    linkedIds
      .map((id) => ({ id, title: projectLabel(id), topics: topicsByProject[id] ?? [] }))
      .filter((group) => group.topics.length)
  );
  // A topic only makes sense while its project stays linked, so removing the project clears it.
  $effect(() => {
    const current = meta.topic_id;
    if (!current || kind === 'projects') return;
    const ids = meta.project_ids ?? [];
    const owner = Object.entries(topicsByProject).find(([, list]) =>
      list.some((topic) => topic.id === current)
    );
    if (owner && !ids.includes(owner[0])) {
      meta.topic_id = null;
      onchange();
    }
  });
</script>

<section class="inspector-section" oninput={onchange}>
  {#snippet tagField()}
    <ChipPicker
      bind:values={tags}
      label={kind === 'projects' ? 'Technologies and tags' : 'Tags'}
      help="Press Enter or comma to add a tag. Tags are shared by projects and posts, and projects with common tags are linked on the map."
      placeholder="Add a tag"
      search={searchTags}
      createValue={normalizeTag}
      max={20}
      {onchange}
    />
  {/snippet}
  {#if kind === 'projects'}
    <h2 class="sidebar-heading">Project details</h2>
    {@render tagField()}
    <label class="editor-field">Repository URL<input type="url" bind:value={repo} /></label>
    <label class="editor-field">Demo URL<input type="url" bind:value={meta.demo_url} /></label>
    <ChipPicker
      bind:values={
        () => meta.related_project_ids ?? [], (value) => (meta.related_project_ids = value)
      }
      label="Related projects"
      help="Related projects link both ways on the site and the map. Search by title."
      placeholder="Search projects"
      search={(query) => searchProjects(query, selfId)}
      labelOf={projectLabel}
      {onchange}
    />
  {:else}
    {@render tagField()}
    <ChipPicker
      bind:values={() => meta.project_ids ?? [], (value) => (meta.project_ids = value)}
      label="Linked projects"
      help="Published posts appear on each selected project. Search by title."
      placeholder="Search projects"
      search={(query) => searchProjects(query)}
      labelOf={projectLabel}
      {onchange}
    />
    {#if topicGroups.length}
      <label class="editor-field"
        >Topic<select
          bind:value={() => meta.topic_id ?? '', (value) => (meta.topic_id = value || null)}
          ><option value="">No topic (Other posts)</option
          >{#each topicGroups as group (group.id)}<optgroup label={group.title}
              >{#each group.topics as topic (topic.id)}<option value={topic.id}
                  >{topic.title}</option
                >{/each}</optgroup
            >{/each}</select
        ></label
      >
      <p class="editor-help">
        Groups this post inside a linked project. Manage topics in the project editor.
      </p>
    {:else if topicsFailed}
      <p class="editor-help" role="status">Topics could not be loaded for the linked projects.</p>
    {/if}
  {/if}
  <label class="editor-field"
    >Cover image<select bind:value={meta.hero_image}
      ><option value="">No cover image</option>{#each media as image (image.id)}<option
          value={image.url}>{image.name}</option
        >{/each}</select
    ></label
  >
  {#if error}<p role="status">{error}</p>{/if}
  <details class="inspector-details">
    <summary>Search and sharing</summary>
    <label class="editor-field">SEO title<input bind:value={meta.seo_title} /></label>
    <p class="editor-help">Leave blank to use the content title.</p>
    <label class="editor-field"
      >SEO description<textarea rows="3" bind:value={meta.seo_description}></textarea></label
    >
    <label class="editor-field"
      >Social image<select bind:value={meta.social_image}
        ><option value="">Use cover image</option>{#each media as image (image.id)}<option
            value={image.url}>{image.name}</option
          >{/each}</select
      ></label
    >
  </details>
</section>
{#if kind === 'projects'}
  <section class="inspector-section">
    {#if selfId}
      <TopicManager projectId={selfId} />
    {:else}
      <div>
        <h2 class="sidebar-heading">Topics</h2>
        <p class="editor-help">Save the project once to add topics.</p>
      </div>
    {/if}
  </section>
{/if}
