<script lang="ts">
  import type { Snippet } from 'svelte';
  import { resolve } from '$app/paths';
  import Icon from './components/Icon.svelte';
  import { theme } from './ui/theme.svelte';
  import type { AdminTab } from './navigation';

  let {
    tab,
    busy = false,
    onsignout,
    children
  }: { tab: AdminTab; busy?: boolean; onsignout: () => void; children: Snippet } = $props();

  const sections: {
    id: AdminTab;
    label: string;
    icon: 'file' | 'folder' | 'image' | 'message' | 'plug';
  }[] = [
    { id: 'articles', label: 'Articles', icon: 'file' },
    { id: 'projects', label: 'Projects', icon: 'folder' },
    { id: 'media', label: 'Media', icon: 'image' },
    { id: 'comments', label: 'Comments', icon: 'message' },
    { id: 'mcp', label: 'MCP connections', icon: 'plug' }
  ];
</script>

<div class="shell">
  <aside class="shell-side">
    <p class="shell-brand"><span>Voidreg</span> Publishing</p>
    <nav aria-label="Admin sections">
      <ul>
        {#each sections as section (section.id)}
          <li>
            <a
              href={resolve('/') + '?tab=' + section.id}
              aria-current={tab === section.id ? 'page' : undefined}
              ><Icon name={section.icon} size={18} /><span>{section.label}</span></a
            >
          </li>
        {/each}
      </ul>
    </nav>
    <div class="shell-tools">
      <button
        type="button"
        class="ui-btn ui-btn-quiet"
        aria-label={theme.dark ? 'Switch to light theme' : 'Switch to dark theme'}
        onclick={() => theme.toggle()}
        ><Icon name={theme.dark ? 'sun' : 'moon'} size={18} /><span class="shell-tool-label"
          >{theme.dark ? 'Light' : 'Dark'}</span
        ></button
      >
      <button type="button" class="ui-btn ui-btn-quiet" disabled={busy} onclick={onsignout}
        ><Icon name="logout" size={18} /><span class="shell-tool-label">Sign out</span></button
      >
    </div>
  </aside>
  <main id="main-content" class="shell-main" tabindex="-1">
    {@render children()}
  </main>
</div>

<style>
  .shell {
    display: grid;
    grid-template-columns: 15rem minmax(0, 1fr);
    min-height: 100dvh;
  }
  .shell-side {
    position: sticky;
    inset-block-start: 0;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    border-inline-end: 1px solid var(--border);
    background: var(--card);
    padding: 1.25rem 0.75rem;
    height: 100dvh;
  }
  .shell-brand {
    padding-inline: 0.75rem;
    font-size: 1rem;
    font-weight: 500;
  }
  .shell-brand span {
    font-weight: 700;
  }
  ul {
    display: grid;
    gap: 0.125rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  nav a {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    border-inline-start: 3px solid transparent;
    padding: 0.5rem 0.75rem;
    min-height: 2.75rem;
    color: var(--muted-foreground);
    font-size: 0.9375rem;
    text-decoration: none;
  }
  nav a:hover {
    background: var(--secondary);
    color: var(--foreground);
  }
  nav a[aria-current='page'] {
    border-inline-start-color: var(--foreground);
    background: var(--background);
    color: var(--foreground);
    font-weight: 600;
  }
  .shell-tools {
    display: grid;
    gap: 0.25rem;
    margin-block-start: auto;
  }
  .shell-tools :global(.ui-btn) {
    justify-content: flex-start;
  }
  .shell-main {
    padding: 2rem clamp(1rem, 3vw, 2.5rem) 4rem;
    min-width: 0;
  }
  .shell-main:focus {
    outline: none;
  }
  @media (max-width: 63.999rem) {
    .shell {
      grid-template-columns: minmax(0, 1fr);
    }
    .shell-side {
      position: static;
      flex-flow: row wrap;
      align-items: center;
      gap: 0.5rem 1rem;
      border-inline-end: 0;
      border-bottom: 1px solid var(--border);
      padding: 0.75rem 1rem;
      height: auto;
    }
    .shell-brand {
      padding-inline: 0;
    }
    .shell-side nav {
      order: 3;
      flex: 1 0 100%;
      overflow-x: auto;
    }
    ul {
      display: flex;
      gap: 0.25rem;
    }
    nav a {
      border-inline-start: 0;
      border-bottom: 3px solid transparent;
      white-space: nowrap;
    }
    nav a[aria-current='page'] {
      border-bottom-color: var(--foreground);
    }
    .shell-tools {
      display: flex;
      margin-block-start: 0;
      margin-inline-start: auto;
    }
    .shell-tool-label {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
  }
</style>
