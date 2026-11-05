<script lang="ts">
  import { onMount } from 'svelte';
  import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { adminRoute, adminUrl, editorIdentity, type EditorView } from '$lib/navigation';
  import { DocumentEditor } from '@publisle/playground';
  import type { PublicationArtifact } from '@publisle/adapter-core';
  import { parseDocument, type Document, type Diagnostic } from '@publisle/schema';
  import { compileDocument, importMarkdown, archivalMarkdown } from '@voidreg/authoring';
  import ContentSettings from '$lib/ContentSettings.svelte';
  import MediaLibrary from '$lib/MediaLibrary.svelte';
  import ModerationDashboard from '$lib/ModerationDashboard.svelte';
  import type { ContentMeta } from '@voidreg/publishing-ui/api';
  import McpConnections from '$lib/McpConnections.svelte';
  import type { Article, Page } from '@voidreg/publishing-ui/api';
  import { ApiError, adminRequest } from '$lib/api';
  import EditorWorkspace from '$lib/editor/EditorWorkspace.svelte';
  import { extensions, registry } from '@voidreg/authoring/blocks';

  let restoring = $state(true),
    loggedIn = $state(false),
    password = $state(''),
    loginOptions = $state<{ providers: string[]; password_enabled: boolean } | null>(null),
    loginOptionsError = $state(''),
    rejectedAccount = $state(''),
    error = $state(''),
    message = $state(''),
    busy = $state(false);
  let articles = $state<Article[]>([]);
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
    if (!loggedIn) return;
    const request = ++routeRequest;
    const route = adminRoute(page.url);
    const identity = editorIdentity(page.url);
    routeLoading = true;
    error = '';
    try {
      if (identity !== loadedEditor) busy = false;
      tab = route.tab;
      listPage = route.page;
      listQuery = route.query;
      listStatus = route.status;
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
        if (allProjects.length === 0) await dashboard();
        if (route.mode === 'preview' && request === routeRequest) await compileSaved();
      } else {
        loadedEditor = '';
        editing = false;
        savedRevision = revision;
        if (route.tab === 'articles' || route.tab === 'projects') await dashboard();
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
  let allProjects = $state<Article[]>([]),
    meta = $state<ContentMeta>({}),
    tagsText = $state(''),
    repoUrl = $state('');
  let listQuery = $state(''),
    listStatus = $state(''),
    listPage = $state(1),
    listTotal = $state(0),
    listPerPage = $state(20),
    listLoading = $state(false);
  const contentKind = $derived(tab === 'projects' ? 'projects' : 'articles');
  let serverRevision = $state(1),
    conflict = $state(false);
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
    if (e instanceof ApiError && e.status === 401) {
      loggedIn = false;
      message = 'Your session expired. Sign in to keep editing.';
    }
  }
  let dashboardRequest = 0;
  async function dashboard() {
    const requestId = ++dashboardRequest;
    listLoading = true;
    try {
      const result = await adminRequest<Page<Article>>(
        '/' +
          contentKind +
          '?page=' +
          listPage +
          '&q=' +
          encodeURIComponent(listQuery) +
          '&status=' +
          listStatus
      );
      if (requestId !== dashboardRequest) return;
      articles = result.items;
      listPage = result.page;
      listPerPage = result.per_page;
      listTotal = result.total;
      const catalog: Article[] = [];
      let page = 1;
      while (true) {
        const result = await adminRequest<Page<Article>>('/projects?per_page=100&page=' + page);
        catalog.push(...result.items);
        if (page * result.per_page >= result.total) break;
        page++;
      }
      if (requestId === dashboardRequest) allProjects = catalog;
    } finally {
      if (requestId === dashboardRequest) listLoading = false;
    }
  }
  async function loadLoginOptions() {
    loginOptionsError = '';
    try {
      loginOptions = await adminRequest('/login-options');
    } catch {
      loginOptionsError = 'Could not load sign-in options. Please try again.';
    }
  }
  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get('auth_error');
    if (authError) {
      error =
        authError === 'not_authorized'
          ? 'This account does not have admin access.'
          : 'Sign-in was cancelled. Please try again.';
      rejectedAccount = params.get('account') ?? '';
      params.delete('auth_error');
      params.delete('account');
      const cleanUrl =
        window.location.pathname + (params.size ? '?' + params : '') + window.location.hash;
      // Initial mount runs before SvelteKit finishes initializing its router.
      setTimeout(() => {
        void goto(cleanUrl, { replaceState: true, reset: false });
      }, 0);
    }
    void loadLoginOptions();
    void adminRequest('/session')
      .then(async () => {
        loggedIn = true;
        await applyRoute();
      })
      .catch((e) => {
        if (!(e instanceof ApiError && e.status === 401)) report(e);
      })
      .finally(() => (restoring = false));
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  });
  beforeNavigate(({ cancel, to }) => {
    const leavesEditor = !to || editorIdentity(to.url) !== loadedEditor;
    if (editing && (busy || compiling) && leavesEditor) {
      cancel();
      return;
    }
    if (editing && dirty && leavesEditor && !confirm('Leave with unsaved changes?')) cancel();
  });
  $effect(() => {
    if (!loggedIn || conflict || !editing || !dirty || busy || error || routeLoading) return;
    const timer = setTimeout(() => {
      void save();
    }, 1500);
    return () => clearTimeout(timer);
  });
  async function login(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = '';
    try {
      await adminRequest('/session', 'POST', { password });
      password = '';
      loggedIn = true;
      await applyRoute();
    } catch (e) {
      report(e);
    } finally {
      busy = false;
    }
  }
  async function logout() {
    if (dirty && !confirm('Sign out with unsaved changes?')) return;
    busy = true;
    try {
      await adminRequest('/session', 'DELETE');
      loggedIn = false;
      editing = false;
      loadedEditor = '';
      savedRevision = revision;
    } catch (e) {
      report(e);
    } finally {
      busy = false;
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
      slug = value?.pending_slug || storedSlug;
      meta = value ?? {};
      tagsText = value?.tags?.join(', ') ?? '';
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
              tags: tagsText
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
              repo_url: repoUrl || null
            }
          : { meta }),
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
      message = 'Saved.';
      await dashboard();
      return true;
    } catch (e) {
      report(e);
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
      message = 'Published.';
      await dashboard();
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
      await dashboard();
    } catch (e) {
      report(e);
    } finally {
      busy = false;
    }
  }
  async function removeArticle() {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
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
  async function lifecycle(article: Article, action: string) {
    if (
      action !== 'restore' &&
      !confirm(
        action === 'delete'
          ? `Permanently delete "${article.title}"? This cannot be undone.`
          : 'Archive this content and remove it from public pages?'
      )
    )
      return;
    busy = true;
    try {
      await adminRequest(
        '/' + contentKind + '/' + article.slug + (action === 'delete' ? '' : '/' + action),
        action === 'delete' ? 'DELETE' : 'POST',
        { expected_revision: article.revision }
      );
      await dashboard();
    } catch (e) {
      report(e);
    } finally {
      busy = false;
    }
  }
  function importDocument(source: string, format: string) {
    if (!confirm('Replace the current blocks with the imported document?')) return;
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
    const result = format === 'markdown' ? archivalMarkdown(doc) : undefined;
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
    bind:tags={tagsText}
    bind:repo={repoUrl}
    kind={contentKind}
    projects={allProjects}
    onchange={changed}
  />{/snippet}
<svelte:head
  ><title>Publishing | Voidreg Admin</title><meta
    name="robots"
    content="noindex,nofollow"
  /></svelte:head
>
<main
  id="main-content"
  class={loggedIn && editing && (tab === 'articles' || tab === 'projects')
    ? 'editor-root admin'
    : 'site-container page-shell admin'}
>
  {#if loggedIn && editing && (tab === 'articles' || tab === 'projects')}
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
      onchange={changed}
      onsave={save}
      onpublish={publish}
      onunpublish={unpublish}
      ondelete={removeArticle}
      onimport={importDocument}
      onexport={download}
      onback={backToList}
    />
  {:else}
    <header class="admin-bar admin-header">
      <div>
        <p class="eyebrow">Voidreg</p>
        <h1>Publishing</h1>
      </div>
      {#if loggedIn}<button class="button button-secondary" disabled={busy} onclick={logout}
          >Sign out</button
        >{/if}
    </header>
    {#if error}<p role="alert" class="feedback">{error}</p>{/if}
    {#if message}<p role="status" class="admin-message">{message}</p>{/if}
    {#if restoring || (routeLoading && !editing)}<p role="status">
        {restoring ? 'Restoring session...' : 'Loading view...'}
      </p>
    {:else if !loggedIn}
      <section class="publishing-form" aria-labelledby="sign-in-title">
        <h2 id="sign-in-title">Sign in</h2>
        <p>Use your approved GitHub or Google account to manage publishing.</p>
        {#if rejectedAccount}<p>Account ID: <code>{rejectedAccount}</code></p>{/if}
        {#if loginOptionsError}
          <p role="alert">{loginOptionsError}</p>
          <button class="button button-secondary" onclick={loadLoginOptions}>Retry</button>
        {:else if !loginOptions}
          <p role="status">Loading sign-in options...</p>
        {:else}
          <div class="button-row">
            {#each loginOptions.providers as provider}
              <a class="button" href={'/api/v1/auth/' + provider + '/start?purpose=admin'}>
                Continue with {provider === 'github' ? 'GitHub' : 'Google'}
              </a>
            {/each}
          </div>
          {#if loginOptions.providers.length === 0 && !loginOptions.password_enabled}
            <p>Admin sign-in is not available yet. Contact the site owner.</p>
          {/if}
          {#if loginOptions.password_enabled}
            <form onsubmit={login} class="publishing-form">
              <label
                >Admin password<input
                  type="password"
                  bind:value={password}
                  autocomplete="current-password"
                  required
                /></label
              >
              <button class="button button-secondary" disabled={busy}
                >{busy ? 'Signing in...' : 'Sign in with password'}</button
              >
            </form>
          {/if}
        {/if}
      </section>
    {:else}
      <nav class="admin-navigation" aria-label="Admin sections">
        {#each [['articles', 'Articles'], ['projects', 'Projects'], ['media', 'Media'], ['comments', 'Comments'], ['mcp', 'MCP connections']] as [section, label]}
          <a
            class="button button-secondary"
            aria-current={tab === section ? 'page' : undefined}
            href={resolve('/') + '?tab=' + section}>{label}</a
          >
        {/each}
      </nav>
      {#if tab === 'media'}<MediaLibrary />
      {:else if tab === 'mcp'}
        <McpConnections />
      {:else if tab === 'comments'}
        <ModerationDashboard />
      {:else}
        <section class="section-stack">
          <div class="admin-bar">
            <h2>{contentKind === 'projects' ? 'Projects' : 'Articles'}</h2>
            <button
              class="button"
              disabled={busy}
              onclick={() => goto(editorLink(), { reset: false })}
              >New {contentKind === 'projects' ? 'project' : 'article'}</button
            >
          </div>
          <form
            class="content-filters"
            onsubmit={(event) => {
              event.preventDefault();
              void navigate({ page: null, q: listQuery, status: listStatus });
            }}
          >
            <label>Search<input type="search" bind:value={listQuery} /></label><label
              >Status<select bind:value={listStatus}
                ><option value="">All</option><option value="draft">Draft</option><option
                  value="published">Published</option
                ><option value="archived">Archived</option></select
              ></label
            ><button class="button button-secondary">Filter</button>
          </form>
          {#if listLoading}<p role="status">Loading content...</p>{:else if articles.length === 0}<p
            >
              No content matches. Create a draft or adjust the filters.
            </p>{/if}
          <div class="content-list">
            {#each articles as article (article.slug)}<article class="article-row">
                <div class="content-row-details">
                  <h3>{article.title}</h3>
                  <p>
                    {article.archived ? 'Archived' : article.status} | {article.category}{article.featured
                      ? ' | Featured'
                      : ''}{article.has_unpublished_changes ? ' | Unpublished changes' : ''}
                  </p>
                </div>
                <div class="button-row">
                  {#if !article.archived}<button
                      class="button button-secondary"
                      disabled={busy}
                      onclick={() => goto(editorLink(article), { reset: false })}>Edit</button
                    >{/if}
                  <button
                    class="button button-secondary"
                    disabled={busy}
                    onclick={() => lifecycle(article, article.archived ? 'restore' : 'archive')}
                    >{article.archived ? 'Restore' : 'Archive'}</button
                  >
                  <button
                    class="button button-secondary"
                    disabled={busy}
                    aria-label={`Delete "${article.title}" permanently`}
                    onclick={() => lifecycle(article, 'delete')}>Delete permanently</button
                  >
                </div>
              </article>{/each}
          </div>
          <nav class="button-row content-pagination" aria-label="Content pages">
            <button
              class="button button-secondary"
              disabled={busy || listLoading || listPage <= 1}
              onclick={() => {
                void navigate({ page: listPage - 1 });
              }}>Previous</button
            ><span>Page {listPage} of {Math.max(1, Math.ceil(listTotal / listPerPage))}</span
            ><button
              class="button button-secondary"
              disabled={busy || listLoading || listPage * listPerPage >= listTotal}
              onclick={() => {
                void navigate({ page: listPage + 1 });
              }}>Next</button
            >
          </nav>
        </section>
      {/if}
    {/if}
  {/if}
</main>

<style>
  .admin {
    gap: 2rem;
  }
  .admin-header {
    padding-block-end: 1.5rem;
    border-bottom: 1px solid var(--border);
  }
  .admin-header h1 {
    font-size: 2.25rem;
  }
  .admin-navigation {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding-block-end: 0.75rem;
    border-bottom: 1px solid var(--border);
  }
  .admin-navigation .button {
    background: transparent;
    color: var(--muted-foreground);
    border: 1px solid transparent;
    border-bottom-width: 2px;
    padding-inline: 1rem;
  }
  .admin-navigation .button:hover {
    background: var(--muted);
    color: var(--foreground);
  }
  .admin-navigation [aria-current='page'] {
    background: var(--card);
    border-bottom-color: var(--primary);
    color: var(--foreground);
  }
  .content-filters {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(10rem, 12rem) auto;
    align-items: end;
    gap: 1rem;
    padding: 1.5rem;
    background: var(--card);
    border: 1px solid var(--border);
  }
  .content-list {
    display: grid;
    gap: 1rem;
  }
  .content-row-details {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
    flex: 1 1 20rem;
  }
  .content-row-details p {
    font-size: 0.875rem;
    color: var(--muted-foreground);
  }
  .content-pagination {
    align-items: center;
    padding-block-start: 1.5rem;
    border-top: 1px solid var(--border);
  }
  .admin-message {
    padding: 1rem;
    border-inline-start: 3px solid var(--primary);
    background: var(--card);
  }
  @media (max-width: 47.999rem) {
    .admin-navigation {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .admin-navigation .button {
      justify-content: start;
    }
    .content-filters {
      grid-template-columns: minmax(0, 1fr);
      padding: 1rem;
    }
    .content-list .article-row {
      padding: 1rem;
      gap: 1.5rem;
    }
    .article-row > .button-row {
      width: 100%;
    }
    .article-row > .button-row .button {
      flex: 1 1 auto;
    }
  }
  .admin-bar,
  .article-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .article-row {
    padding: 1.5rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .feedback {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    padding: 1rem;
    background: var(--card);
    border-inline-start: 3px solid var(--primary);
  }
</style>
