<script lang="ts">
  import { onMount } from 'svelte';
  import { beforeNavigate, replaceState } from '$app/navigation';
  import { DocumentEditor } from '@publisle/playground';
  import type { PublicationArtifact } from '@publisle/adapter-core';
  import { parseDocument, type Document, type Diagnostic } from '@publisle/schema';
  import { compileDocument } from '$lib/authoring';
  import McpConnections from '$lib/McpConnections.svelte';
  import type { Article, Page } from '$lib/publishing/api';
  import { ApiError, adminRequest } from '$lib/api';
  import EditorWorkspace from '$lib/editor/EditorWorkspace.svelte';
  import { extensions, registry } from '$lib/blocks';

  type Comment = {
    parent_id: string | null;
    parent_author: string | null;
    parent_body: string | null;
    id: string;
    article_slug: string;
    author_name: string;
    body: string;
    status: string;
  };
  let restoring = $state(true),
    loggedIn = $state(false),
    password = $state(''),
    loginOptions = $state<{ providers: string[]; password_enabled: boolean } | null>(null),
    loginOptionsError = $state(''),
    rejectedAccount = $state(''),
    error = $state(''),
    message = $state(''),
    busy = $state(false);
  let articles = $state<Article[]>([]),
    comments = $state<Page<Comment>>({ items: [], page: 1, per_page: 20, total: 0 }),
    commentStatus = $state('pending');
  let tab = $state<'articles' | 'comments' | 'mcp'>('articles'),
    editing = $state(false),
    storedSlug = $state('');
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
  const preview = $derived.by(
    (): { artifact?: PublicationArtifact; diagnostics: readonly Diagnostic[] } => {
      return compileDocument(JSON.parse(JSON.stringify(doc)), title);
    }
  );
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
  async function dashboard() {
    articles = (await adminRequest<{ items: Article[] }>('/articles')).items;
  }
  async function loadComments(page = 1) {
    try {
      comments = await adminRequest(`/comments?status=${commentStatus}&page=${page}`);
    } catch (e) {
      report(e);
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
      setTimeout(() => replaceState(cleanUrl, {}), 0);
    }
    void loadLoginOptions();
    void adminRequest('/session')
      .then(async () => {
        loggedIn = true;
        await dashboard();
        const selected = new URLSearchParams(window.location.search).get('article');
        const article = articles.find((a) => a.slug === selected);
        if (article) await open(article);
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
  beforeNavigate(({ cancel }) => {
    if (dirty && !confirm('Leave with unsaved changes?')) cancel();
  });
  $effect(() => {
    if (
      !loggedIn ||
      conflict ||
      !editing ||
      !dirty ||
      busy ||
      error ||
      !title.trim() ||
      !category.trim() ||
      !summary.trim()
    )
      return;
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
      await dashboard();
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
    } catch (e) {
      report(e);
    } finally {
      busy = false;
    }
  }
  async function open(article?: Article) {
    if (dirty && !confirm('Discard unsaved changes?')) return;
    busy = true;
    error = '';
    message = '';
    try {
      let value = article ? await adminRequest<Article>(`/articles/${article.slug}`) : undefined;
      if (value && !value.document)
        value = await adminRequest<Article>(`/articles/${value.slug}`, 'PUT', {
          expected_revision: value.revision
        });
      storedSlug = value?.slug ?? '';
      serverRevision = value?.revision ?? 1;
      conflict = false;
      slug = storedSlug;
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
    } catch (e) {
      report(e);
    } finally {
      busy = false;
    }
  }
  async function save(): Promise<boolean> {
    if (busy || conflict) return false;
    busy = true;
    error = '';
    const saving = revision;
    try {
      const compiled = preview.diagnostics.some((d) => d.level === 'error')
        ? undefined
        : preview.artifact;
      const document = {
        ...doc,
        metadata: { ...doc.metadata, title, language: doc.metadata?.language ?? 'en' }
      };
      const payload = {
        expected_revision: storedSlug ? serverRevision : undefined,
        slug: slug || undefined,
        title,
        category,
        summary,
        featured,
        sort_order: Number(sortOrder),
        document,
        document_version: document.schemaVersion,
        compiled
      };
      const value = await adminRequest<Article>(
        storedSlug ? `/articles/${storedSlug}` : '/articles',
        storedSlug ? 'PUT' : 'POST',
        payload
      );
      storedSlug = value.slug;
      serverRevision = value.revision ?? 1;
      slug = value.slug;
      savedRevision = saving;
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
    if (!(await save())) return;
    if (dirty) {
      error = 'The document changed while saving. Save again before publishing.';
      return;
    }
    busy = true;
    try {
      const result = await adminRequest<{ revision: number }>(
        `/articles/${storedSlug}/publish`,
        'POST',
        { expected_revision: serverRevision }
      );
      serverRevision = result.revision;
      status = 'published';
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
        `/articles/${storedSlug}/unpublish`,
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
    if (!confirm(`Delete “${title}”? This cannot be undone.`)) return;
    busy = true;
    try {
      await adminRequest(`/articles/${storedSlug}`, 'DELETE', {
        expected_revision: serverRevision
      });
      editing = false;
      savedRevision = revision;
      await dashboard();
    } catch (e) {
      report(e);
    } finally {
      busy = false;
    }
  }
  async function moderate(comment: Comment, approve: boolean) {
    if (!approve && !confirm('Delete this comment?')) return;
    busy = true;
    try {
      await adminRequest(
        `/comments/${comment.id}${approve ? '/approve' : ''}`,
        approve ? 'POST' : 'DELETE'
      );
      await loadComments(comments.page);
    } catch (e) {
      report(e);
    } finally {
      busy = false;
    }
  }
  function importDocument(source: string, format: string) {
    if (!confirm('Replace the current blocks with the imported document?')) return;
    const result = format === 'json' ? editor.fromJson(source) : editor.importMarkdown(source);
    error = result.diagnostics.map((d) => d.message).join('\n');
  }
  function download(format: 'json' | 'markdown') {
    const result = format === 'markdown' ? editor.exportMarkdown() : undefined;
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

<svelte:head
  ><title>Publishing | Voidreg Admin</title><meta
    name="robots"
    content="noindex,nofollow"
  /></svelte:head
>
<main
  id="main-content"
  class={loggedIn && editing && tab === 'articles'
    ? 'editor-root admin'
    : 'site-container page-shell admin'}
>
  {#if loggedIn && editing && tab === 'articles'}
    <EditorWorkspace
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
      {busy}
      {dirty}
      {conflict}
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
      onback={() => {
        if (!dirty || confirm('Discard unsaved changes?')) {
          editing = false;
          savedRevision = revision;
        }
      }}
    />
  {:else}
    <header class="admin-bar">
      <div>
        <p class="eyebrow">Voidreg</p>
        <h1>Publishing</h1>
      </div>
      {#if loggedIn}<button class="button button-secondary" disabled={busy} onclick={logout}
          >Sign out</button
        >{/if}
    </header>
    {#if error}<p role="alert" class="feedback">{error}</p>{/if}
    <p role="status">{message}</p>
    {#if restoring}<p role="status">Restoring session…</p>
    {:else if !loggedIn}
      <section class="publishing-form" aria-labelledby="sign-in-title">
        <h2 id="sign-in-title">Sign in</h2>
        <p>Use your approved GitHub or Google account to manage publishing.</p>
        {#if rejectedAccount}<p>Account ID: <code>{rejectedAccount}</code></p>{/if}
        {#if loginOptionsError}
          <p role="alert">{loginOptionsError}</p>
          <button class="button button-secondary" onclick={loadLoginOptions}>Retry</button>
        {:else if !loginOptions}
          <p role="status">Loading sign-in options…</p>
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
                >{busy ? 'Signing in…' : 'Sign in with password'}</button
              >
            </form>
          {/if}
        {/if}
      </section>
    {:else}
      <nav class="button-row" aria-label="Admin sections">
        <button
          class="button button-secondary"
          aria-pressed={tab === 'articles'}
          onclick={() => (tab = 'articles')}>Articles</button
        ><button
          class="button button-secondary"
          aria-pressed={tab === 'comments'}
          onclick={() => {
            tab = 'comments';
            void loadComments();
          }}>Comments</button
        >
        <button
          class="button button-secondary"
          aria-pressed={tab === 'mcp'}
          onclick={() => (tab = 'mcp')}>MCP connections</button
        >
      </nav>
      {#if tab === 'mcp'}
        <McpConnections />
      {:else if tab === 'comments'}
        <section class="section-stack">
          <h2>Moderation queue</h2>
          <label
            >Status <select bind:value={commentStatus} onchange={() => loadComments()}
              ><option value="pending">Pending</option><option value="approved">Approved</option
              ><option value="">All</option></select
            ></label
          >
          {#if comments.items.length === 0}<p>No comments in this queue.</p>{/if}
          {#each comments.items as comment (comment.id)}<article class="moderation-row">
              <h3>{comment.author_name}</h3>
              <p>{comment.article_slug} · {comment.status}</p>
              {#if comment.parent_id}<p>Reply to {comment.parent_author ?? 'another reader'}</p>
                {#if comment.parent_body}<blockquote class="comment-body">
                    {comment.parent_body}
                  </blockquote>{/if}
              {/if}
              <p class="comment-body">{comment.body}</p>
              <div class="button-row">
                {#if comment.status === 'pending'}<button
                    class="button"
                    disabled={busy}
                    onclick={() => moderate(comment, true)}>Approve</button
                  >{/if}<button
                  class="button button-secondary"
                  disabled={busy}
                  onclick={() => moderate(comment, false)}>Delete comment</button
                >
              </div>
            </article>{/each}
          <nav class="button-row" aria-label="Moderation pages">
            <button
              class="button button-secondary"
              disabled={comments.page <= 1 || busy}
              onclick={() => loadComments(comments.page - 1)}>Previous</button
            ><button
              class="button button-secondary"
              disabled={comments.page * comments.per_page >= comments.total || busy}
              onclick={() => loadComments(comments.page + 1)}>Next</button
            >
          </nav>
        </section>
      {:else}
        <section class="section-stack">
          <div class="admin-bar">
            <h2>Articles</h2>
            <button class="button" disabled={busy} onclick={() => open()}>New article</button>
          </div>
          {#if articles.length === 0}<p>No articles yet. Create your first draft.</p>{/if}
          {#each articles as article (article.slug)}<article class="article-row">
              <div>
                <h3>{article.title}</h3>
                <p>{article.status} · {article.category}{article.featured ? ' · Featured' : ''}</p>
              </div>
              <button class="button button-secondary" disabled={busy} onclick={() => open(article)}
                >Edit</button
              >
            </article>{/each}
        </section>
      {/if}
    {/if}
  {/if}
</main>

<style>
  .admin {
    gap: 2rem;
  }
  .admin-bar,
  .article-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .moderation-row,
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
  select {
    max-width: 100%;
    min-height: 2.875rem;
    color: var(--foreground);
    background: var(--background);
    border: 1px solid var(--input);
    border-radius: var(--radius);
    padding: 0.75rem;
    font: inherit;
  }
</style>
