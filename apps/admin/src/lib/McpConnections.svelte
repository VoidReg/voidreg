<script lang="ts">
  import { onMount } from 'svelte';
  import { adminRequest } from './api';
  import { confirmDialog } from './ui/confirm.svelte';
  import { notify } from './ui/toast.svelte';
  import Tabs from './ui/Tabs.svelte';

  type Connection = {
    id: string;
    name: string;
    created_at: string;
    expires_at: string;
    last_used_at: string | null;
    scopes?: string[];
  };
  let connections = $state<Connection[]>([]);
  let name = $state('');
  let projects = $state(false);
  let token = $state('');
  let tokenId = $state('');
  let reveal = $state(false);
  let busy = $state(false);
  let loading = $state(true);
  let failure = $state('');
  let client = $state('claude');
  const serverUrl = $derived(`${location.origin}/mcp`);
  const shownToken = $derived(token || 'YOUR_TOKEN');

  const DAY = 86_400_000;
  const when = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });
  const whenTime = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });
  const daysLeft = (iso: string) => Math.ceil((Date.parse(iso) - Date.now()) / DAY);

  const snippets = $derived<Record<string, { label: string; where: string; code: string }>>({
    claude: {
      label: 'Claude Code',
      where: 'Run in a terminal.',
      code: `claude mcp add --transport http voidreg ${serverUrl} \\\n  --header "Authorization: Bearer ${shownToken}"`
    },
    cursor: {
      label: 'Cursor',
      where: 'Add to .cursor/mcp.json.',
      code: JSON.stringify(
        {
          mcpServers: {
            voidreg: { url: serverUrl, headers: { Authorization: `Bearer ${shownToken}` } }
          }
        },
        null,
        2
      )
    },
    codex: {
      label: 'Codex CLI',
      where: 'Add to ~/.codex/config.toml, then export the token in your shell.',
      code: `[mcp_servers.voidreg]\nurl = "${serverUrl}"\nbearer_token_env_var = "VOIDREG_MCP_TOKEN"\n\n# shell\nexport VOIDREG_MCP_TOKEN="${shownToken}"`
    },
    other: {
      label: 'Other client',
      where: 'Choose Streamable HTTP and set these values.',
      code: `URL: ${serverUrl}\nHeader: Authorization: Bearer ${shownToken}`
    }
  });

  async function load() {
    failure = '';
    loading = true;
    try {
      connections = (await adminRequest<{ items: Connection[] }>('/mcp-tokens')).items;
    } catch (e) {
      failure = (e as Error).message;
    } finally {
      loading = false;
    }
  }
  onMount(() => void load());

  async function create(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    token = '';
    reveal = false;
    try {
      const result = await adminRequest<{ token: string; connection: Connection }>(
        '/mcp-tokens',
        'POST',
        { name, scopes: projects ? ['projects'] : [] }
      );
      token = result.token;
      tokenId = result.connection.id;
      name = '';
      projects = false;
      connections = [...connections, result.connection];
      notify.success('Connection created. Copy the token now; it is shown only once.');
    } catch (e) {
      notify.error((e as Error).message);
    } finally {
      busy = false;
    }
  }
  async function revoke(connection: Connection) {
    const ok = await confirmDialog({
      title: `Revoke "${connection.name}"?`,
      body: 'Any client using this token loses access immediately. This cannot be undone.',
      confirmLabel: 'Revoke access',
      danger: true
    });
    if (!ok) return;
    busy = true;
    try {
      await adminRequest(`/mcp-tokens/${connection.id}`, 'DELETE');
      connections = connections.filter((item) => item.id !== connection.id);
      if (tokenId === connection.id) token = tokenId = '';
      notify.success('Connection revoked.');
    } catch (e) {
      notify.error((e as Error).message);
    } finally {
      busy = false;
    }
  }
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify.success(`${label} copied.`);
    } catch {
      notify.error('Copy was unavailable. Select the text and copy it manually.');
    }
  }
</script>

<section class="mcp" aria-labelledby="mcp-title">
  <header>
    <h1 id="mcp-title">MCP connections</h1>
    <p>
      Connect a desktop or CLI AI client to your publishing workspace. Clients can read content and
      edit drafts. Review and publish in this admin.
    </p>
  </header>

  <section aria-labelledby="mcp-create">
    <h2 id="mcp-create">1. Create an access token</h2>
    <p class="hint">
      Use one token per client. Tokens expire after 30 days and can be revoked at any time.
    </p>
    <form class="create" onsubmit={create}>
      <label class="ui-field"
        >Connection name<input
          bind:value={name}
          maxlength="80"
          required
          placeholder="My desktop assistant"
        /></label
      >
      <button class="ui-btn ui-btn-primary" disabled={busy || loading || !name.trim()}
        >{busy ? 'Working...' : 'Create token'}</button
      >
      <label class="scope">
        <input type="checkbox" bind:checked={projects} />
        <span>
          Allow creating and editing project drafts
          <span class="hint"
            >Off by default. A token can always read content and edit article drafts. No token can
            publish, delete, or change media, SEO or URLs.</span
          >
        </span>
      </label>
    </form>
    {#if token}
      <div class="token ui-notice" role="group" aria-label="New access token">
        <p>
          <strong>New token. It is shown once.</strong> Store it in your client's private settings.
        </p>
        <div class="token-row">
          <input
            class="token-input"
            readonly
            aria-label="Access token"
            type={reveal ? 'text' : 'password'}
            value={token}
            autocomplete="off"
            spellcheck="false"
          />
          <button
            type="button"
            class="ui-btn"
            aria-pressed={reveal}
            onclick={() => (reveal = !reveal)}>{reveal ? 'Hide' : 'Reveal'}</button
          >
          <button type="button" class="ui-btn" onclick={() => copy(token, 'Access token')}
            >Copy</button
          >
          <button type="button" class="ui-btn ui-btn-quiet" onclick={() => (token = '')}
            >Dismiss</button
          >
        </div>
      </div>
    {/if}
  </section>

  <section aria-labelledby="mcp-setup">
    <h2 id="mcp-setup">2. Add it to your client</h2>
    <Tabs
      label="Client"
      idPrefix="mcp"
      value={client}
      tabs={Object.entries(snippets).map(([id, s]) => ({ id, label: s.label }))}
      onselect={(id) => (client = id)}
    />
    <div id="mcp-panel" role="tabpanel" aria-labelledby={`mcp-tab-${client}`} class="snippet">
      <p class="hint">
        {snippets[client].where}
        {token ? 'Your new token is filled in.' : 'Replace YOUR_TOKEN with a token from step 1.'}
      </p>
      <pre><code>{snippets[client].code}</code></pre>
      <button
        type="button"
        class="ui-btn ui-btn-small"
        onclick={() => copy(snippets[client].code, 'Snippet')}>Copy snippet</button
      >
    </div>
  </section>

  <section aria-labelledby="mcp-existing">
    <h2 id="mcp-existing">Your connections</h2>
    {#if failure}
      <div class="ui-notice ui-notice-error" role="alert">
        <p>{failure}</p>
        <button type="button" class="ui-btn ui-btn-small" onclick={load}>Retry</button>
      </div>
    {:else if loading}
      <span class="ui-skeleton row" role="status" aria-label="Loading connections"></span>
    {:else if connections.length === 0}
      <div class="ui-empty">
        <h3>No clients connected yet</h3>
        <p>Create a token above to connect your first client.</p>
      </div>
    {:else}
      <div class="ui-table-wrap">
        <table class="ui-table">
          <caption class="sr-only">Connections</caption>
          <thead>
            <tr
              ><th scope="col">Name</th><th scope="col">Expires</th><th scope="col">Last used</th
              ><th scope="col"><span class="sr-only">Actions</span></th></tr
            >
          </thead>
          <tbody>
            {#each connections as connection (connection.id)}
              {@const left = daysLeft(connection.expires_at)}
              <tr>
                <th scope="row"
                  >{connection.name}
                  {#if connection.scopes?.includes('projects')}<span class="ui-badge"
                      >Project drafts</span
                    >{/if}</th
                >
                <td>
                  {when.format(new Date(connection.expires_at))}
                  {#if left <= 0}<span class="ui-badge warn">Expired</span>
                  {:else if left <= 7}<span class="ui-badge warn"
                      >{left} day{left === 1 ? '' : 's'} left</span
                    >{/if}
                </td>
                <td
                  >{connection.last_used_at
                    ? whenTime.format(new Date(connection.last_used_at))
                    : 'Never'}</td
                >
                <td class="end"
                  ><button
                    type="button"
                    class="ui-btn ui-btn-small ui-btn-danger"
                    disabled={busy}
                    onclick={() => revoke(connection)}
                    >Revoke<span class="sr-only"> {connection.name}</span></button
                  ></td
                >
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
</section>

<style>
  .mcp {
    display: grid;
    gap: 2rem;
    max-width: 56rem;
  }
  .mcp > section {
    display: grid;
    gap: 0.75rem;
    border-top: 1px solid var(--border);
    padding-block-start: 1.5rem;
  }
  h1 {
    font-size: 1.75rem;
    line-height: 1.2;
  }
  h2 {
    font-size: 1.125rem;
  }
  header {
    display: grid;
    gap: 0.5rem;
  }
  .hint {
    color: var(--muted-foreground);
    font-size: 0.875rem;
  }
  .create {
    display: grid;
    grid-template-columns: minmax(0, 24rem) auto;
    gap: 0.75rem;
    align-items: end;
  }
  .scope {
    grid-column: 1 / -1;
    display: flex;
    align-items: flex-start;
    gap: 0.625rem;
  }
  .scope input {
    margin-block-start: 0.25rem;
  }
  .scope .hint {
    display: block;
  }
  .token {
    display: grid;
    gap: 0.5rem;
  }
  .token-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .token-input {
    flex: 1 1 16rem;
    border: 1px solid var(--input);
    background: var(--background);
    padding: 0.5rem 0.75rem;
    min-height: 2.75rem;
    min-width: 0;
    color: var(--foreground);
    font-family: var(--font-code);
    font-size: 0.875rem;
  }
  .snippet {
    display: grid;
    gap: 0.75rem;
    justify-items: start;
  }
  pre {
    margin: 0;
    border: 1px solid var(--border);
    background: var(--card);
    padding: 1rem;
    width: 100%;
    overflow-x: auto;
    font: 0.8125rem/1.6 var(--font-code);
  }
  .row {
    height: 3rem;
  }
  .end {
    text-align: end;
  }
  .warn {
    border-color: var(--danger);
    color: var(--danger);
  }
  @media (max-width: 40rem) {
    .create {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
