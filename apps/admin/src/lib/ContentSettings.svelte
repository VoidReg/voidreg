<script lang="ts">
  import { onMount } from 'svelte';
  import { adminRequest } from './api';
  import type { Article, ContentMeta } from '@voidreg/publishing-ui/api';
  import ChipPicker from './components/ChipPicker.svelte';
  import { normalizeTag, type Option } from './pickers';
  let {
    meta = $bindable(),
    tags = $bindable(),
    repo = $bindable(),
    kind,
    selfId = '',
    projects,
    onchange
  }: {
    meta: ContentMeta;
    tags: string[];
    repo: string;
    kind: string;
    selfId?: string;
    projects: Article[];
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
  function toggleRelated(id: string, checked: boolean) {
    meta = {
      ...meta,
      related_project_ids: checked
        ? [...(meta.related_project_ids ?? []), id]
        : (meta.related_project_ids ?? []).filter((p) => p !== id)
    };
    onchange();
  }
  function toggle(id: string, checked: boolean) {
    meta = {
      ...meta,
      project_ids: checked
        ? [...(meta.project_ids ?? []), id]
        : (meta.project_ids ?? []).filter((p) => p !== id)
    };
    onchange();
  }
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
    <fieldset>
      <legend>Related projects</legend>
      <p class="editor-help">Related projects link both ways on the site and the map.</p>
      {#each projects.filter((p) => p.id !== selfId) as project (project.id)}<label
          class="editor-checkbox"
          ><input
            type="checkbox"
            checked={(meta.related_project_ids ?? []).includes(project.id ?? '')}
            onchange={(event) => toggleRelated(project.id ?? '', event.currentTarget.checked)}
          />{project.title}{project.archived ? ' (Archived)' : ''}</label
        >{:else}<p class="editor-help">Create another project to relate it here.</p>{/each}
    </fieldset>
  {:else}
    {@render tagField()}
    <fieldset>
      <legend>Linked projects</legend>
      <p class="editor-help">Published posts appear on each selected project.</p>
      {#each projects as project (project.id)}<label class="editor-checkbox"
          ><input
            type="checkbox"
            checked={(meta.project_ids ?? []).includes(project.id ?? '')}
            onchange={(event) => toggle(project.id ?? '', event.currentTarget.checked)}
          />{project.title}{project.archived ? ' (Archived)' : ''}</label
        >{:else}<p class="editor-help">Create a project to link it here.</p>{/each}
    </fieldset>
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
