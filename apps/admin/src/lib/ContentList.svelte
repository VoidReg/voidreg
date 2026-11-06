<script lang="ts">
  import { untrack } from 'svelte';
  import Icon from './components/Icon.svelte';
  import Pager from './components/Pager.svelte';
  import { adminRequest } from './api';
  import { confirmDialog } from './ui/confirm.svelte';
  import { notify } from './ui/toast.svelte';
  import type { Article, Page, Topic } from '@voidreg/publishing-ui/api';

  type SortKey = '' | 'title' | 'category' | 'status' | 'date';
  interface Route {
    page: number;
    query: string;
    status: string;
    tag: string;
    inProject: string;
    inTopic: string;
    sort: SortKey;
    dir: 'asc' | 'desc';
    perPage: number;
  }
  let {
    kind,
    route,
    onnavigate,
    onedit
  }: {
    kind: 'articles' | 'projects';
    route: Route;
    onnavigate: (changes: Record<string, string | number | null | undefined>) => void;
    onedit: (item?: Article) => void;
  } = $props();

  const noun = $derived(kind === 'projects' ? 'project' : 'article');
  let items = $state<Article[]>([]);
  let total = $state(0);
  let loading = $state(true);
  let failure = $state('');
  let acting = $state(false);
  let selected = $state<Set<string>>(new Set());
  let search = $state(untrack(() => route.query));
  let requestId = 0;

  let knownTags = $state<string[]>([]);
  $effect(() => {
    void adminRequest<{ items: { name: string }[] }>('/tags?limit=100')
      .then((v) => (knownTags = v.items.map((t) => t.name)))
      .catch(() => (knownTags = []));
  });

  // Project and topic filters for posts. Projects are suggested by server search so the list
  // stays bounded; topics load only once a project is chosen.
  let projectChoices = $state<{ slug: string; title: string }[]>([]);
  let topicChoices = $state<Topic[]>([]);
  let projectTimer: ReturnType<typeof setTimeout> | undefined;
  function suggestProjects(text: string) {
    clearTimeout(projectTimer);
    projectTimer = setTimeout(() => {
      void adminRequest<Page<Article>>(
        `/projects?per_page=20&sort=title&q=${encodeURIComponent(text)}`
      )
        .then((v) => (projectChoices = v.items.map(({ slug, title }) => ({ slug, title }))))
        .catch(() => (projectChoices = []));
    }, 150);
  }
  $effect(() => {
    if (kind !== 'articles') return;
    suggestProjects('');
  });
  $effect(() => {
    const project = kind === 'articles' ? route.inProject : '';
    if (!project) {
      topicChoices = [];
      return;
    }
    let live = true;
    void adminRequest<Page<Topic>>(`/topics?project=${encodeURIComponent(project)}&per_page=100`)
      .then((v) => live && (topicChoices = v.items))
      .catch(() => live && (topicChoices = []));
    return () => (live = false);
  });

  async function load() {
    const request = ++requestId;
    loading = true;
    failure = '';
    const params = new URLSearchParams({
      page: String(route.page),
      per_page: String(route.perPage),
      q: route.query,
      status: route.status,
      tag: route.tag
    });
    if (kind === 'articles' && route.inProject) {
      params.set('project', route.inProject);
      if (route.inTopic) params.set('topic', route.inTopic);
    }
    if (route.sort) {
      params.set('sort', route.sort);
      params.set('dir', route.dir);
    }
    try {
      const result = await adminRequest<Page<Article>>(`/${kind}?${params}`);
      if (request !== requestId) return;
      items = result.items;
      total = result.total;
      selected = new Set([...selected].filter((slug) => result.items.some((i) => i.slug === slug)));
      if (result.page !== route.page) onnavigate({ page: result.page > 1 ? result.page : null });
    } catch (cause) {
      if (request === requestId) failure = (cause as Error).message;
    } finally {
      if (request === requestId) loading = false;
    }
  }
  $effect(() => {
    void [
      kind,
      route.page,
      route.query,
      route.status,
      route.tag,
      route.inProject,
      route.inTopic,
      route.sort,
      route.dir,
      route.perPage
    ];
    untrack(() => {
      selected = new Set();
      void load();
    });
  });
  // Debounced search so typing does not push a history entry per keystroke.
  $effect(() => {
    const value = search.trim();
    if (value === route.query) return;
    const timer = setTimeout(() => onnavigate({ page: null, q: value || null }), 300);
    return () => clearTimeout(timer);
  });
  $effect(() => {
    search = route.query;
  });

  const pages = $derived(Math.max(1, Math.ceil(total / route.perPage)));
  const first = $derived(total === 0 ? 0 : (route.page - 1) * route.perPage + 1);
  const last = $derived(Math.min(total, route.page * route.perPage));
  const filtered = $derived(
    !!route.query || !!route.status || !!route.tag || !!route.inProject || !!route.inTopic
  );
  const allSelected = $derived(items.length > 0 && items.every((i) => selected.has(i.slug)));
  const chosen = $derived(items.filter((i) => selected.has(i.slug)));

  function toggle(slug: string, on: boolean) {
    const next = new Set(selected);
    if (on) next.add(slug);
    else next.delete(slug);
    selected = next;
  }
  function sortBy(key: Exclude<SortKey, ''>) {
    if (route.sort !== key) onnavigate({ sort: key, dir: 'asc', page: null });
    else if (route.dir === 'asc') onnavigate({ dir: 'desc', page: null });
    else onnavigate({ sort: null, dir: null, page: null });
  }
  const ariaSort = (key: SortKey) =>
    route.sort === key ? (route.dir === 'asc' ? 'ascending' : 'descending') : 'none';

  async function run(article: Article, action: 'archive' | 'restore' | 'delete') {
    await adminRequest(
      `/${kind}/${article.slug}` + (action === 'delete' ? '' : '/' + action),
      action === 'delete' ? 'DELETE' : 'POST',
      { expected_revision: article.revision }
    );
  }
  async function lifecycle(article: Article, action: 'archive' | 'restore' | 'delete') {
    if (action === 'delete') {
      const ok = await confirmDialog({
        title: `Delete "${article.title}"?`,
        body: 'This removes the content and its history permanently. It cannot be undone.',
        confirmLabel: 'Delete permanently',
        danger: true
      });
      if (!ok) return;
    }
    if (action === 'archive') {
      const ok = await confirmDialog({
        title: `Archive "${article.title}"?`,
        body: 'It leaves the public site until you restore it.',
        confirmLabel: 'Archive'
      });
      if (!ok) return;
    }
    acting = true;
    try {
      await run(article, action);
      await load();
      if (action === 'archive') {
        notify.success(`Archived "${article.title}".`, {
          label: 'Undo',
          run: () => void undo(article)
        });
      } else notify.success(action === 'delete' ? 'Deleted.' : 'Restored.');
    } catch (cause) {
      notify.error((cause as Error).message);
      void load();
    } finally {
      acting = false;
    }
  }
  async function undo(article: Article) {
    try {
      const fresh = await adminRequest<Article>(`/${kind}/${article.slug}`);
      await run(fresh, 'restore');
      await load();
      notify.success('Restored.');
    } catch (cause) {
      notify.error((cause as Error).message);
    }
  }
  async function bulk(action: 'archive' | 'restore') {
    const batch = chosen.filter((i) => (action === 'archive' ? !i.archived : i.archived));
    if (batch.length === 0) return;
    if (
      action === 'archive' &&
      !(await confirmDialog({
        title: `Archive ${batch.length} ${noun}${batch.length === 1 ? '' : 's'}?`,
        body: 'They leave the public site until restored.',
        confirmLabel: 'Archive'
      }))
    )
      return;
    acting = true;
    let done = 0;
    const failed: string[] = [];
    for (const article of batch) {
      try {
        await run(article, action);
        done++;
      } catch {
        failed.push(article.title);
      }
    }
    selected = new Set();
    await load();
    acting = false;
    if (failed.length) notify.error(`${done} done. Could not update: ${failed.join(', ')}.`);
    else notify.success(`${done} ${action === 'archive' ? 'archived' : 'restored'}.`);
  }
  function previewUrl(article: Article) {
    return `/preview/${kind === 'projects' ? 'projects' : 'blog'}/${encodeURIComponent(article.slug)}`;
  }
  function closeMenus(event: Event) {
    for (const menu of document.querySelectorAll<HTMLDetailsElement>('.ui-menu[open]'))
      if (!menu.contains(event.target as Node)) menu.open = false;
  }
  function menuKeys(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    const open = document.querySelector<HTMLDetailsElement>('.ui-menu[open]');
    if (!open) return;
    open.open = false;
    open.querySelector<HTMLElement>('summary')?.focus();
  }
  const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });
  const formatDate = (value: string | null | undefined) =>
    value && !Number.isNaN(Date.parse(value))
      ? dateFormat.format(new Date(value))
      : 'Not published';
</script>

<svelte:window onclick={closeMenus} onkeydown={menuKeys} />

<section class="list" aria-labelledby="list-title">
  <header class="list-head">
    <div>
      <h1 id="list-title">{kind === 'projects' ? 'Projects' : 'Articles'}</h1>
      <p class="list-count" role="status">
        {#if loading && items.length === 0}Loading{:else if total === 0}No {noun}s{filtered
            ? ' match the filters'
            : ' yet'}{:else}Showing {first} to {last} of {total}{/if}
      </p>
    </div>
    <div class="list-actions">
      <!-- eslint-disable svelte/no-navigation-without-resolve -- the draft map is served by the site app -->
      <a class="ui-btn" href="/preview/map" target="_blank" rel="noopener">Preview map</a>
      <!-- eslint-enable svelte/no-navigation-without-resolve -->
      <button type="button" class="ui-btn ui-btn-primary" onclick={() => onedit()}
        ><Icon name="plus" size={16} />New {noun}</button
      >
    </div>
  </header>

  <form class="list-filters" role="search" onsubmit={(event) => event.preventDefault()}>
    <label class="ui-field"
      >Search<input
        type="search"
        bind:value={search}
        placeholder="Title or summary"
        autocomplete="off"
      /></label
    >
    <label class="ui-field"
      >Status<select
        value={route.status}
        onchange={(event) => onnavigate({ status: event.currentTarget.value || null, page: null })}
        ><option value="">All</option><option value="draft">Draft</option><option value="published"
          >Published</option
        ><option value="archived">Archived</option></select
      ></label
    >
    <label class="ui-field"
      >Tag<input
        list="list-tags"
        value={route.tag}
        placeholder="Any tag"
        autocomplete="off"
        onchange={(event) =>
          onnavigate({ tag: event.currentTarget.value.trim() || null, page: null })}
      /><datalist id="list-tags"
        >{#each knownTags as name (name)}<option value={name}></option>{/each}</datalist
      ></label
    >
    {#if kind === 'articles'}
      <label class="ui-field"
        >Project<input
          list="list-projects"
          value={route.inProject}
          placeholder="Any project (URL)"
          autocomplete="off"
          oninput={(event) => suggestProjects(event.currentTarget.value)}
          onchange={(event) =>
            onnavigate({
              in_project: event.currentTarget.value.trim() || null,
              in_topic: null,
              page: null
            })}
        /><datalist id="list-projects"
          >{#each projectChoices as choice (choice.slug)}<option value={choice.slug}
              >{choice.title}</option
            >{/each}</datalist
        ></label
      >
      {#if route.inProject}
        <label class="ui-field"
          >Topic<select
            value={route.inTopic}
            onchange={(event) =>
              onnavigate({ in_topic: event.currentTarget.value || null, page: null })}
            ><option value="">Any topic</option><option value="none">No topic</option
            >{#each topicChoices as topic (topic.id)}<option value={topic.slug}
                >{topic.title}</option
              >{/each}</select
          ></label
        >
      {/if}
    {/if}
    <label class="ui-field"
      >Per page<select
        value={String(route.perPage)}
        onchange={(event) =>
          onnavigate({
            per_page: Number(event.currentTarget.value) === 20 ? null : event.currentTarget.value,
            page: null
          })}
        >{#each [10, 20, 50, 100] as size (size)}<option value={String(size)}>{size}</option
          >{/each}</select
      ></label
    >
    {#if filtered}<button
        type="button"
        class="ui-btn ui-btn-quiet"
        onclick={() => {
          search = '';
          onnavigate({
            q: null,
            status: null,
            tag: null,
            in_project: null,
            in_topic: null,
            page: null
          });
        }}>Clear filters</button
      >{/if}
  </form>

  {#if chosen.length}
    <div class="list-bulk" role="region" aria-label="Bulk actions">
      <strong>{chosen.length} selected</strong>
      <button
        type="button"
        class="ui-btn ui-btn-small"
        disabled={acting}
        onclick={() => bulk('archive')}>Archive</button
      >
      <button
        type="button"
        class="ui-btn ui-btn-small"
        disabled={acting}
        onclick={() => bulk('restore')}>Restore</button
      >
      <button
        type="button"
        class="ui-btn ui-btn-small ui-btn-quiet"
        onclick={() => (selected = new Set())}>Clear selection</button
      >
    </div>
  {/if}

  {#if failure}
    <div class="ui-notice ui-notice-error" role="alert">
      <p>{failure}</p>
      <button type="button" class="ui-btn ui-btn-small" onclick={load}>Retry</button>
    </div>
  {:else if !loading && items.length === 0}
    <div class="ui-empty">
      {#if filtered}
        <h2>No matches</h2>
        <p>Nothing matches these filters. Try a different search or clear them.</p>
        <button
          type="button"
          class="ui-btn"
          onclick={() => {
            search = '';
            onnavigate({
              q: null,
              status: null,
              tag: null,
              in_project: null,
              in_topic: null,
              page: null
            });
          }}>Clear filters</button
        >
      {:else}
        <h2>No {noun}s yet</h2>
        <p>Create a draft to start writing. Nothing is public until you publish it.</p>
        <button type="button" class="ui-btn ui-btn-primary" onclick={() => onedit()}
          >New {noun}</button
        >
      {/if}
    </div>
  {:else}
    <div class="ui-table-wrap" aria-busy={loading}>
      <table class="ui-table list-table">
        <caption class="sr-only">{kind === 'projects' ? 'Projects' : 'Articles'}</caption>
        <thead>
          <tr>
            <th scope="col" class="col-check"
              ><input
                type="checkbox"
                aria-label="Select all on this page"
                checked={allSelected}
                onchange={(event) =>
                  (selected = event.currentTarget.checked
                    ? new Set(items.map((i) => i.slug))
                    : new Set())}
              /></th
            >
            {#each [['title', 'Title'], ['status', 'Status'], ['category', 'Category'], ['date', 'Published']] as [key, label] (key)}
              <th
                scope="col"
                aria-sort={ariaSort(key as SortKey)}
                class={key === 'category' || key === 'date' ? 'col-secondary' : undefined}
                ><button
                  type="button"
                  class="ui-sort"
                  onclick={() => sortBy(key as Exclude<SortKey, ''>)}
                  >{label}{#if route.sort === key}<Icon
                      name={route.dir === 'asc' ? 'chevron-up' : 'chevron-down'}
                      size={14}
                    />{/if}</button
                ></th
              >
            {/each}
            <th scope="col"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {#if loading && items.length === 0}
            {#each [0, 1, 2, 3, 4] as row (row)}
              <tr aria-hidden="true">
                <td colspan="6"><span class="ui-skeleton list-skeleton"></span></td>
              </tr>
            {/each}
          {/if}
          {#each items as article (article.slug)}
            <tr aria-selected={selected.has(article.slug)}>
              <td class="col-check"
                ><input
                  type="checkbox"
                  aria-label={`Select ${article.title}`}
                  checked={selected.has(article.slug)}
                  onchange={(event) => toggle(article.slug, event.currentTarget.checked)}
                /></td
              >
              <th scope="row" class="col-title">
                {#if article.archived}
                  <span class="list-title">{article.title}</span>
                {:else}
                  <button type="button" class="list-title link" onclick={() => onedit(article)}
                    >{article.title || 'Untitled'}</button
                  >
                {/if}
                <span class="list-slug">/{article.slug}</span>
                {#if article.topic}<span class="list-slug" title="Topic"
                    >Topic: {article.topic.title}</span
                  >{/if}
                {#if article.tags?.length}<span class="list-tags" aria-label="Tags"
                    >{#each article.tags.slice(0, 3) as tag (tag)}<button
                        type="button"
                        class="list-tag"
                        title={`Show items tagged ${tag}`}
                        onclick={() => onnavigate({ tag, page: null })}>{tag}</button
                      >{/each}{#if article.tags.length > 3}<span class="list-tag more"
                        >+{article.tags.length - 3}</span
                      >{/if}</span
                  >{/if}
              </th>
              <td>
                <span
                  class={`ui-badge ${article.archived ? 'ui-badge-archived' : article.status === 'published' ? 'ui-badge-published' : ''}`}
                  >{article.archived ? 'Archived' : article.status}</span
                >
                {#if article.has_unpublished_changes}<span class="list-flag"
                    >Unpublished changes</span
                  >{/if}
                {#if article.featured}<span class="list-flag">Featured</span>{/if}
              </td>
              <td class="col-secondary">{article.category || 'None'}</td>
              <td class="col-secondary">{formatDate(article.published_at)}</td>
              <td class="col-menu">
                <details class="ui-menu">
                  <summary
                    class="ui-btn ui-btn-small ui-btn-quiet"
                    aria-label={`Actions for ${article.title}`}
                    ><Icon name="more" size={18} /></summary
                  >
                  <div class="ui-menu-list">
                    {#if !article.archived}
                      <button type="button" onclick={() => onedit(article)}>Edit</button>
                      <!-- eslint-disable svelte/no-navigation-without-resolve -- private preview is served by the site app -->
                      <a href={previewUrl(article)} target="_blank" rel="noopener"
                        >Preview on site</a
                      >
                      <!-- eslint-enable svelte/no-navigation-without-resolve -->
                    {/if}
                    <button
                      type="button"
                      disabled={acting}
                      onclick={() => lifecycle(article, article.archived ? 'restore' : 'archive')}
                      >{article.archived ? 'Restore' : 'Archive'}</button
                    >
                    <button
                      type="button"
                      class="danger"
                      disabled={acting}
                      onclick={() => lifecycle(article, 'delete')}>Delete permanently</button
                    >
                  </div>
                </details>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <Pager
      page={route.page}
      {pages}
      disabled={loading}
      onselect={(n) => onnavigate({ page: n > 1 ? n : null })}
    />
  {/if}
</section>

<style>
  .list {
    display: grid;
    gap: 1.25rem;
    max-width: 72rem;
  }
  .list-head {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: end;
    justify-content: space-between;
  }
  h1 {
    font-size: 1.75rem;
    line-height: 1.2;
  }
  .list-count {
    color: var(--muted-foreground);
    font-size: 0.875rem;
  }
  .list-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .list-filters {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 10rem 10rem 7rem auto;
    gap: 0.75rem;
    align-items: end;
  }
  .list-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-top: 0.25rem;
  }
  .list-tag {
    border: 1px solid var(--border);
    background: transparent;
    padding: 0 0.5rem;
    min-height: 1.5rem;
    color: var(--muted-foreground);
    font: inherit;
    font-size: 0.75rem;
    cursor: pointer;
  }
  button.list-tag:hover {
    border-color: var(--foreground);
    color: var(--foreground);
  }
  .list-bulk {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    border: 1px solid var(--foreground);
    padding: 0.5rem 0.75rem;
  }
  .list-bulk strong {
    margin-inline-end: 0.5rem;
    font-size: 0.875rem;
  }
  .list-table .col-check {
    width: 2.75rem;
  }
  .list-table input[type='checkbox'] {
    width: 1.25rem;
    height: 1.25rem;
    accent-color: var(--foreground);
  }
  .col-title {
    display: grid;
    gap: 0.125rem;
    min-width: 12rem;
    font-weight: 400;
  }
  .list-title {
    font-size: 1rem;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .list-title.link {
    border: 0;
    background: transparent;
    padding: 0;
    min-height: 1.75rem;
    color: var(--foreground);
    text-align: start;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }
  .list-slug {
    color: var(--muted-foreground);
    font-family: var(--font-code);
    font-size: 0.75rem;
    overflow-wrap: anywhere;
  }
  .list-flag {
    margin-inline-start: 0.5rem;
    color: var(--muted-foreground);
    font-size: 0.75rem;
  }
  .col-menu {
    width: 3.5rem;
    text-align: end;
  }
  .list-skeleton {
    height: 2.25rem;
  }
  @media (max-width: 47.999rem) {
    .list-filters {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
    .list-filters :global(.ui-field:first-child) {
      grid-column: 1 / -1;
    }
    .col-secondary {
      display: none;
    }
  }
</style>
