<script lang="ts">
  import { onMount } from 'svelte';
  import { adminRequest } from './api';
  type Connection = {
    id: string;
    name: string;
    created_at: string;
    expires_at: string;
    last_used_at: string | null;
  };
  let connections = $state<Connection[]>([]);
  let name = $state(''),
    token = $state(''),
    tokenId = $state('');
  let busy = $state(false),
    loading = $state(true),
    error = $state(''),
    message = $state('');
  const serverUrl = 'https://www.voidreg.xyz/mcp';
  async function load() {
    error = '';
    loading = true;
    try {
      connections = (await adminRequest<{ items: Connection[] }>('/mcp-tokens')).items;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }
  onMount(load);
  async function create(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = '';
    message = '';
    token = '';
    try {
      const result = await adminRequest<{ token: string; connection: Connection }>(
        '/mcp-tokens',
        'POST',
        { name }
      );
      token = result.token;
      tokenId = result.connection.id;
      name = '';
      connections = [...connections, result.connection];
      message = 'Connection created. Copy the token now; it is shown only once.';
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
  async function revoke(connection: Connection) {
    if (!confirm(`Revoke access for ${connection.name}?`)) return;
    busy = true;
    error = '';
    try {
      await adminRequest(`/mcp-tokens/${connection.id}`, 'DELETE');
      connections = connections.filter((item) => item.id !== connection.id);
      if (tokenId === connection.id) {
        token = '';
        tokenId = '';
      }
      message = 'Connection revoked.';
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      message = `${label} copied.`;
    } catch {
      error = 'Copy was unavailable. Select and copy the value manually.';
    }
  }
</script>

<section class="section-stack mcp-connections" aria-labelledby="mcp-title">
  <header>
    <h2 id="mcp-title">MCP connections</h2>
    <p>
      Connect a desktop or CLI AI client to your publishing workspace. Clients can read articles and
      edit drafts. Review and publish in admin.
    </p>
  </header>
  {#if error}<p role="alert" class="feedback">{error}</p>{/if}
  <p role="status">{message}</p>
  <section class="section-stack" aria-labelledby="mcp-setup">
    <h3 id="mcp-setup">Connect your client</h3>
    <p>
      Choose Streamable HTTP in your client, enter this server URL, and set the Authorization header
      to <code>Bearer YOUR_TOKEN</code>. Keep tokens in your client’s private settings or
      environment.
    </p>
    <div class="publishing-form"><label>Server URL<input readonly value={serverUrl} /></label></div>
    <div class="button-row">
      <button class="button button-secondary" onclick={() => copy(serverUrl, 'Server URL')}
        >Copy server URL</button
      >
    </div>
    <p>
      Use a separate token for each client. Tokens expire after 30 days and can be revoked at any
      time. MCP edits saved drafts; reload a draft in admin to see changes.
    </p>
    <form class="publishing-form" onsubmit={create}>
      <label
        >Connection name<input
          bind:value={name}
          maxlength="80"
          required
          placeholder="My desktop assistant"
        /></label
      >
      <button class="button" disabled={busy || loading}
        >{busy ? 'Working…' : 'Create access token'}</button
      >
    </form>
    {#if token}
      <div class="publishing-form">
        <label
          >New access token, shown once<input
            readonly
            value={token}
            autocomplete="off"
            spellcheck="false"
          /></label
        >
        <div class="button-row">
          <button class="button button-secondary" onclick={() => copy(token, 'Access token')}
            >Copy token</button
          >
          <button class="button button-secondary" onclick={() => (token = '')}>Hide token</button>
        </div>
      </div>
    {/if}
  </section>
  <section class="section-stack" aria-labelledby="mcp-existing">
    <h3 id="mcp-existing">Your connections</h3>
    {#if loading}<p role="status">Loading connections…</p>
    {:else if error && connections.length === 0}<div class="button-row">
        <button class="button button-secondary" onclick={load}>Retry</button>
      </div>
    {:else if connections.length === 0}<p>No clients connected yet.</p>
    {:else}
      <ul class="connection-list">
        {#each connections as connection (connection.id)}
          <li>
            <div>
              <h4>{connection.name}</h4>
              <p>
                {Date.parse(connection.expires_at) <= Date.now() ? 'Expired' : 'Expires'}
                {new Date(connection.expires_at).toLocaleDateString()}
              </p>
              <p>
                Last used: {connection.last_used_at
                  ? new Date(connection.last_used_at).toLocaleString()
                  : 'Never'}
              </p>
            </div>
            <button
              class="button button-secondary"
              disabled={busy}
              onclick={() => revoke(connection)}
              >Revoke<span class="sr-only"> {connection.name}</span></button
            >
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</section>

<style>
  .mcp-connections {
    max-width: var(--content-width);
  }
  .mcp-connections > section {
    max-width: 56rem;
  }
  .connection-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 1rem;
  }
  .connection-list li {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 1rem;
    padding-block: 1rem;
    border-bottom: 1px solid var(--border);
  }
  .connection-list li > div {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .connection-list h4 {
    font-size: 1.125rem;
    font-weight: 500;
    line-height: 1.35;
  }
  @media (min-width: 48rem) {
    .connection-list h4 { font-size: 1.25rem; }
  }
  .connection-list p {
    margin-block: 0.5rem;
  }
  @media (max-width: 30rem) {
    .connection-list li {
      flex-direction: column;
    }
  }
</style>
