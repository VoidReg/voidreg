<script lang="ts">
  import { onMount } from 'svelte';
  import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
  import { page } from '$app/state';
  import { adminRoute, adminUrl, editorIdentity, type EditorView } from '$lib/navigation';
  import { DocumentEditor } from '@publisle/playground';
  import type { PublicationArtifact } from '@publisle/adapter-core';
  import { parseDocument, type Document, type Diagnostic } from '@publisle/schema';
  import { compileDocument, importMarkdown, readingMarkdown } from '@voidreg/authoring';
  import ContentSettings from '$lib/ContentSettings.svelte';
  import AdminShell from '$lib/AdminShell.svelte';
  import LoginScreen from '$lib/LoginScreen.svelte';
  import ContentList from '$lib/ContentList.svelte';
  import { session } from '$lib/session.svelte';
  import { confirmDialog } from '$lib/ui/confirm.svelte';
  import { notify } from '$lib/ui/toast.svelte';
  import MediaLibrary from '$lib/MediaLibrary.svelte';
  import ModerationDashboard from '$lib/ModerationDashboard.svelte';
  import type { ContentMeta } from '@voidreg/publishing-ui/api';
  import McpConnections from '$lib/McpConnections.svelte';
  import type { Article } from '@voidreg/publishing-ui/api';
  import { ApiError, adminRequest } from '$lib/api';
  import EditorWorkspace from '$lib/editor/EditorWorkspace.svelte';
  import { extensions, registry } from '@voidreg/authoring/blocks';

  let error = $state(''),
    message = $state(''),
    busy = $state(false);
  let tab = $state<'articles' | 'projects' | 'media' | 'comments' | 'mcp'>('articles'),
    editing = $state(false),
    storedSlug = $state('');
  let editorView = $state<EditorView>({
    mode: 'write',
    panel: 'document',
    inspector: 'article',
    block: null
  });
  let loadedEditor = '';
  let routeRequest = 0;
  let routeLoading = $state(false);
  function navigate(changes: Record<string, string | number | null | undefined>, replace = false) {
    return goto(adminUrl(page.url, changes), {
      replaceState: replace,
      reset: false
    });
  }
  function editorLink(item?: Article) {
    return adminUrl(page.url, {
      article: contentKind === 'articles' ? item?.slug : null,
      project: contentKind === 'projects' ? item?.slug : null,
      new: item ? null : '1',
      mode: null,
      panel: null,
      inspector: null,
      block: null
    });
  }
  function backToList() {
    return navigate({
      article: null,
      project: null,
      new: null,
      mode: null,
      panel: null,
      inspector: null,
      block: null
    });
  }
  async function navigateView(view: Partial<EditorView>) {
    await navigate(view);
  }
  async function applyRoute() {
    if (!session.loggedIn) return;
    const request = ++routeRequest;
    const route = adminRoute(page.url);
    const identity = editorIdentity(page.url);
    routeLoading = true;
    error = '';
    try {
      if (identity !== loadedEditor) busy = false;
      tab = route.tab;
      editorView = {
        mode: route.mode,
        panel: route.panel,
        inspector: route.inspector,
        block: route.block
      };
      if (route.editing) {
        if (loadedEditor !== identity) {
          editing = false;
          savedRevision = revision;
          const opened = await open(
            route.item ? ({ slug: route.item } as Article) : undefined,
            request
          );
          if (!opened || request !== routeRequest) return;
          loadedEditor = identity;
        }
        if (request !== routeRequest) return;
        if (route.mode === 'preview' && request === routeRequest) await compileSaved();
      } else {
        loadedEditor = '';
        editing = false;
        savedRevision = revision;
      }
    } catch (cause) {
      if (request === routeRequest) report(cause);
    } finally {
      if (request === routeRequest) routeLoading = false;
    }
  }
  afterNavigate(() => {
    void applyRoute();
  });
  let meta = $state<ContentMeta>({}),
    tags = $state<string[]>([]),
    repoUrl = $state('');
  const route = $derived(adminRoute(page.url));
  const contentKind = $derived(tab === 'projects' ? 'projects' : 'articles');
  let serverRevision = $state(1),
    conflict = $state(false);
  let saveFailures = $state(0),
    savedAt = $state<Date | null>(null);
  let slug = $state(''),
    title = $state(''),
    category = $state(''),
    summary = $state(''),
    featured = $state(false),
    sortOrder = $state(0),
    status = $state<'draft' | 'published'>('draft');
  let doc = $state<Document>({ schemaVersion: 1, metadata: { language: 'en' }, blocks: [] });
  let revision = $state(0),
    savedRevision = $state(0);
  const editor = new DocumentEditor(undefined, registry, extensions);
  editor.subscribe(() => {
    doc = editor.document;
    error = '';
    revision++;
  });
  let renderedPreview = $state<PublicationArtifact>();
  let renderedAt = $state(-1);
  let renderedServerRevision = $state(-1);
  let compilationId = $state('');
  let compilationDiagnostics = $state<Diagnostic[]>([]);
  let compiling = $state(false);
  const localPreview = $derived.by(
    (): { artifact?: PublicationArtifact; diagnostics: readonly Diagnostic[] } => {
      return compileDocument(JSON.parse(JSON.stringify(doc)), title);
    }
  );
  const preview = $derived.by(() => {
    const diagnostics = [
      ...localPreview.diagnostics,
      ...(renderedAt === revision ? compilationDiagnostics : [])
    ];
    return {
      diagnostics,
      artifact: diagnostics.some((d) => d.level === 'error')
        ? undefined
        : renderedAt === revision && renderedPreview
          ? renderedPreview
          : localPreview.artifact
    };
  });
  async function compileSaved(): Promise<boolean> {
    if (busy || conflict || compiling) return false;
    if ((dirty || !storedSlug) && !(await save())) return false;
    if (localPreview.diagnostics.some((d) => d.level === 'error')) {
      error = 'Resolve validation errors before compiling. Your draft is saved.';
      return false;
    }
    if (
      renderedAt === revision &&
      renderedServerRevision === serverRevision &&
      compilationId &&
      renderedPreview
    )
      return true;
    const compilingRevision = revision;
    const saved = serverRevision;
    compiling = true;
    error = '';
    message = 'Compiling publication...';
    try {
      const started = await adminRequest<{ id: string }>(
        `/${contentKind}/${storedSlug}/compile`,
        'POST',
        { expected_revision: saved }
      );
      const deadline = Date.now() + 240000;
      while (Date.now() < deadline) {
        const job = await adminRequest<{
          state: string;
          artifact?: PublicationArtifact;
          diagnostics: Diagnostic[];
          progress: number;
          total: number;
        }>(`/compilations/${started.id}`);
        if (compilingRevision !== revision || saved !== serverRevision) {
          message = 'Draft changed. Open Preview again to compile the latest version.';
          return false;
        }
        if (job.state === 'ready' || job.state === 'failed') {
          renderedAt = compilingRevision;
          renderedServerRevision = saved;
          renderedPreview = job.artifact;
          compilationDiagnostics = job.diagnostics;
          compilationId = job.state === 'ready' ? started.id : '';
          message =
            job.state === 'ready'
              ? 'Preview ready. Changes remain a draft.'
              : 'Compilation needs attention. Your draft is saved.';
          return job.state === 'ready';
        }
        message = job.total
          ? `Compiling diagrams: ${job.progress} of ${job.total}`
          : 'Compiling publication...';
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      throw new Error(
        'Compilation is taking longer than expected. Your draft is saved; retry Preview.'
      );
    } catch (cause) {
      report(cause);
      return false;
    } finally {
      compiling = false;
    }
  }
  const previewArticle = $derived<Article>({
    slug: slug || 'preview',
    title,
    category,
    summary,
    status,
    featured,
    sort_order: sortOrder,
    published_at: null,
    reading_time_minutes: null,
    sections: [],
    revision: serverRevision,
    content_hash: '',
    compiled: preview.artifact
  });
  const dirty = $derived(revision !== savedRevision);
  function changed() {
    error = '';
    revision++;
  }
  function report(e: unknown) {
    error = (e as Error).message;
    if (e instanceof ApiError && e.status === 409 && editing) {
      conflict = true;
      error =
        'This article changed elsewhere. Export your edits before reloading the latest version. Autosave is paused.';
    }
    if (e instanceof ApiError && e.status === 401) error = '';
  }
  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get('auth_error');
    if (authError) {
      session.notice =
        authError === 'not_authorized'
          ? 'This account does not have admin access.'
          : 'Sign-in was cancelled. Please try again.';
      session.rejectedAccount = params.get('account') ?? '';
      params.delete('auth_error');
      params.delete('account');
      const cleanUrl =
        window.location.pathname + (params.size ? '?' + params : '') + window.location.hash;
      // Initial mount runs before SvelteKit finishes initializing its router.
      setTimeout(() => {
        void goto(cleanUrl, { replaceState: true, reset: false });
      }, 0);
    }
    void session.loadOptions();
    void session.restore().then((ok) => {
      if (ok) void applyRoute();
    });
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  });
  let bypassGuard = false;
  beforeNavigate(({ cancel, to, type }) => {
    if (bypassGuard) return;
    const leavesEditor = !to || editorIdentity(to.url) !== loadedEditor;
    if (editing && (busy || compiling) && leavesEditor) {
      cancel();
      return;
    }
    if (!(editing && dirty && leavesEditor)) return;
    cancel();
    // A tab close or reload is guarded by beforeunload, which needs the cancel above.
    if (type === 'leave' || !to) return;
    const target = to.url;
    void confirmDialog({
      title: 'Leave with unsaved changes?',
      body: 'Your edits have not been saved yet. Leaving discards them.',
      confirmLabel: 'Leave and discard',
      cancelLabel: 'Keep editing',
      danger: true
    }).then(async (ok) => {
      if (!ok) return;
      bypassGuard = true;
      try {
        await goto(target, { reset: false });
      } finally {
        bypassGuard = false;
      }
    });
  });
  $effect(() => {
    if (!session.loggedIn || conflict || !editing || !dirty || busy || routeLoading) return;
    // Track every edit, not just the clean-to-dirty transition, to debounce continuous typing.
    void revision;
    // Back off after failures and stop after five so a bad payload cannot loop.
    if (saveFailures >= 5) return;
    const delay = saveFailures === 0 ? 2000 : Math.min(30000, 1500 * 2 ** saveFailures);
    const timer = setTimeout(() => {
      void save();
    }, delay);
    return () => clearTimeout(timer);
  });
  async function logout() {
    if (
      dirty &&
      !(await confirmDialog({
        title: 'Sign out with unsaved changes?',
        body: 'Your edits have not been saved yet.',
        confirmLabel: 'Sign out and discard',
        cancelLabel: 'Keep editing',
        danger: true
      }))
    )
      return;
    try {
      await session.logout();
      editing = false;
      loadedEditor = '';
      savedRevision = revision;
    } catch (e) {
      report(e);
    }
  }
  async function open(article?: Article, request?: number) {
    busy = true;
    error = '';
    message = '';
    try {
      let value = article
        ? await adminRequest<Article>(`/${contentKind}/${article.slug}`)
        : undefined;
      if (request !== undefined && request !== routeRequest) return false;
      if (value && !value.document)
        value = await adminRequest<Article>(`/${contentKind}/${value.slug}`, 'PUT', {
          expected_revision: value.revision
        });
      if (request !== undefined && request !== routeRequest) return false;
      renderedPreview = undefined;
      renderedAt = -1;
      compilationId = '';
      compilationDiagnostics = [];
      storedSlug = value?.slug ?? '';
      serverRevision = value?.revision ?? 1;
      conflict = false;
      saveFailures = 0;
      savedAt = null;
      slug = value?.pending_slug || storedSlug;
      meta = value ?? {};
      tags = value?.tags ?? [];
      repoUrl = value?.repo_url ?? '';
      title = value?.title ?? '';
      category = value?.category ?? '';
      summary = value?.summary ?? '';
      featured = value?.featured ?? false;
      sortOrder = value?.sort_order ?? 0;
      status = value?.status ?? 'draft';
      editor.setDocument(
        value?.document
          ? parseDocument(value.document)
          : { schemaVersion: 1, metadata: { language: 'en' }, blocks: [] }
      );
      savedRevision = revision;
      editing = true;
      return true;
    } catch (e) {
      if (request === undefined || request === routeRequest) report(e);
      return false;
    } finally {
      if (request === undefined || request === routeRequest) busy = false;
    }
  }
  async function save(): Promise<boolean> {
    if (busy || conflict) return false;
    busy = true;
    error = '';
    const saving = revision;
    try {
      const document = {
        ...doc,
        metadata: { ...doc.metadata, title, language: doc.metadata?.language ?? 'en' }
      };
      const payload = {
        expected_revision: storedSlug ? serverRevision : undefined,
        ...(contentKind === 'projects'
          ? {
              ...meta,
              tags,
              repo_url: repoUrl || null
            }
          : { meta, tags }),
        slug: slug || (storedSlug ? undefined : 'draft-' + crypto.randomUUID()),
        title,
        category,
        summary,
        featured,
        sort_order: Number(sortOrder),
        document,
        document_version: document.schemaVersion,
        compiled: undefined
      };
      const value = await adminRequest<Article>(
        storedSlug ? `/${contentKind}/${storedSlug}` : '/' + contentKind,
        storedSlug ? 'PUT' : 'POST',
        payload
      );
      storedSlug = value.slug;
      tags = value.tags ?? tags;
      // The server adds a topic's project to the post's links; mirror that without dropping edits.
      const added = (value.project_ids ?? []).filter(
        (id) => !(meta.project_ids ?? []).includes(id)
      );
      if (added.length) meta = { ...meta, project_ids: [...(meta.project_ids ?? []), ...added] };
      serverRevision = value.revision ?? 1;
      slug = value.pending_slug || value.slug;
      savedRevision = saving;
      loadedEditor = contentKind + ':' + storedSlug;
      if (editorIdentity(page.url) !== loadedEditor) {
        await navigate(
          { new: null, [contentKind === 'projects' ? 'project' : 'article']: storedSlug },
          true
        );
      }
      message = '';
      saveFailures = 0;
      savedAt = new Date();
      return true;
    } catch (e) {
      report(e);
      if (!conflict && !(e instanceof ApiError && e.status === 401)) saveFailures++;
      return false;
    } finally {
      busy = false;
    }
  }
  async function publish() {
    if (preview.diagnostics.some((d) => d.level === 'error')) {
      error = 'Resolve validation errors before publishing.';
      return;
    }
    if (!(await compileSaved())) return;
    if (dirty) {
      error = 'The document changed while saving. Save again before publishing.';
      return;
    }
    busy = true;
    try {
      const result = await adminRequest<{ revision: number; slug: string }>(
        `/${contentKind}/${storedSlug}/publish`,
        'POST',
        { expected_revision: serverRevision, compilation_id: compilationId }
      );
      serverRevision = result.revision;
      storedSlug = result.slug;
      slug = result.slug;
      meta = { ...meta, pending_slug: null };
      status = 'published';
      loadedEditor = contentKind + ':' + storedSlug;
      await navigate({ [contentKind === 'projects' ? 'project' : 'article']: storedSlug }, true);
      message =
        contentKind === 'articles' && !(meta.project_ids ?? []).length
          ? 'Published. This post does not follow a project yet, so it sits under Standalone notes on the map. Link a project in Settings to connect it.'
          : 'Published.';
    } catch (e) {
      report(e);
    } finally {
      busy = false;
    }
  }
  async function unpublish() {
    busy = true;
    try {
      const result = await adminRequest<{ revision: number }>(
        `/${contentKind}/${storedSlug}/unpublish`,
        'POST',
        { expected_revision: serverRevision }
      );
      serverRevision = result.revision;
      status = 'draft';
      message = 'Returned to draft.';
    } catch (e) {
      report(e);
    } finally {
      busy = false;
    }
  }
  async function removeArticle() {
    if (
      !(await confirmDialog({
        title: `Delete "${title}"?`,
        body: 'This removes the content and its history permanently. It cannot be undone.',
        confirmLabel: 'Delete permanently',
        danger: true
      }))
    )
      return;
    busy = true;
    try {
      await adminRequest(`/${contentKind}/${storedSlug}`, 'DELETE', {
        expected_revision: serverRevision
      });
      editing = false;
      savedRevision = revision;
      await backToList();
    } catch (e) {
      report(e);
    } finally {
      busy = false;
    }
  }
  async function importDocument(source: string, format: string) {
    if (
      !(await confirmDialog({
        title: 'Replace the current blocks?',
        body: 'The imported document replaces everything in the editor. Autosave keeps the earlier version in history.',
        confirmLabel: 'Replace blocks'
      }))
    )
      return;
    if (format === 'json') {
      const result = editor.fromJson(source);
      error = result.diagnostics.map((d) => d.message).join('\n');
    } else {
      const result = importMarkdown(source);
      if (result.document && !result.diagnostics.some((d) => d.level === 'error'))
        editor.setDocument(result.document);
      error = result.diagnostics.map((d) => d.message).join('\n');
    }
  }
  function download(format: 'json' | 'markdown') {
    const result = format === 'markdown' ? readingMarkdown(doc) : undefined;
    if (result?.diagnostics.some((d) => d.level === 'error')) {
      error = result.diagnostics.map((d) => d.message).join('\n');
      return;
    }
    const source =
      format === 'json'
        ? JSON.stringify({ ...doc, metadata: { ...doc.metadata, title } }, null, 2)
        : (result?.markdown ?? '');
    const url = URL.createObjectURL(new Blob([source], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slug || 'article'}.${format === 'json' ? 'json' : 'md'}`;
    link.click();
    URL.revokeObjectURL(url);
  }
</script>

{#snippet contentSettings()}<ContentSettings
    bind:meta
    bind:tags
    bind:repo={repoUrl}
    kind={contentKind}
    selfId={meta.id ?? ''}
    onchange={changed}
  />{/snippet}
<svelte:head
  ><title>Publishing | Voidreg Admin</title><meta
    name="robots"
    content="noindex,nofollow"
  /></svelte:head
>
{#if session.restoring}
  <main id="main-content" class="restoring" role="status" aria-label="Restoring session">
    <span class="ui-skeleton restoring-bar"></span>
  </main>
{:else if !session.loggedIn}
  <LoginScreen {error} onsignedin={applyRoute} />
{:else if editing && (tab === 'articles' || tab === 'projects')}
  <main id="main-content" class="editor-root admin">
    <EditorWorkspace
      kind={contentKind}
      settings={contentSettings}
      {doc}
      {editor}
      bind:title
      bind:summary
      bind:slug
      bind:category
      bind:featured
      bind:sortOrder
      {storedSlug}
      {status}
      busy={busy || compiling}
      {dirty}
      {conflict}
      {serverRevision}
      {saveFailures}
      {savedAt}
      mode={editorView.mode}
      panel={editorView.panel}
      inspector={editorView.inspector}
      selectedBlock={editorView.block}
      onnavigate={navigateView}
      onreload={() => open({ slug: storedSlug } as Article)}
      {message}
      {error}
      diagnostics={preview.diagnostics}
      {previewArticle}
      previewExact={renderedAt === revision && !!renderedPreview}
      rendering={compiling}
      onrender={compileSaved}
      onchange={changed}
      onsave={save}
      onpublish={publish}
      onunpublish={unpublish}
      ondelete={removeArticle}
      onimport={importDocument}
      onexport={download}
      onback={backToList}
    />
  </main>
{:else}
  <AdminShell {tab} {busy} onsignout={logout}>
    {#if error}
      <p role="alert" class="ui-notice ui-notice-error page-notice">{error}</p>
    {/if}
    {#if route.editing && (tab === 'articles' || tab === 'projects')}
      <div class="page-loading" role="status" aria-label="Opening editor">
        <span class="ui-skeleton"></span><span class="ui-skeleton"></span>
        <span class="ui-skeleton"></span>
      </div>
    {:else if tab === 'media'}
      <MediaLibrary />
    {:else if tab === 'mcp'}
      <McpConnections />
    {:else if tab === 'comments'}
      <ModerationDashboard />
    {:else}
      <ContentList
        kind={contentKind}
        route={{
          page: route.page,
          query: route.query,
          status: route.status,
          tag: route.tag,
          inProject: route.inProject,
          inTopic: route.inTopic,
          sort: route.sort,
          dir: route.dir,
          perPage: route.perPage
        }}
        onnavigate={(changes) => navigate(changes)}
        onedit={(item) => goto(editorLink(item), { reset: false })}
      />
    {/if}
  </AdminShell>
{/if}

<style>
  .restoring {
    display: grid;
    min-height: 100dvh;
    place-items: center;
    padding: 2rem;
  }
  .restoring-bar {
    width: min(20rem, 100%);
    height: 2.75rem;
  }
  .page-notice {
    margin-block-end: 1rem;
  }
  .page-loading {
    display: grid;
    gap: 1rem;
    max-width: 48rem;
  }
  .page-loading .ui-skeleton {
    height: 2.75rem;
  }
</style>
