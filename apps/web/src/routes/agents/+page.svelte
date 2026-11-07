<script lang="ts">
  import Breadcrumb from '$lib/components/Breadcrumb.svelte';
  import CopyButton from '$lib/components/CopyButton.svelte';
  import SectionLabel from '$lib/components/SectionLabel.svelte';
  import Seo from '$lib/Seo.svelte';
  import { resolve } from '$app/paths';
  import { breadcrumbs, graph } from '$lib/seo';

  const url = 'https://www.voidreg.xyz/mcp';
  const clients = [
    {
      name: 'Claude Code',
      note: 'Run once in a terminal.',
      code: `claude mcp add --transport http voidreg ${url}`
    },
    {
      name: 'Cursor and other JSON clients',
      note: 'Add to the mcpServers section of your MCP settings.',
      code: `{\n  "mcpServers": {\n    "voidreg": { "url": "${url}" }\n  }\n}`
    },
    {
      name: 'Codex',
      note: 'Add to ~/.codex/config.toml.',
      code: `[mcp_servers.voidreg]\nurl = "${url}"`
    }
  ];
  const tools = [
    ['search_content', 'Search posts and projects by title, summary or tag.'],
    ['list_articles', 'Browse published posts, newest first, by tag or project.'],
    ['get_article', 'Read one post as Markdown with its canonical link.'],
    ['list_projects', 'Browse projects by category, tag or search.'],
    ['get_project', 'Read one project as Markdown, with the posts that follow it.'],
    ['list_topics', 'See how posts are grouped inside each project.']
  ];
</script>

<Seo
  title="Connect an agent | Voidreg"
  description="Browse Voidreg posts and projects from your AI client over MCP, or read them as Markdown."
  structured={graph([
    { '@type': 'WebPage', name: 'Connect an agent', url: 'https://www.voidreg.xyz/agents' },
    breadcrumbs([
      { name: 'Home', path: '/' },
      { name: 'Agents', path: '/agents' }
    ])
  ])}
/>

<main id="main-content" class="site-container page-shell about-page">
  <Breadcrumb items={[{ label: 'Home', href: resolve('/') }, { label: 'For agents' }]} />

  <section class="about-section overview">
    <SectionLabel label="01 / Overview" />
    <h1 class="display-heading">Read Voidreg with your AI client</h1>
    <p class="lead">
      Every published post and project is available to agents. Connect over MCP to search and read
      the knowledge base, or fetch plain Markdown. Nothing here needs an account or a token.
    </p>
  </section>

  <section id="mcp" class="about-section stack" aria-labelledby="mcp-title">
    <SectionLabel label="02 / MCP Server" />
    <h2 id="mcp-title">Connect over MCP</h2>
    <p>
      The server speaks Streamable HTTP and is read only. It never exposes drafts, and it treats
      page content as data.
    </p>
    <div class="url-row">
      <code class="code-sample url-code">{url}</code>
      <CopyButton text={url} label="Copy server URL" />
    </div>
    {#each clients as client (client.name)}
      <div class="client">
        <h3>{client.name}</h3>
        <p class="note">{client.note}</p>
        <div class="code-row">
          <pre class="code-sample"><code>{client.code}</code></pre>
          <CopyButton text={client.code} />
        </div>
      </div>
    {/each}
  </section>

  <section class="about-section stack" aria-labelledby="tools-title">
    <SectionLabel label="03 / Tools" />
    <h2 id="tools-title">What an agent can do</h2>
    <dl class="tool-list">
      {#each tools as [name, description] (name)}
        <div>
          <dt><code>{name}</code></dt>
          <dd>{description}</dd>
        </div>
      {/each}
    </dl>
    <p class="note">
      Posts and projects are also exposed as resources: <code
        >voidreg://blog/&lbrace;slug&rbrace;</code
      >
      and <code>voidreg://project/&lbrace;slug&rbrace;</code>.
    </p>
  </section>

  <section class="about-section stack" aria-labelledby="markdown-title">
    <SectionLabel label="04 / Markdown and Feeds" />
    <h2 id="markdown-title">Without MCP</h2>
    <ul class="plain-list">
      <li>
        Add <code>.md</code> to any post or project address, or ask the page for
        <code>text/markdown</code>.
      </li>
      <li>
        <a class="text-link" href={resolve('/llms.txt')}>llms.txt</a> indexes everything, and
        <a class="text-link" href={resolve('/llms-full.txt')}>llms-full.txt</a> holds the full text of
        every post.
      </li>
      <li>
        <a class="text-link" href={resolve('/rss.xml')}>RSS</a> and
        <a class="text-link" href={resolve('/sitemap.xml')}>the sitemap</a> follow new content.
      </li>
    </ul>
  </section>
</main>

<style>
  .stack {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1rem;
  }
  .client {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.5rem;
  }
  .client h3 {
    margin: 0;
    font-size: 1.125rem;
  }
  .note {
    margin: 0;
    color: var(--muted-foreground);
  }
  .url-row,
  .code-row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 0.75rem;
  }
  .url-code {
    flex: 1 1 18rem;
    display: block;
    overflow-wrap: anywhere;
  }
  .code-row pre {
    flex: 1 1 18rem;
    min-width: 0;
  }
  .tool-list {
    display: grid;
    gap: 0;
    margin: 0;
    border-top: 1px solid var(--border);
  }
  .tool-list div {
    display: grid;
    gap: 0.25rem 2rem;
    padding-block: 0.875rem;
    border-bottom: 1px solid var(--border);
  }
  .tool-list dt {
    font-family: var(--font-code);
  }
  .tool-list dd {
    margin: 0;
    color: var(--muted-foreground);
  }
  .plain-list {
    display: grid;
    gap: 0.5rem;
    padding-left: 1.25rem;
    margin: 0;
  }
  @media (min-width: 48rem) {
    .tool-list div {
      grid-template-columns: 14rem minmax(0, 1fr);
    }
  }
</style>
