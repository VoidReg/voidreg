<script lang="ts">
  import { onMount } from 'svelte';
  import { adminRequest, adminUpload } from './api';
  import { confirmDialog } from './ui/confirm.svelte';
  import { notify } from './ui/toast.svelte';

  type Asset = {
    id: string;
    url: string;
    name: string;
    alt: string;
    caption: string;
    width: number;
    height: number;
    used_by?: { kind: string; slug: string; title: string }[];
  };
  type Upload = {
    id: number;
    name: string;
    state: 'queued' | 'sending' | 'done' | 'failed';
    progress: number;
    error?: string;
  };

  const MAX_BYTES = 4 * 1024 * 1024;
  let items = $state<Asset[]>([]);
  let loading = $state(true);
  let failure = $state('');
  let query = $state('');
  let missingOnly = $state(false);
  let uploads = $state<Upload[]>([]);
  let over = $state(false);
  let editing = $state<Asset | null>(null);
  let draft = $state<Asset | null>(null);
  let saving = $state(false);
  let dialog = $state<HTMLDialogElement>();
  let nextUpload = 1;

  const missing = $derived(items.filter((a) => !a.alt.trim()).length);
  const shown = $derived(
    items.filter(
      (a) =>
        (!missingOnly || !a.alt.trim()) &&
        (!query.trim() ||
          (a.name + ' ' + a.alt + ' ' + a.caption)
            .toLowerCase()
            .includes(query.trim().toLowerCase()))
    )
  );
  const active = $derived(uploads.filter((u) => u.state === 'queued' || u.state === 'sending'));

  async function load() {
    failure = '';
    loading = true;
    try {
      items = (await adminRequest<{ items: Asset[] }>('/media')).items;
    } catch (e) {
      failure = (e as Error).message;
    } finally {
      loading = false;
    }
  }
  onMount(() => void load());

  const toBase64 = (file: File) =>
    new Promise<string>((ok, fail) => {
      const reader = new FileReader();
      reader.onload = () => ok(String(reader.result).split(',')[1]);
      reader.onerror = () => fail(new Error('The file could not be read.'));
      reader.readAsDataURL(file);
    });

  async function send(files: File[]) {
    const batch: [File, Upload][] = files.map((file) => {
      const upload: Upload = { id: nextUpload++, name: file.name, state: 'queued', progress: 0 };
      if (!/^image\/(png|jpeg)$/.test(file.type)) {
        upload.state = 'failed';
        upload.error = 'Only PNG and JPEG images are accepted.';
      } else if (file.size > MAX_BYTES) {
        upload.state = 'failed';
        upload.error = 'Images may be up to 4 MiB.';
      }
      return [file, upload];
    });
    uploads = [...batch.map(([, u]) => u), ...uploads].slice(0, 12);
    for (const [file, entry] of batch) {
      const upload = uploads.find((u) => u.id === entry.id);
      if (!upload || upload.state === 'failed') continue;
      upload.state = 'sending';
      try {
        const data = await toBase64(file);
        await adminUpload('/media', { name: file.name, data }, (f) => (upload.progress = f));
        upload.state = 'done';
        upload.progress = 1;
      } catch (e) {
        upload.state = 'failed';
        upload.error = (e as Error).message;
      }
    }
    await load();
    const ok = batch.filter(([, e]) => uploads.find((u) => u.id === e.id)?.state === 'done').length;
    if (ok)
      notify.success(
        `${ok} image${ok === 1 ? '' : 's'} uploaded. Add alt text before using ${ok === 1 ? 'it' : 'them'}.`
      );
  }
  function choose(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    if (files.length) void send(files);
  }
  function drop(event: DragEvent) {
    event.preventDefault();
    over = false;
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length) void send(files);
  }

  function edit(asset: Asset) {
    editing = asset;
    draft = { ...asset };
    dialog?.showModal();
  }
  function closeEditor() {
    dialog?.close();
    editing = null;
    draft = null;
  }
  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!draft) return;
    saving = true;
    try {
      await adminRequest('/media/' + draft.id, 'PUT', draft);
      items = items.map((a) => (a.id === draft!.id ? { ...a, ...draft! } : a));
      notify.success('Media details saved.');
      closeEditor();
    } catch (e) {
      notify.error((e as Error).message);
    } finally {
      saving = false;
    }
  }
  async function remove(asset: Asset) {
    const ok = await confirmDialog({
      title: `Delete "${asset.name}"?`,
      body: 'The image file is removed permanently.',
      confirmLabel: 'Delete image',
      danger: true
    });
    if (!ok) return;
    try {
      await adminRequest('/media/' + asset.id, 'DELETE');
      closeEditor();
      await load();
      notify.success('Image deleted.');
    } catch (e) {
      notify.error((e as Error).message);
    }
  }
  async function copy(asset: Asset) {
    try {
      await navigator.clipboard.writeText(asset.url);
      notify.success('Image URL copied.');
    } catch {
      notify.error('Copy was unavailable. Select the URL in the editor and copy it manually.');
    }
  }
</script>

<section class="media" aria-labelledby="media-title">
  <header class="media-head">
    <div>
      <h1 id="media-title">Media</h1>
      <p class="media-sub" role="status">
        {#if loading}Loading{:else}{items.length} image{items.length === 1 ? '' : 's'}{#if missing}, {missing}
            without alt text{/if}{/if}
      </p>
    </div>
  </header>

  <div
    class="drop"
    class:over
    role="group"
    aria-label="Upload images"
    ondragover={(e) => {
      e.preventDefault();
      over = true;
    }}
    ondragleave={() => (over = false)}
    ondrop={drop}
  >
    <p><strong>Drop PNG or JPEG images here</strong>, up to 4 MiB each.</p>
    <label class="ui-btn ui-btn-primary">
      Choose images
      <input class="sr-only" type="file" accept="image/png,image/jpeg" multiple onchange={choose} />
    </label>
  </div>

  {#if uploads.length}
    <ul class="uploads" aria-label="Uploads">
      {#each uploads as upload (upload.id)}
        <li class={upload.state}>
          <span class="uploads-name">{upload.name}</span>
          {#if upload.state === 'failed'}
            <span class="uploads-state">{upload.error}</span>
          {:else if upload.state === 'done'}
            <span class="uploads-state">Uploaded</span>
          {:else}
            <progress max="1" value={upload.progress} aria-label={`Uploading ${upload.name}`}
            ></progress>
          {/if}
        </li>
      {/each}
    </ul>
    {#if !active.length}
      <button
        type="button"
        class="ui-btn ui-btn-small ui-btn-quiet media-clear"
        onclick={() => (uploads = [])}>Clear upload list</button
      >
    {/if}
  {/if}

  <form class="media-filters" role="search" onsubmit={(e) => e.preventDefault()}>
    <label class="ui-field"
      >Search<input
        type="search"
        bind:value={query}
        placeholder="Name, alt text or caption"
      /></label
    >
    <label class="media-check"
      ><input type="checkbox" bind:checked={missingOnly} />Missing alt text only ({missing})</label
    >
  </form>

  {#if failure}
    <div class="ui-notice ui-notice-error" role="alert">
      <p>{failure}</p>
      <button type="button" class="ui-btn ui-btn-small" onclick={load}>Retry</button>
    </div>
  {:else if loading && items.length === 0}
    <div class="media-grid" aria-hidden="true">
      {#each [0, 1, 2, 3] as n (n)}<span class="ui-skeleton media-skel"></span>{/each}
    </div>
  {:else if items.length === 0}
    <div class="ui-empty">
      <h2>No images yet</h2>
      <p>Upload an image above. Each one needs alt text before it is used in a post.</p>
    </div>
  {:else if shown.length === 0}
    <div class="ui-empty">
      <h2>No matches</h2>
      <p>No image matches the current filters.</p>
      <button type="button" class="ui-btn" onclick={() => ((query = ''), (missingOnly = false))}
        >Clear filters</button
      >
    </div>
  {:else}
    <ul class="media-grid">
      {#each shown as asset (asset.id)}
        <li class="media-card">
          <button
            type="button"
            class="media-thumb"
            onclick={() => edit(asset)}
            aria-label={`Edit ${asset.name}`}
          >
            <img
              src={asset.url}
              alt={asset.alt}
              width={asset.width}
              height={asset.height}
              loading="lazy"
            />
          </button>
          <div class="media-meta">
            <p class="media-name">{asset.name}</p>
            <p class="media-dim">{asset.width} x {asset.height}</p>
            <p>
              {#if !asset.alt.trim()}<span class="ui-badge media-warn">Missing alt</span>{/if}
              {#if asset.used_by?.length}<span class="ui-badge">In use: {asset.used_by.length}</span
                >{/if}
            </p>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<dialog
  bind:this={dialog}
  class="ui-dialog drawer"
  aria-labelledby="media-edit-title"
  onclose={() => ((editing = null), (draft = null))}
  onclick={(e) => {
    if (e.target === dialog) closeEditor();
  }}
>
  {#if draft && editing}
    <form class="ui-dialog-body" onsubmit={save}>
      <h2 id="media-edit-title">Edit image</h2>
      <img class="drawer-img" src={draft.url} alt={draft.alt} />
      <label class="ui-field">Name<input bind:value={draft.name} required /></label>
      <label class="ui-field"
        >Alt text<textarea rows="3" bind:value={draft.alt}></textarea>
        <span class="ui-field-hint"
          >Describe what the image shows. Leave decorative images to the figure block.</span
        >
      </label>
      <label class="ui-field"
        >Caption<textarea rows="2" bind:value={draft.caption}></textarea></label
      >
      <label class="ui-field">Image URL<input readonly value={draft.url} /></label>
      <p class="ui-field-hint">
        {draft.width} x {draft.height}.
        {#if editing.used_by?.length}
          Used by {editing.used_by.map((u) => u.title).join(', ')}.
        {:else}Not currently used.{/if}
      </p>
      <div class="ui-dialog-actions">
        <button type="button" class="ui-btn" onclick={() => editing && copy(editing)}
          >Copy URL</button
        >
        <button
          type="button"
          class="ui-btn ui-btn-danger"
          disabled={!!editing.used_by?.length}
          title={editing.used_by?.length ? 'Remove it from content before deleting' : undefined}
          onclick={() => editing && remove(editing)}>Delete</button
        >
        <button type="button" class="ui-btn" onclick={closeEditor}>Cancel</button>
        <button class="ui-btn ui-btn-primary" disabled={saving}
          >{saving ? 'Saving...' : 'Save details'}</button
        >
      </div>
    </form>
  {/if}
</dialog>

<style>
  .media {
    display: grid;
    gap: 1.25rem;
    max-width: 72rem;
  }
  h1 {
    font-size: 1.75rem;
    line-height: 1.2;
  }
  .media-sub {
    color: var(--muted-foreground);
    font-size: 0.875rem;
  }
  .drop {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: center;
    justify-content: space-between;
    border: 1px dashed var(--input);
    padding: 1.5rem;
  }
  .drop.over {
    border-style: solid;
    border-color: var(--foreground);
    background: var(--secondary);
  }
  .drop:has(input:focus-visible) label {
    outline: 3px solid var(--ring);
    outline-offset: 3px;
  }
  .uploads {
    display: grid;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 0.875rem;
  }
  .uploads li {
    display: flex;
    gap: 1rem;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--border);
    padding-block: 0.375rem;
  }
  .uploads li.failed .uploads-state {
    color: var(--danger);
  }
  .uploads-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  progress {
    width: 10rem;
    accent-color: var(--foreground);
  }
  .media-clear {
    justify-self: start;
  }
  .media-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem 1.5rem;
    align-items: end;
  }
  .media-filters .ui-field {
    min-width: min(100%, 20rem);
  }
  .media-check {
    display: inline-flex;
    gap: 0.5rem;
    align-items: center;
    min-height: 2.75rem;
    font-size: 0.875rem;
  }
  .media-check input {
    width: 1.25rem;
    height: 1.25rem;
    accent-color: var(--foreground);
  }
  .media-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
    gap: 1rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .media-skel {
    height: 12rem;
  }
  .media-card {
    display: grid;
    border: 1px solid var(--border);
    min-width: 0;
  }
  .media-thumb {
    border: 0;
    border-bottom: 1px solid var(--border);
    background: var(--card);
    padding: 0.5rem;
    cursor: pointer;
  }
  .media-thumb img {
    display: block;
    width: 100%;
    height: 9rem;
    object-fit: contain;
  }
  .media-meta {
    display: grid;
    gap: 0.25rem;
    padding: 0.75rem;
  }
  .media-name {
    overflow: hidden;
    font-size: 0.875rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .media-dim {
    color: var(--muted-foreground);
    font-family: var(--font-code);
    font-size: 0.75rem;
  }
  .media-warn {
    border-color: var(--danger);
    color: var(--danger);
  }
  .drawer {
    margin-inline: auto 0;
    margin-block: 0;
    width: min(28rem, 100%);
    max-height: 100dvh;
    height: 100dvh;
  }
  .drawer-img {
    max-height: 12rem;
    object-fit: contain;
    border: 1px solid var(--border);
    background: var(--card);
    width: 100%;
  }
</style>
