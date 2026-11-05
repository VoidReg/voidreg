<script lang="ts">
  import { onMount } from 'svelte';
  import { adminRequest } from './api';
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
  let items = $state<Asset[]>([]),
    busy = $state(false),
    error = $state(''),
    message = $state('');
  async function load() {
    error = '';
    try {
      items = (await adminRequest<{ items: Asset[] }>('/media')).items;
    } catch (e) {
      error = (e as Error).message;
    }
  }
  onMount(() => {
    void load();
  });
  async function upload(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      error = 'Images may be up to 4 MiB.';
      return;
    }
    busy = true;
    error = '';
    try {
      const data = await new Promise<string>((ok, fail) => {
        const reader = new FileReader();
        reader.onload = () => ok(String(reader.result).split(',')[1]);
        reader.onerror = fail;
        reader.readAsDataURL(file);
      });
      await adminRequest('/media', 'POST', { name: file.name, data });
      await load();
      message = 'Image uploaded. Add meaningful alt text before using it.';
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
      input.value = '';
    }
  }
  async function save(asset: Asset) {
    busy = true;
    error = '';
    try {
      await adminRequest('/media/' + asset.id, 'PUT', asset);
      message = 'Media details saved.';
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
  async function remove(asset: Asset) {
    if (!confirm('Delete this image? Images in use cannot be deleted.')) return;
    busy = true;
    error = '';
    try {
      await adminRequest('/media/' + asset.id, 'DELETE');
      await load();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
  async function copy(asset: Asset) {
    try {
      await navigator.clipboard.writeText(asset.url);
      message = 'Image URL copied. Paste it into a figure image field.';
    } catch {
      message = asset.url;
    }
  }
</script>

<section class="section-stack">
  <h2>Media library</h2>
  <p>
    Upload PNG or JPEG images, up to 4 MiB. Reuse their URLs in figures and choose cover images in
    content settings.
  </p>
  <label
    >Upload image<input
      type="file"
      accept="image/png,image/jpeg"
      disabled={busy}
      onchange={upload}
    /></label
  >
  {#if error}<p role="alert">{error}</p>
    <button class="button button-secondary" onclick={load}>Retry</button>{/if}
  <p role="status">{message}</p>
  <div class="media-grid">
    {#each items as asset (asset.id)}<form
        class="media-item"
        onsubmit={(event) => {
          event.preventDefault();
          void save(asset);
        }}
      >
        <img src={asset.url} alt={asset.alt} width={asset.width} height={asset.height} /><label
          >Name<input bind:value={asset.name} /></label
        ><label>Alt text<textarea rows="3" bind:value={asset.alt}></textarea></label><label
          >Caption<textarea rows="3" bind:value={asset.caption}></textarea></label
        >
        <p>{asset.width} x {asset.height}</p>
        {#if asset.used_by?.length}<p>
            Used by {asset.used_by.map((entry) => entry.title).join(', ')}
          </p>{:else}<p>Not currently used.</p>{/if}
        <div class="button-row">
          <button class="button button-secondary" disabled={busy}>Save details</button><button
            type="button"
            class="button button-secondary"
            onclick={() => copy(asset)}>Copy URL</button
          ><button
            type="button"
            class="button button-secondary"
            disabled={busy}
            onclick={() => remove(asset)}>Delete</button
          >
        </div>
      </form>{:else}<p>No uploaded images yet.</p>{/each}
  </div>
</section>

<style>
  .media-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
    gap: 1.5rem;
  }
  .media-item {
    display: grid;
    gap: 1rem;
    padding: 1.5rem;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    min-width: 0;
  }
  .media-item .button-row {
    padding-block-start: 1rem;
    border-top: 1px solid var(--border);
  }
  .media-item img {
    width: 100%;
    height: 12rem;
    object-fit: contain;
  }
  .media-item label {
    display: grid;
    gap: 0.5rem;
  }
</style>
