<script lang="ts">
  import { onMount } from 'svelte';
  import { adminRequest } from './api';
  import type { Article, ContentMeta } from '@voidreg/publishing-ui/api';
  let {
    meta = $bindable(),
    tags = $bindable(),
    repo = $bindable(),
    kind,
    projects,
    onchange
  }: {
    meta: ContentMeta;
    tags: string;
    repo: string;
    kind: string;
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
  {#if kind === 'projects'}
    <h2 class="sidebar-heading">Project details</h2>
    <label class="editor-field"
      >Technologies and tags<input bind:value={tags} placeholder="Rust, ESP32, Wi-Fi CSI" /></label
    >
    <label class="editor-field">Repository URL<input type="url" bind:value={repo} /></label>
    <label class="editor-field">Demo URL<input type="url" bind:value={meta.demo_url} /></label>
  {:else}
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
