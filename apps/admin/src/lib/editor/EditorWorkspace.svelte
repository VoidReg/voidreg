<script lang="ts">
  import { tick } from 'svelte';
  import { blockLabels, type DocumentEditor } from '@publisle/playground';
  import BlockEditor from '@publisle/playground/BlockEditor.svelte';
  import type { Document, Diagnostic, BlockId } from '@publisle/schema';
  import ArticleBody from '$lib/publishing/ArticleBody.svelte';
  import type { Article } from '$lib/publishing/api';
  import SchemaPayload from '$lib/SchemaPayload.svelte';
  import { counterDefinition, extensions, registry } from '$lib/blocks';
  import BlockSummary from './BlockSummary.svelte';
  import BlockInserter from './BlockInserter.svelte';
  import './workspace.css';

  interface Props {
    doc: Document;
    editor: DocumentEditor;
    title: string;
    summary: string;
    slug: string;
    category: string;
    featured: boolean;
    sortOrder: number;
    storedSlug: string;
    status: 'draft' | 'published';
    busy: boolean;
    dirty: boolean;
    message: string;
    error: string;
    diagnostics: readonly Diagnostic[];
    previewArticle: Article;
    onchange: () => void;
    onback: () => void;
    onsave: () => unknown;
    onpublish: () => unknown;
    onunpublish: () => unknown;
    ondelete: () => unknown;
    onimport: (source: string, format: string) => void;
    onexport: (format: 'json' | 'markdown') => void;
  }
  let {
    doc,
    editor,
    title = $bindable(),
    summary = $bindable(),
    slug = $bindable(),
    category = $bindable(),
    featured = $bindable(),
    sortOrder = $bindable(),
    storedSlug,
    status,
    busy,
    dirty,
    message,
    error,
    diagnostics,
    previewArticle,
    onchange,
    onback,
    onsave,
    onpublish,
    onunpublish,
    ondelete,
    onimport,
    onexport
  }: Props = $props();
  let mode = $state<'write' | 'preview'>('write');
  let panel = $state<'document' | 'outline' | 'settings'>('document');
  let inspector = $state<'block' | 'article'>('article');
  let selectedId = $state<BlockId | undefined>();
  let dragging = $state<BlockId | undefined>();
  let importText = $state(''),
    importFormat = $state('markdown');
  const labels = blockLabels(extensions);
  const selected = $derived(doc.blocks.find((block) => block.id === selectedId));
  const selectedIndex = $derived(doc.blocks.findIndex((block) => block.id === selectedId));
  const errors = $derived(diagnostics.filter((item) => item.level === 'error'));
  const readyToSave = $derived(Boolean(title.trim() && summary.trim() && category.trim()));
  const saveStatus = $derived(
    busy
      ? 'Saving…'
      : dirty && !readyToSave
        ? 'Complete title, summary, and category to enable autosave.'
        : dirty
          ? 'Unsaved changes'
          : message || (storedSlug ? 'All changes saved' : 'Not saved yet')
  );
  const wordCount = $derived(outlineText(doc.blocks).trim().match(/\S+/g)?.length ?? 0);

  $effect(() => {
    if (selectedId && !doc.blocks.some((block) => block.id === selectedId)) selectedId = undefined;
  });
  async function select(id: BlockId) {
    selectedId = id;
    mode = 'write';
    panel = 'document';
    inspector = 'block';
    await tick();
    const element = document.getElementById(`editing-${id}`);
    element?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    element?.querySelector<HTMLElement>('textarea, input, select')?.focus({ preventScroll: true });
  }
  function outlineText(value: unknown): string {
    if (Array.isArray(value)) return value.map(outlineText).filter(Boolean).join(' ');
    if (!value || typeof value !== 'object') return '';
    const node = value as Record<string, unknown>;
    if (typeof node.value === 'string') return node.value;
    return ['data', 'content', 'children', 'items', 'title', 'description']
      .map((key) => outlineText(node[key]))
      .filter(Boolean)
      .join(' ');
  }
  function add(type: string) {
    const index = selectedIndex >= 0 ? selectedIndex + 1 : doc.blocks.length;
    editor.addBlock(type, index);
    const block = editor.document.blocks[index];
    if (!block) return;
    editor.setDocument({
      ...editor.document,
      blocks: editor.document.blocks.map((item) =>
        item.id === block.id
          ? { ...item, schemaVersion: registry.get(type)?.schemaVersion ?? 1 }
          : item
      )
    });
    void select(block.id);
  }
  async function finish(id: BlockId) {
    selectedId = undefined;
    await tick();
    document
      .getElementById(`editing-${id}`)
      ?.querySelector<HTMLElement>('.block-read-view')
      ?.focus({ preventScroll: true });
  }
  async function removeSelected() {
    if (!selected) return;
    const index = selectedIndex;
    editor.removeBlock(selected.id);
    const next = editor.document.blocks[Math.min(index, editor.document.blocks.length - 1)];
    if (next) await select(next.id);
    else {
      selectedId = undefined;
      panel = 'document';
      await tick();
      document.querySelector<HTMLElement>('.document-empty button')?.focus();
    }
  }
  function drop(id: BlockId) {
    if (!dragging || dragging === id) return;
    const blocks = [...doc.blocks];
    const from = blocks.findIndex((block) => block.id === dragging),
      to = blocks.findIndex((block) => block.id === id);
    if (from < 0 || to < 0) return;
    const [moved] = blocks.splice(from, 1);
    blocks.splice(to, 0, moved);
    editor.setDocument({ ...doc, blocks });
    dragging = undefined;
  }
  function showSettings(tab: 'block' | 'article') {
    panel = panel === 'settings' && inspector === tab ? 'document' : 'settings';
    inspector = tab;
  }
</script>

<div class="publishing-workspace" class:preview-mode={mode === 'preview'} data-panel={panel}>
  <header class="editor-topbar">
    <div class="editor-location">
      <button class="editor-back" disabled={busy} onclick={onback}
        ><span aria-hidden="true">←</span> Articles</button
      ><span class="location-divider" aria-hidden="true">/</span>
      <h1 class="workspace-title">Article editor</h1>
    </div>
    <div class="editor-primary-actions">
      <button class="editor-button secondary" disabled={busy} onclick={onsave}>Save</button><button
        class="editor-button primary"
        disabled={busy || errors.length > 0 || !readyToSave}
        onclick={onpublish}>{status === 'published' ? 'Update' : 'Publish'}</button
      >
    </div>
  </header>
  <div class="editor-toolbar">
    <nav class="editor-modes" aria-label="Editor mode">
      <button
        aria-pressed={mode === 'write' && panel === 'document'}
        onclick={() => {
          mode = 'write';
          panel = 'document';
        }}>Write</button
      ><button
        aria-pressed={mode === 'preview' && panel === 'document'}
        onclick={() => {
          mode = 'preview';
          panel = 'document';
          inspector = 'article';
        }}>Preview</button
      >
    </nav>
    <div class="editor-tools">
      <button
        class="outline-toggle"
        aria-pressed={panel === 'outline'}
        onclick={() => (panel = panel === 'outline' ? 'document' : 'outline')}>Outline</button
      ><button aria-pressed={panel === 'settings'} onclick={() => showSettings('article')}
        >Article settings</button
      >
    </div>
  </div>
  <div class="editor-statusbar">
    <span class="article-state">{status === 'published' ? 'Published' : 'Draft'}</span>
    <p role="status">{saveStatus}</p>
    <span class="document-count">{doc.blocks.length} blocks · {wordCount} words</span>
  </div>
  {#if error}<div class="editor-notice" role="alert">{error}</div>{/if}
  {#if errors.length > 0}<div class="editor-notice validation-notice">
      <p>
        Publishing needs attention: {errors.length} validation {errors.length === 1
          ? 'error'
          : 'errors'}.
      </p>
      <button
        class="block-settings-link"
        onclick={() => {
          inspector = 'article';
          panel = 'settings';
        }}>Review checks</button
      >
    </div>{/if}
  <div class="workspace-columns">
    <aside class="document-outline" aria-label="Document outline">
      <div class="panel-heading">
        <h2 class="sidebar-heading">Outline</h2>
        <span class="editor-help">{doc.blocks.length}</span>
      </div>
      <button
        class="outline-title"
        onclick={async () => {
          selectedId = undefined;
          inspector = 'article';
          panel = 'document';
          mode = 'write';
          await tick();
          document.getElementById('article-title')?.focus();
        }}>{title || 'Untitled article'}</button
      >
      {#if doc.blocks.length === 0}<p class="editor-help outline-empty">
          Your blocks will appear here as you write.
        </p>{/if}
      <ol class="outline-list">
        {#each doc.blocks as block, index (block.id)}
          <li
            draggable="true"
            ondragstart={() => (dragging = block.id)}
            ondragend={() => (dragging = undefined)}
            ondragover={(event) => event.preventDefault()}
            ondrop={(event) => {
              event.preventDefault();
              drop(block.id);
            }}
          >
            <button
              class:current={selectedId === block.id}
              aria-current={selectedId === block.id ? 'true' : undefined}
              onclick={() => select(block.id)}
              ><span class="outline-number">{String(index + 1).padStart(2, '0')}</span><span
                ><span class="outline-label">{labels[block.type] ?? block.type}</span><span
                  class="outline-description"
                  >{outlineText(block.data).split(/\s+/).slice(0, 10).join(' ') +
                    (outlineText(block.data).split(/\s+/).length > 10 ? '…' : '') ||
                    'No content yet'}</span
                ></span
              ></button
            >
          </li>
        {/each}
      </ol>
      <p class="outline-guidance editor-help">
        Select a block to edit. Drag to reorder, or use its move controls.
      </p>
    </aside>

    <section
      class="document-area"
      aria-label={mode === 'write' ? 'Article document' : 'Article preview'}
    >
      {#if mode === 'write'}
        <div class="document-sheet">
          <div class="document-heading">
            <p class="editor-kicker">Article</p>
            <label class="sr-only" for="article-title">Title</label><textarea
              id="article-title"
              class="document-title"
              bind:value={title}
              oninput={onchange}
              placeholder="Untitled article"
              rows="2"
              maxlength="200"></textarea><label class="sr-only" for="article-summary">Summary</label
            ><textarea
              id="article-summary"
              class="document-summary"
              bind:value={summary}
              oninput={onchange}
              placeholder="Add a short summary for your readers…"
              rows="2"
              maxlength="500"></textarea>
          </div>
          <div class="document-section-heading">
            <h2 class="content-heading">Content</h2>
            <span class="editor-help"
              >{selected ? 'Editing one block' : 'Select a block to start editing'}</span
            >
          </div>
          {#if doc.blocks.length === 0}<div class="document-empty">
              <h3>Start your article</h3>
              <p>Add a paragraph, heading, or another block to begin.</p>
              <button class="editor-button secondary" onclick={() => add('publisle:paragraph')}
                >Add paragraph</button
              >
            </div>{/if}
          <div class="document-blocks">
            {#each doc.blocks as block, index (block.id)}
              <section
                class="document-block"
                class:selected={selectedId === block.id}
                id={`editing-${block.id}`}
                aria-label={`${labels[block.type] ?? block.type} block ${index + 1}`}
              >
                <div class="document-block-label">
                  <span
                    >{String(index + 1).padStart(2, '0')} / {labels[block.type] ?? block.type}</span
                  >{#if selectedId === block.id}<button
                      class="block-done"
                      onclick={() => finish(block.id)}>Done</button
                    >{/if}
                </div>
                {#if selectedId === block.id}
                  <div class="focused-block-editor">
                    <BlockEditor
                      {block}
                      {extensions}
                      onRemove={removeSelected}
                      onMove={(id, direction) => editor.moveBlock(id, direction)}
                      onUpdate={(id, data) => editor.updateBlock(id, data)}
                    />
                  </div>
                  {#if block.type === 'voidreg:counter'}<SchemaPayload
                      schema={counterDefinition.descriptor.payloadSchema}
                      value={(block.data as { payload: Record<string, unknown> }).payload}
                      onchange={(payload) =>
                        editor.updateBlock(block.id, { ...(block.data as object), payload })}
                    />{/if}
                  <div class="block-footer">
                    <span class="editor-help"
                      >{readyToSave
                        ? 'Changes save automatically.'
                        : 'Complete article details to enable autosave.'}</span
                    ><button
                      class="block-settings-link"
                      onclick={() => {
                        inspector = 'block';
                        panel = 'settings';
                      }}>Block settings</button
                    >
                  </div>
                {:else}
                  <button
                    class="block-read-view"
                    aria-label={`Edit ${labels[block.type] ?? block.type} block ${index + 1}`}
                    onclick={() => select(block.id)}><BlockSummary {block} /></button
                  >
                {/if}
              </section>
            {/each}
          </div>
          <div class="document-insert">
            <BlockInserter oninsert={add} />
            <p class="editor-help">
              {selected ? 'Inserts after the selected block.' : 'Adds to the end of your article.'}
            </p>
          </div>
        </div>
      {:else}
        <div class="document-sheet article-preview">
          <div class="preview-label">
            <p class="editor-kicker">Reader preview</p>
            <span class="editor-help">{category || 'Uncategorized'}</span>
          </div>
          <h2 class="preview-article-title">{title || 'Untitled article'}</h2>
          <p class="preview-summary">{summary || 'Add a summary in Write mode.'}</p>
          {#if errors.length}<div class="editor-notice">
              Resolve document errors to preview.
            </div>{:else if previewArticle.compiled}<ArticleBody article={previewArticle} />{/if}
        </div>
      {/if}
    </section>

    <aside class="editor-inspector" aria-label="Editor settings">
      <div class="inspector-tabs" aria-label="Settings category">
        <button aria-pressed={inspector === 'article'} onclick={() => (inspector = 'article')}
          >Article</button
        ><button
          aria-pressed={inspector === 'block'}
          disabled={!selected}
          onclick={() => (inspector = 'block')}>Block</button
        >
      </div>
      {#if inspector === 'block' && selected}
        <section class="inspector-section">
          <p class="editor-kicker">Selected block</p>
          <h2 class="sidebar-heading">{labels[selected.type] ?? selected.type}</h2>
          <p class="editor-help">Block {selectedIndex + 1} of {doc.blocks.length}</p>
          <div class="block-position-controls">
            <button
              class="editor-button secondary"
              disabled={selectedIndex <= 0}
              onclick={() => editor.moveBlock(selected!.id, 'up')}>Move up</button
            ><button
              class="editor-button secondary"
              disabled={selectedIndex === doc.blocks.length - 1}
              onclick={() => editor.moveBlock(selected!.id, 'down')}>Move down</button
            >
          </div>
          <button
            class="editor-button secondary"
            onclick={() => {
              panel = 'document';
              void select(selected!.id);
            }}>Edit content</button
          >
        </section>
        <section class="inspector-section">
          <details class="inspector-details">
            <summary>Advanced block data</summary><label class="editor-field"
              >Block JSON<textarea
                aria-label={`JSON data for ${selected.type}`}
                rows="12"
                value={JSON.stringify(selected.data, null, 2)}
                onchange={(event) => {
                  try {
                    editor.updateBlock(selected!.id, JSON.parse(event.currentTarget.value));
                  } catch {
                    event.currentTarget.setCustomValidity('Enter valid JSON.');
                    event.currentTarget.reportValidity();
                  }
                }}
                oninput={(event) => event.currentTarget.setCustomValidity('')}></textarea></label
            >
          </details>
        </section>
        <section class="inspector-section">
          <button class="editor-button danger" onclick={removeSelected}>Remove block</button>
          <p class="editor-help">Removes this block from the article.</p>
        </section>
      {:else}
        <form
          class="inspector-section"
          oninput={onchange}
          onsubmit={(event) => {
            event.preventDefault();
            void onsave();
          }}
        >
          <h2 class="sidebar-heading">Article details</h2>
          <label class="editor-field"
            >Category<input
              bind:value={category}
              maxlength="80"
              placeholder="Choose a category"
              required
            /></label
          ><label class="editor-field"
            >Slug<input
              bind:value={slug}
              readonly={!!storedSlug}
              placeholder="Generated from title"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
            /></label
          >
          <p class="editor-help">
            {storedSlug
              ? 'The URL is fixed after the first save.'
              : 'Leave blank to use the article title.'}
          </p>
          <label class="editor-checkbox"
            ><input type="checkbox" bind:checked={featured} />Feature this article</label
          ><label class="editor-field"
            >Sort order<input type="number" bind:value={sortOrder} step="1" /></label
          >
        </form>
        <section class="inspector-section">
          <h2 class="sidebar-heading">Publishing check</h2>
          <ul class="publishing-checks">
            <li>{title.trim() ? '✓' : '○'} Title</li>
            <li>{summary.trim() ? '✓' : '○'} Summary</li>
            <li>{category.trim() ? '✓' : '○'} Category</li>
            <li>
              {errors.length === 0 ? '✓ Ready to compile' : `${errors.length} validation errors`}
            </li>
          </ul>
          {#each diagnostics as diagnostic, index (index)}<p class="inspector-diagnostic">
              {diagnostic.level}: {diagnostic.message}
            </p>{/each}
        </section>
        <section class="inspector-section">
          <details class="inspector-details">
            <summary>Import and export</summary>
            <div class="inspector-fields">
              <label class="editor-field"
                >Format<select bind:value={importFormat}
                  ><option value="markdown">Markdown</option><option value="json"
                    >Publisle JSON</option
                  ></select
                ></label
              ><label class="editor-field"
                >Document<textarea rows="8" bind:value={importText}></textarea></label
              ><button
                class="editor-button secondary"
                onclick={() => onimport(importText, importFormat)}>Import document</button
              >
              <div class="export-actions">
                <button class="editor-button secondary" onclick={() => onexport('json')}
                  >Export JSON</button
                ><button class="editor-button secondary" onclick={() => onexport('markdown')}
                  >Export Markdown</button
                >
              </div>
            </div>
          </details>
        </section>
        {#if storedSlug}<section class="inspector-section">
            <details class="inspector-details">
              <summary>Article actions</summary>
              <div class="inspector-fields">
                <button
                  class="editor-button secondary"
                  disabled={busy || status === 'draft'}
                  onclick={onunpublish}>Unpublish article</button
                ><button class="editor-button danger" disabled={busy} onclick={ondelete}
                  >Delete article</button
                >
              </div>
            </details>
          </section>{/if}
      {/if}
      <button
        class="return-to-document editor-button secondary"
        onclick={() => (panel = 'document')}>Back to document</button
      >
    </aside>
  </div>
</div>
