<script lang="ts">
  // Topics of one project: add, rename, describe, reorder and delete. Topics are lightweight
  // structure that goes live on save, so they bypass the document autosave and talk to the API
  // directly. Deleting is refused by the server while posts still use the topic.
  import { onMount } from 'svelte';
  import type { Page, Topic } from '@voidreg/publishing-ui/api';
  import { adminRequest } from './api';
  import { confirmDialog } from './ui/confirm.svelte';
  import { notify } from './ui/toast.svelte';

  let { projectId }: { projectId: string } = $props();

  const LIMIT = 100;
  let topics = $state<Topic[]>([]);
  let total = $state(0);
  let loading = $state(true);
  let failed = $state(false);
  let busy = $state(false);
  let newTitle = $state('');
  let newSummary = $state('');
  let editing = $state('');
  let draftTitle = $state('');
  let draftSummary = $state('');

  const path = (topic: Topic) => `/topics/${topic.project_id}/${topic.slug}`;
  const message = (e: unknown) => (e instanceof Error ? e.message : 'The request failed.');
  const plural = (n: number) => `${n} ${n === 1 ? 'post' : 'posts'}`;

  async function load() {
    loading = true;
    failed = false;
    try {
      const page = await adminRequest<Page<Topic>>(
        `/topics?project_id=${encodeURIComponent(projectId)}&per_page=${LIMIT}`
      );
      topics = page.items;
      total = page.total;
    } catch {
      failed = true;
    } finally {
      loading = false;
    }
  }
  onMount(load);

  async function add(event: SubmitEvent) {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title || busy) return;
    busy = true;
    try {
      const sortOrder = topics.reduce((max, t) => Math.max(max, t.sort_order), 0) + 10;
      await adminRequest<Topic>('/topics', 'POST', {
        project_id: projectId,
        title,
        summary: newSummary.trim(),
        sort_order: sortOrder
      });
      newTitle = '';
      newSummary = '';
      await load();
    } catch (e) {
      notify.error(message(e));
    } finally {
      busy = false;
    }
  }

  function edit(topic: Topic) {
    editing = topic.id;
    draftTitle = topic.title;
    draftSummary = topic.summary ?? '';
  }

  async function save(topic: Topic) {
    const title = draftTitle.trim();
    if (!title || busy) return;
    busy = true;
    try {
      await adminRequest<Topic>(path(topic), 'PUT', {
        expected_revision: topic.revision,
        title,
        summary: draftSummary.trim()
      });
      editing = '';
      await load();
    } catch (e) {
      notify.error(message(e));
    } finally {
      busy = false;
    }
  }

  async function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (busy || target < 0 || target >= topics.length) return;
    busy = true;
    try {
      const next = [...topics];
      [next[index], next[target]] = [next[target], next[index]];
      // Renumber so ties never decide the order; only changed rows are written.
      for (const [i, topic] of next.entries()) {
        const order = (i + 1) * 10;
        if (topic.sort_order === order) continue;
        await adminRequest<Topic>(path(topic), 'PUT', {
          expected_revision: topic.revision,
          sort_order: order
        });
      }
      await load();
    } catch (e) {
      notify.error(message(e));
      await load();
    } finally {
      busy = false;
    }
  }

  async function remove(topic: Topic) {
    if (busy) return;
    if (topic.post_count > 0) {
      notify.info(
        `Move the ${plural(topic.post_count)} in "${topic.title}" to another topic first. Change a post's topic in its Settings.`
      );
      return;
    }
    const ok = await confirmDialog({
      title: `Delete topic "${topic.title}"?`,
      body: 'The topic has no posts. Its page is removed.',
      confirmLabel: 'Delete topic',
      danger: true
    });
    if (!ok) return;
    busy = true;
    try {
      await adminRequest(path(topic), 'DELETE', { expected_revision: topic.revision });
      await load();
    } catch (e) {
      notify.error(message(e));
    } finally {
      busy = false;
    }
  }
</script>

<div class="topic-manager">
  <h3 class="topic-heading" id="topics-heading">Topics</h3>
  <p class="editor-help">
    Topics split a large project into parts. Posts filed under a topic are grouped together on the
    project page. Posts without a topic stay under Other posts.
  </p>
  {#if loading}
    <p class="editor-help" role="status">Loading topics</p>
  {:else if failed}
    <p class="editor-help" role="alert">
      Topics could not be loaded. <button type="button" class="ui-btn ui-btn-small" onclick={load}
        >Try again</button
      >
    </p>
  {:else}
    {#if topics.length}
      <ol class="topic-list" aria-labelledby="topics-heading">
        {#each topics as topic, index (topic.id)}
          <li class="topic-row">
            {#if editing === topic.id}
              <form
                class="topic-edit"
                onsubmit={(event) => {
                  event.preventDefault();
                  void save(topic);
                }}
              >
                <label class="editor-field"
                  >Title<input bind:value={draftTitle} maxlength="120" required /></label
                >
                <label class="editor-field"
                  >Summary<textarea rows="3" maxlength="400" bind:value={draftSummary}
                  ></textarea></label
                >
                <div class="topic-actions">
                  <button class="ui-btn ui-btn-small ui-btn-primary" disabled={busy}>Save</button>
                  <button type="button" class="ui-btn ui-btn-small" onclick={() => (editing = '')}
                    >Cancel</button
                  >
                </div>
              </form>
            {:else}
              <div class="topic-main">
                <strong>{topic.title}</strong>
                <span class="topic-count">{plural(topic.post_count)}</span>
                {#if topic.summary}<p class="topic-summary">{topic.summary}</p>{/if}
              </div>
              <div class="topic-actions">
                <button
                  type="button"
                  class="ui-btn ui-btn-small"
                  aria-label={`Move ${topic.title} up`}
                  disabled={busy || index === 0}
                  onclick={() => move(index, -1)}>Up</button
                >
                <button
                  type="button"
                  class="ui-btn ui-btn-small"
                  aria-label={`Move ${topic.title} down`}
                  disabled={busy || index === topics.length - 1}
                  onclick={() => move(index, 1)}>Down</button
                >
                <button
                  type="button"
                  class="ui-btn ui-btn-small"
                  aria-label={`Edit ${topic.title}`}
                  onclick={() => edit(topic)}>Edit</button
                >
                <button
                  type="button"
                  class="ui-btn ui-btn-small ui-btn-danger"
                  aria-label={`Delete ${topic.title}`}
                  aria-disabled={topic.post_count > 0}
                  title={topic.post_count > 0 ? 'Move its posts to another topic first' : undefined}
                  disabled={busy}
                  onclick={() => remove(topic)}>Delete</button
                >
              </div>
            {/if}
          </li>
        {/each}
      </ol>
      {#if total > topics.length}
        <p class="editor-help">Showing the first {topics.length} of {total} topics.</p>
      {/if}
    {:else}
      <p class="editor-help">No topics yet.</p>
    {/if}
    <form class="topic-add" onsubmit={add}>
      <label class="editor-field"
        >New topic<input
          bind:value={newTitle}
          maxlength="120"
          placeholder="Topic title"
          autocomplete="off"
        /></label
      >
      <label class="editor-field"
        >Summary (optional)<textarea
          rows="2"
          maxlength="400"
          bind:value={newSummary}
          placeholder="One or two sentences"></textarea></label
      >
      <button class="ui-btn ui-btn-primary" disabled={busy || !newTitle.trim()}>Add topic</button>
    </form>
  {/if}
</div>

<style>
  .topic-manager {
    display: grid;
    gap: 1rem;
  }
  .topic-heading {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
  }
  .topic-list {
    display: grid;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .topic-row {
    display: grid;
    gap: 0.5rem;
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .topic-main {
    display: grid;
    gap: 0.25rem;
    min-width: 0;
  }
  .topic-main strong {
    overflow-wrap: anywhere;
  }
  .topic-count {
    color: var(--muted-foreground);
    font-size: 0.8125rem;
  }
  .topic-summary {
    margin: 0;
    color: var(--muted-foreground);
    font-size: 0.875rem;
    overflow-wrap: anywhere;
  }
  .topic-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .topic-edit,
  .topic-add {
    display: grid;
    gap: 0.75rem;
  }
  .topic-add {
    padding-top: 0.5rem;
  }
</style>
