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
  import { blockDefinitions, extensions, registry } from '@voidreg/authoring/blocks';
  import BlockPayloadEditor from './BlockPayloadEditor.svelte';
  import OutlinePanel from './OutlinePanel.svelte';
  import HistoryPanel from './HistoryPanel.svelte';
  import SaveStatus from './SaveStatus.svelte';
  import LivePreview from './LivePreview.svelte';
  import ShortcutSheet from './ShortcutSheet.svelte';
  import ImportDialog from './ImportDialog.svelte';
  import Tabs from '$lib/ui/Tabs.svelte';
  import { outlineText } from './outline-text';
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
    serverRevision: number;
    saveFailures: number;
    savedAt: Date | null;
    onreload: () => unknown;
    message: string;
    error: string;
    diagnostics: readonly Diagnostic[];
    previewArticle: Article;
    previewExact: boolean;
    rendering: boolean;
    onrender: () => unknown;
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
    serverRevision,
    saveFailures,
    savedAt,
    onreload,
    message,
    error,
    diagnostics,
    previewArticle,
    previewExact,
    rendering,
    onrender,
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
  const labels = blockLabels(extensions);
  const selected = $derived(doc.blocks.find((block) => block.id === selectedId));
  const selectedIndex = $derived(doc.blocks.findIndex((block) => block.id === selectedId));
  const errors = $derived(diagnostics.filter((item) => item.level === 'error'));
  let shortcutsOpen = $state(false);
  let importOpen = $state(false);
  // Side by side preview needs the wide layout (matches the 80rem container breakpoint).
  let wide = $state(false);
  $effect(() => {
    const query = window.matchMedia('(min-width: 80rem)');
    const update = () => (wide = query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  });
  // Panels such as Settings hide the document, which clamps the page scroll. Remember the position
  // of each view when leaving it and put it back on return, so editing resumes where it stopped.
  const positions = new Map<string, number>();
  const viewKey = () => `${mode}:${panel}`;
  let shownKey = viewKey();
  let skipRestore = false;
  let restoring = false;
  function go(changes: Partial<EditorView>) {
    positions.set(viewKey(), window.scrollY);
    return onnavigate(changes);
  }
  $effect(() => {
    const key = `${mode}:${panel}`;
    if (key === shownKey) return;
    shownKey = key;
    if (skipRestore) {
      skipRestore = false;
      return;
    }
    const top = positions.get(key);
    if (top === undefined) return;
    restoring = true;
    void tick().then(() =>
      requestAnimationFrame(() => {
        window.scrollTo({ top, behavior: 'instant' });
        // The scroll event fires after this frame; keep the preview sync quiet for it.
        setTimeout(() => (restoring = false), 120);
      })
    );
  });
  const blockIds = $derived(doc.blocks.map((block) => block.id));
  let scrolledTo = $state<string | null>(null);
  const syncTarget = $derived(selectedId ?? scrolledTo);
  let frame = 0;
  function trackScroll() {
    if (panel !== 'preview' || !wide || frame || restoring) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const limit =
        (document.querySelector('.editor-toolbar')?.getBoundingClientRect().bottom ?? 0) + 24;
      for (const element of document.querySelectorAll<HTMLElement>('.document-block')) {
        if (element.getBoundingClientRect().bottom > limit) {
          scrolledTo = element.id.replace(/^editing-/, '');
          return;
        }
      }
    });
  }
  let moreOpen = $state(false);
  function menuAction(run: () => unknown) {
    moreOpen = false;
    void run();
  }
  function outsideMenu(event: MouseEvent) {
    if (moreOpen && !(event.target as HTMLElement).closest?.('.editor-more')) moreOpen = false;
  }
  const wordCount = $derived(outlineText(doc.blocks).trim().match(/\S+/g)?.length ?? 0);

  // The site app serves private draft previews under /preview (admin session required).
  function openSitePreview() {
    window.open(
      `/preview/${kind === 'projects' ? 'projects' : 'blog'}/${encodeURIComponent(storedSlug)}`,
      '_blank',
      'noopener'
    );
  }

  async function select(id: BlockId) {
    // The block scrolls itself into view below, so a remembered position must not override it.
    const target = panel === 'preview' && wide ? 'preview' : 'document';
    if (`write:${target}` !== viewKey()) skipRestore = true;
    await go({
      mode: 'write',
      panel: panel === 'preview' && wide ? 'preview' : 'document',
      inspector: 'block',
      block: id
    });
    await tick();
    const element = document.getElementById(`editing-${id}`);
    element?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    element?.querySelector<HTMLElement>('textarea, input, select')?.focus({ preventScroll: true });
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
    await go({ block: null });
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
      await go({ panel: 'document', block: null });
      await tick();
      document.querySelector<HTMLElement>('.document-empty button')?.focus();
    }
  }
  function reorder(from: BlockId, to: BlockId) {
    const blocks = [...doc.blocks];
    const a = blocks.findIndex((block) => block.id === from),
      b = blocks.findIndex((block) => block.id === to);
    if (a < 0 || b < 0) return;
    const [moved] = blocks.splice(a, 1);
    blocks.splice(b, 0, moved);
    editor.setDocument({ ...doc, blocks });
  }
  function inField(target: EventTarget | null) {
    const el = target as HTMLElement | null;
    return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  }
  function keydown(event: KeyboardEvent) {
    const mod = event.ctrlKey || event.metaKey;
    if (event.key === 'Escape' && moreOpen) {
      moreOpen = false;
      document.querySelector<HTMLElement>('.editor-more > summary')?.focus();
    } else if (mod && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (!busy && !conflict) void onsave();
    } else if (mod && event.key === 'Enter') {
      event.preventDefault();
      if (!busy && !conflict && errors.length === 0) void onpublish();
    } else if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown') && selected) {
      if (inField(event.target) || (event.target as HTMLElement).closest?.('.document-block')) {
        event.preventDefault();
        editor.moveBlock(selected.id, event.key === 'ArrowUp' ? 'up' : 'down');
      }
    } else if (event.key === '?' && !mod && !inField(event.target)) {
      event.preventDefault();
      shortcutsOpen = true;
    }
  }
  function showSettings(tab: 'block' | 'article' | 'history') {
    void go({
      panel: panel === 'settings' && inspector === tab ? 'document' : 'settings',
      inspector: tab
    });
  }
</script>

<svelte:window onkeydown={keydown} onclick={outsideMenu} onscroll={trackScroll} />
<ShortcutSheet bind:open={shortcutsOpen} />
<ImportDialog bind:open={importOpen} {onimport} />

<div
  class="publishing-workspace"
  class:preview-mode={mode === 'preview'}
  class:settings-visible={panel === 'settings' ||
    (panel !== 'preview' && inspector === 'block' && !!selected)}
  class:preview-visible={panel === 'preview'}
  data-panel={panel}
>
  <header class="editor-topbar">
    <div class="editor-location">
      <button class="editor-back" disabled={busy} onclick={onback}
        ><Icon name="arrow-left" size={16} />
        <span>{kind === 'projects' ? 'Projects' : 'Articles'}</span></button
      ><span class="location-divider" aria-hidden="true">/</span>
      <h1 class="workspace-title">{kind === 'projects' ? 'Project editor' : 'Article editor'}</h1>
    </div>
    <div class="editor-primary-actions">
      <button
        class="editor-button secondary"
        disabled={busy || conflict}
        title="Shortcut: Ctrl or Cmd + S"
        onclick={onsave}>Save</button
      ><button
        class="editor-button primary"
        disabled={busy || conflict || errors.length > 0}
        title="Shortcut: Ctrl or Cmd + Enter"
        onclick={onpublish}>{status === 'published' ? 'Update' : 'Publish'}</button
      >
      <details class="ui-menu editor-more" bind:open={moreOpen}>
        <summary class="editor-button secondary" aria-label="More actions"
          ><Icon name="more" size={18} /><span class="editor-more-label">More</span></summary
        >
        <div class="ui-menu-list">
          <button
            type="button"
            disabled={busy || conflict || dirty || !storedSlug}
            title={dirty || !storedSlug
              ? 'Save first to preview the saved draft on the site'
              : 'Open the saved draft on the site in a new tab'}
            onclick={() => menuAction(openSitePreview)}>Site preview</button
          >
          <button type="button" onclick={() => menuAction(() => (importOpen = true))}
            >Import document</button
          >
          <button type="button" onclick={() => menuAction(() => onexport('json'))}
            >Export JSON</button
          >
          <button type="button" onclick={() => menuAction(() => onexport('markdown'))}
            >Export Markdown</button
          >
          <button type="button" onclick={() => menuAction(() => (shortcutsOpen = true))}
            >Keyboard shortcuts</button
          >
          {#if storedSlug}
            <button
              type="button"
              disabled={busy || conflict || status === 'draft'}
              onclick={() => menuAction(onunpublish)}
              >Unpublish {kind === 'projects' ? 'project' : 'article'}</button
            ><button
              type="button"
              class="danger"
              disabled={busy || conflict}
              onclick={() => menuAction(ondelete)}
              >Delete {kind === 'projects' ? 'project' : 'article'}</button
            >
          {/if}
        </div>
      </details>
    </div>
  </header>
  <div class="editor-toolbar">
    <Tabs
      class="editor-modes"
      label="Editor mode"
      idPrefix="editor-mode"
      value={mode}
      tabs={[
        { id: 'write', label: 'Write' },
        { id: 'preview', label: 'Preview' }
      ]}
      onselect={(id) =>
        go(
          id === 'write'
            ? { mode: 'write', panel: 'document' }
            : { mode: 'preview', panel: 'document', inspector: 'article' }
        )}
    />
    <div class="editor-tools" role="group" aria-label="Side panels">
      <button
        class="outline-toggle"
        aria-pressed={panel === 'outline'}
        onclick={() => go({ panel: panel === 'outline' ? 'document' : 'outline' })}>Outline</button
      ><button
        aria-pressed={panel === 'settings' && inspector === 'article'}
        onclick={() => showSettings('article')}>Settings</button
      ><button
        aria-pressed={panel === 'settings' && inspector === 'history'}
        disabled={!storedSlug}
        onclick={() => showSettings('history')}>History</button
      ><button
        class="preview-toggle"
        aria-pressed={panel === 'preview'}
        disabled={mode === 'preview'}
        onclick={() => go({ panel: panel === 'preview' ? 'document' : 'preview' })}
        >Live preview</button
      >
    </div>
  </div>
  <div class="editor-statusbar">
    <span class="article-state">{status === 'published' ? 'Published' : 'Draft'}</span>
    <SaveStatus
      {conflict}
      {busy}
      {dirty}
      failures={saveFailures}
      {savedAt}
      stored={!!storedSlug}
      {message}
      onretry={onsave}
    />
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
          void go({ inspector: 'article', panel: 'settings' });
        }}>Review checks</button
      >
    </div>{/if}
  <div class="workspace-columns">
    <OutlinePanel
      blocks={doc.blocks}
      {labels}
      {selectedId}
      {diagnostics}
      title={title || (kind === 'projects' ? 'Untitled project' : 'Untitled article')}
      onselect={select}
      onmove={(id, direction) => editor.moveBlock(id, direction)}
      onreorder={reorder}
      ontitle={async () => {
        await go({ inspector: 'article', panel: 'document', mode: 'write', block: null });
        await tick();
        document.getElementById('article-title')?.focus();
      }}
    />

    <div
      class="document-area"
      id="editor-mode-panel"
      role="tabpanel"
      aria-labelledby={`editor-mode-tab-${mode}`}
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
                  {#each diagnostics.filter((d) => d.blockId === block.id) as diagnostic, n (n)}
                    <button
                      class={`block-validation-error validation-error-link ${diagnostic.level}`}
                      onclick={() => select(block.id)}
                      ><span class="diagnostic-level"
                        >{diagnostic.level === 'error' ? 'Error' : 'Note'}</span
                      >{diagnostic.message}</button
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
                    {#each diagnostics.filter((d) => d.blockId === block.id && !(block.type === 'publisle:math' && d.code === 'invalid-math')) as diagnostic, n (n)}
                      <p
                        class={`block-validation-error ${diagnostic.level}`}
                        role={diagnostic.level === 'error' ? 'alert' : undefined}
                      >
                        <span class="diagnostic-level"
                          >{diagnostic.level === 'error' ? 'Error' : 'Note'}</span
                        >{diagnostic.message}
                      </p>
                    {/each}
                  </div>
                  {#if blockDefinitions.some((item) => item.type === block.type)}<BlockPayloadEditor
                      type={block.type}
                      value={(block.data as { payload: Record<string, unknown> }).payload}
                      onchange={(payload) =>
                        editor.updateBlock(block.id, { ...(block.data as object), payload })}
                    />{/if}
                  <div class="block-footer">
                    <span class="editor-help">Changes save as a draft. Update publishes them.</span
                    ><button
                      class="block-settings-link"
                      onclick={() => {
                        void go({ inspector: 'block', panel: 'settings' });
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
          <div class="preview-reading-column">
            <header class="preview-reading-header">
              <div class="preview-label">
                <p class="editor-kicker">Reader preview</p>
                <span class="editor-help">{category || 'Uncategorized'}</span>
              </div>
              <h2 class="preview-article-title">
                {title || (kind === 'projects' ? 'Untitled project' : 'Untitled article')}
              </h2>
              <p class="preview-summary">{summary || 'Add a summary in Write mode.'}</p>
            </header>
          </div>
          {#if errors.length}<div class="editor-notice">
              Resolve document errors to preview.
            </div>{:else if previewArticle.compiled}<ArticleBody article={previewArticle} />{/if}
        </div>
      {/if}
    </div>

    {#if panel === 'preview'}
      <LivePreview
        article={previewArticle}
        {diagnostics}
        {blockIds}
        target={syncTarget}
        exact={previewExact}
        {rendering}
        scrolls={wide}
        onpick={(id) => select(id as BlockId)}
        {onrender}
      />
    {/if}
    <aside class="editor-inspector" aria-label="Editor settings">
      <Tabs
        class="inspector-tabs"
        label="Settings category"
        idPrefix="inspector"
        value={inspector}
        tabs={[
          { id: 'article', label: kind === 'projects' ? 'Project' : 'Article' },
          { id: 'block', label: 'Block', disabled: !selected },
          { id: 'history', label: 'History', disabled: !storedSlug }
        ]}
        onselect={(id) =>
          go({ inspector: id as 'article' | 'block' | 'history', panel: 'settings' })}
      />
      <div id="inspector-panel" role="tabpanel" aria-labelledby={`inspector-tab-${inspector}`}>
        {#if inspector === 'history' && storedSlug}
          <HistoryPanel
            {kind}
            slug={storedSlug}
            {serverRevision}
            {dirty}
            {onsave}
            onrestored={onreload}
          />
        {:else if inspector === 'block' && selected}
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
        {/if}
      </div>
      <button
        class="return-to-document editor-button secondary"
        onclick={() => go({ panel: 'document' })}>Back to document</button
      >
    </aside>
  </div>
</div>
