<script lang="ts">
  import type { EditorView } from '$lib/navigation';
  import Icon from '$lib/components/Icon.svelte';
  import { tick, type Snippet } from 'svelte';
  import { blockLabels, type DocumentEditor } from '@publisle/playground';
  import BlockEditor from '@publisle/playground/BlockEditor.svelte';
  import MathBlockEditor from '@publisle/playground/MathBlockEditor.svelte';
  import type { Document, Diagnostic, BlockId } from '@publisle/schema';
  import ArticleBody from '@voidreg/publishing-ui/ArticleBody.svelte';
  import type { Article } from '@voidreg/publishing-ui/api';
  import SchemaPayload from '$lib/SchemaPayload.svelte';
  import { counterDefinition, extensions, registry } from '@voidreg/authoring/blocks';
  import BlockSummary from './BlockSummary.svelte';
  import BlockInserter from './BlockInserter.svelte';
  import './workspace.css';

  interface Props {
    kind?: string;
    mode: EditorView['mode'];
    panel: EditorView['panel'];
    inspector: EditorView['inspector'];
    selectedBlock: string | null;
    onnavigate: (view: Partial<EditorView>) => Promise<void>;
    settings?: Snippet;
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
    conflict: boolean;
    onreload: () => unknown;
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
    kind = 'articles',
    mode,
    panel,
    inspector,
    selectedBlock,
    onnavigate,
    settings,
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
    conflict,
    onreload,
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
  const selectedId = $derived(doc.blocks.find((block) => block.id === selectedBlock)?.id);
  let dragging = $state<BlockId | undefined>();
  let importText = $state(''),
    importFormat = $state('markdown');
  const labels = blockLabels(extensions);
  const selected = $derived(doc.blocks.find((block) => block.id === selectedId));
  const selectedIndex = $derived(doc.blocks.findIndex((block) => block.id === selectedId));
  const errors = $derived(diagnostics.filter((item) => item.level === 'error'));
  const readyToSave = $derived(true);
  const saveStatus = $derived(
    conflict
      ? 'Autosave paused. Resolve the editing conflict.'
      : busy
        ? 'Saving...'
        : dirty && !readyToSave
          ? 'Complete title, summary, and category to enable autosave.'
          : dirty
            ? 'Unsaved changes'
            : message || (storedSlug ? 'All changes saved' : 'Not saved yet')
  );
  const wordCount = $derived(outlineText(doc.blocks).trim().match(/\S+/g)?.length ?? 0);

  async function select(id: BlockId) {
    await onnavigate({ mode: 'write', panel: 'document', inspector: 'block', block: id });
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
    await onnavigate({ block: null });
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
      await onnavigate({ panel: 'document', block: null });
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
    void onnavigate({
      panel: panel === 'settings' && inspector === tab ? 'document' : 'settings',
      inspector: tab
    });
  }
</script>

<div
  class="publishing-workspace"
  class:preview-mode={mode === 'preview'}
  class:settings-visible={panel === 'settings' || (inspector === 'block' && !!selected)}
  data-panel={panel}
>
  <header class="editor-topbar">
    <div class="editor-location">
      <button class="editor-back" disabled={busy} onclick={onback}
        ><Icon name="arrow-left" size={16} />
        {kind === 'projects' ? 'Projects' : 'Articles'}</button
      ><span class="location-divider" aria-hidden="true">/</span>
      <h1 class="workspace-title">{kind === 'projects' ? 'Project editor' : 'Article editor'}</h1>
    </div>
    <div class="editor-primary-actions">
      <button class="editor-button secondary" disabled={busy || conflict} onclick={onsave}
        >Save</button
      ><button
        class="editor-button primary"
        disabled={busy || conflict || errors.length > 0 || !readyToSave}
        onclick={onpublish}>{status === 'published' ? 'Update' : 'Publish'}</button
      >
    </div>
  </header>
  <div class="editor-toolbar">
    <nav class="editor-modes" aria-label="Editor mode">
      <button
        aria-pressed={mode === 'write' && panel === 'document'}
        onclick={() => {
          void onnavigate({ mode: 'write', panel: 'document' });
        }}>Write</button
      ><button
        aria-pressed={mode === 'preview' && panel === 'document'}
        onclick={() => {
          void onnavigate({ mode: 'preview', panel: 'document', inspector: 'article' });
        }}>Preview</button
      >
    </nav>
    <div class="editor-tools">
      <button
        class="outline-toggle"
        aria-pressed={panel === 'outline'}
        onclick={() => onnavigate({ panel: panel === 'outline' ? 'document' : 'outline' })}
        >Outline</button
      ><button
        aria-pressed={panel === 'settings' && inspector === 'article'}
        onclick={() => showSettings('article')}
        >{kind === 'projects' ? 'Project settings' : 'Article settings'}</button
      >
    </div>
  </div>
  <div class="editor-statusbar">
    <span class="article-state">{status === 'published' ? 'Published' : 'Draft'}</span>
    <p role="status">{saveStatus}</p>
    <span class="document-count">{doc.blocks.length} blocks | {wordCount} words</span>
  </div>
  {#if conflict}
    <section class="editor-notice" aria-label="Resolve editing conflict">
      <p>Export your local edits, then reload the saved article to continue.</p>
      <div class="button-row">
        <button class="button button-secondary" onclick={() => onexport('json')}
          >Export local edits</button
        >
        <button class="button button-secondary" disabled={busy} onclick={onreload}
          >Reload saved article</button
        >
      </div>
    </section>
  {/if}
  {#if error}<div class="editor-notice" role="alert">{error}</div>{/if}
  {#if errors.length > 0}<div class="editor-notice validation-notice">
      <p>
        Publishing needs attention: {errors.length} validation {errors.length === 1
          ? 'error'
          : 'errors'}.
      </p>
      <ul class="validation-error-list">
        {#each errors as diagnostic}
          <li>
            <button
              class="validation-error-link"
              onclick={() => {
                if (diagnostic.blockId) void select(diagnostic.blockId as BlockId);
              }}
              >{diagnostic.blockId
                ? 'Block ' + (doc.blocks.findIndex((b) => b.id === diagnostic.blockId) + 1) + ': '
                : ''}{diagnostic.message}</button
            >
          </li>
        {/each}
      </ul>
      <button
        class="block-settings-link"
        onclick={() => {
          void onnavigate({ inspector: 'article', panel: 'settings' });
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
          await onnavigate({ inspector: 'article', panel: 'document', mode: 'write', block: null });
          await tick();
          document.getElementById('article-title')?.focus();
        }}>{title || (kind === 'projects' ? 'Untitled project' : 'Untitled article')}</button
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
                  >{outlineText(block.data).slice(0, 80) +
                    (outlineText(block.data).length > 80 ? '...' : '') || 'No content yet'}</span
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
            <p class="editor-kicker">{kind === 'projects' ? 'Project' : 'Article'}</p>
            <label class="sr-only" for="article-title">Title</label><textarea
              id="article-title"
              class="document-title"
              bind:value={title}
              oninput={onchange}
              placeholder={kind === 'projects' ? 'Untitled project' : 'Untitled article'}
              rows="2"
              maxlength="200"></textarea><label class="sr-only" for="article-summary">Summary</label
            ><textarea
              id="article-summary"
              class="document-summary"
              bind:value={summary}
              oninput={onchange}
              placeholder="Add a short summary for your readers..."
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
              <h3>Start your {kind === 'projects' ? 'project' : 'article'}</h3>
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
                {#if selectedId !== block.id}
                  {#each diagnostics.filter((d) => d.blockId === block.id && d.level === 'error') as diagnostic}
                    <button
                      class="block-validation-error validation-error-link"
                      onclick={() => select(block.id)}>{diagnostic.message}</button
                    >
                  {/each}
                {/if}
                {#if selectedId === block.id}
                  <div
                    class="focused-block-editor"
                    onscrollcapture={(event) => {
                      const input = event.target as HTMLTextAreaElement;
                      if (input.matches?.('.math-editor__input')) {
                        const highlight =
                          input.parentElement?.querySelector<HTMLElement>(
                            '.math-editor__highlight'
                          );
                        if (highlight) {
                          highlight.scrollTop = input.scrollTop;
                          highlight.scrollLeft = input.scrollLeft;
                        }
                      }
                    }}
                  >
                    {#if block.type === 'publisle:math'}
                      <MathBlockEditor
                        {block}
                        onUpdate={(id, data) => editor.updateBlock(id, data)}
                      />
                    {:else}
                      <BlockEditor
                        {block}
                        {extensions}
                        onRemove={removeSelected}
                        onMove={(id, direction) => editor.moveBlock(id, direction)}
                        onUpdate={(id, data) => editor.updateBlock(id, data)}
                      />
                    {/if}
                    {#each diagnostics.filter((d) => d.blockId === block.id && d.level === 'error' && !(block.type === 'publisle:math' && d.code === 'invalid-math')) as diagnostic}
                      <p class="block-validation-error" role="alert">{diagnostic.message}</p>
                    {/each}
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
                        ? 'Changes save as a draft. Update publishes them.'
                        : 'Complete article details to enable autosave.'}</span
                    ><button
                      class="block-settings-link"
                      onclick={() => {
                        void onnavigate({ inspector: 'block', panel: 'settings' });
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
              {selected ? 'Inserts after the selected block.' : 'Adds to the end of your document.'}
            </p>
          </div>
        </div>
      {:else}
        <div class="document-sheet article-preview">
          <div class="preview-label">
            <p class="editor-kicker">Reader preview</p>
            <span class="editor-help">{category || 'Uncategorized'}</span>
          </div>
          <h2 class="preview-article-title">
            {title || (kind === 'projects' ? 'Untitled project' : 'Untitled article')}
          </h2>
          <p class="preview-summary">{summary || 'Add a summary in Write mode.'}</p>
          {#if errors.length}<div class="editor-notice">
              Resolve document errors to preview.
            </div>{:else if previewArticle.compiled}<ArticleBody article={previewArticle} />{/if}
        </div>
      {/if}
    </section>

    <aside class="editor-inspector" aria-label="Editor settings">
      <div class="inspector-tabs" aria-label="Settings category">
        <button
          aria-pressed={inspector === 'article'}
          onclick={() => {
            void onnavigate({ inspector: 'article', panel: 'settings' });
          }}>{kind === 'projects' ? 'Project' : 'Article'}</button
        ><button
          aria-pressed={inspector === 'block'}
          disabled={!selected}
          onclick={() => onnavigate({ inspector: 'block', panel: 'settings' })}>Block</button
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
          <p class="editor-help">Removes this block from the document.</p>
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
          <h2 class="sidebar-heading">Publishing details</h2>
          <label class="editor-field"
            >Category<input
              bind:value={category}
              maxlength="80"
              placeholder="Choose a category"
            /></label
          >
          <div class="editor-field-group">
            <label class="editor-field"
              >Slug<input
                bind:value={slug}
                placeholder="Generated from title"
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
              /></label
            >
            <p class="editor-help">
              {storedSlug
                ? 'URL changes take effect on Publish or Update. Previous URLs redirect automatically.'
                : 'Leave blank to use the article title.'}
            </p>
          </div>
          <label class="editor-checkbox"
            ><input type="checkbox" bind:checked={featured} />Feature this {kind === 'projects'
              ? 'project'
              : 'article'}</label
          ><label class="editor-field"
            >Sort order<input type="number" bind:value={sortOrder} step="1" /></label
          >
        </form>
        {#if settings}{@render settings()}{/if}
        <section class="inspector-section">
          <h2 class="sidebar-heading">Publishing check</h2>
          <ul class="publishing-checks">
            <li>{title.trim() ? 'Title provided' : 'Title missing'}</li>
            <li>{summary.trim() ? 'Summary provided' : 'Summary missing'}</li>
            <li>Category is optional</li>
            <li>
              {errors.length === 0 ? 'Ready to compile' : `${errors.length} validation errors`}
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
              <summary>Content actions</summary>
              <div class="inspector-fields">
                <button
                  class="editor-button secondary"
                  disabled={busy || conflict || status === 'draft'}
                  onclick={onunpublish}
                  >Unpublish {kind === 'projects' ? 'project' : 'article'}</button
                ><button class="editor-button danger" disabled={busy || conflict} onclick={ondelete}
                  >Delete {kind === 'projects' ? 'project' : 'article'}</button
                >
              </div>
            </details>
          </section>{/if}
      {/if}
      <button
        class="return-to-document editor-button secondary"
        onclick={() => onnavigate({ panel: 'document' })}>Back to document</button
      >
    </aside>
  </div>
</div>
