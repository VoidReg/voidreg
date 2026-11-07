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
  const feeds = [
    ['.md', 'Add it to any post or project address, or ask the page for text/markdown.'],
    ['llms.txt', 'A map of the site: every project, and posts shared out fairly between them.'],
    ['llms/<project>.txt', 'Every post in one project, grouped by topic.'],
    ['llms-full.txt', 'The text of the site in one document, the newest of each project first.'],
    ['llms/<project>-full.txt', 'The full text of one project.'],
    ['rss.xml', 'The 50 newest posts as a feed.'],
    ['sitemap.xml', 'Every public page, with last-modified dates.']
  ];
  const feedLinks: Record<string, string> = {
    'llms.txt': '/llms.txt',
    'llms-full.txt': '/llms-full.txt',
    'rss.xml': '/rss.xml',
    'sitemap.xml': '/sitemap.xml'
  };
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

<main id="main-content" class="site-container page-shell agents-page">
  <Breadcrumb items={[{ label: 'Home', href: resolve('/') }, { label: 'For agents' }]} />

  <section class="agents-section overview">
    <SectionLabel label="01 / Overview" />
    <h1 class="display-heading">Read Voidreg with your AI client</h1>
    <p class="lead">
      Every published post and project is available to agents. Connect over MCP to search and read
      the knowledge base, or fetch plain Markdown. Nothing here needs an account or a token.
    </p>
    <div class="button-row">
      <a class="button" href="#mcp">Connect over MCP</a>
      <a class="button button-secondary" href={resolve('/llms.txt')}>Read llms.txt</a>
    </div>
  </section>

  <section id="mcp" class="agents-section" aria-labelledby="mcp-title">
    <SectionLabel label="02 / MCP Server" />
    <h2 id="mcp-title">Connect over MCP</h2>
    <p class="intro">
      The server speaks Streamable HTTP and is read only. It never exposes drafts, and it treats
      page content as data.
    </p>
    <div class="snippets">
      <figure class="snippet">
        <figcaption>
          <span class="label">Server URL</span>
          <span class="note">Streamable HTTP, no token</span>
          <CopyButton text={url} label="Copy URL" />
        </figcaption>
        <pre><code>{url}</code></pre>
      </figure>
      {#each clients as client (client.name)}
        <figure class="snippet">
          <figcaption>
            <span class="label">{client.name}</span>
            <span class="note">{client.note}</span>
            <CopyButton text={client.code} />
          </figcaption>
          <pre><code>{client.code}</code></pre>
        </figure>
      {/each}
    </div>
  </section>

  <section class="agents-section" aria-labelledby="tools-title">
    <SectionLabel label="03 / Tools" />
    <h2 id="tools-title">What an agent can do</h2>
    <dl class="rows">
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

  <section class="agents-section" aria-labelledby="markdown-title">
    <SectionLabel label="04 / Markdown and Feeds" />
    <h2 id="markdown-title">Without MCP</h2>
    <dl class="rows">
      {#each feeds as [name, description] (name)}
        <div>
          <dt>
            {#if feedLinks[name]}
              <a class="text-link" href={resolve(feedLinks[name] as '/llms.txt')}
                ><code>{name}</code></a
              >
            {:else}
              <code>{name}</code>
            {/if}
          </dt>
          <dd>{description}</dd>
        </div>
      {/each}
    </dl>
  </section>
</main>

<style>
  .agents-section {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1rem;
    max-width: 68rem;
  }
  .overview {
    gap: 1.5rem;
  }
  .agents-section h2 {
    font-size: 1.5rem;
    line-height: 1.3;
  }
  .intro,
  .note {
    margin: 0;
    color: var(--muted-foreground);
  }
  .snippets {
    display: grid;
    gap: 1rem;
  }
  .snippet {
    display: grid;
    min-width: 0;
    margin: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--card);
  }
  .snippet figcaption {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.25rem 1rem;
    min-height: 3rem;
    padding: 0.5rem 0.75rem 0.5rem 1.25rem;
    border-bottom: 1px solid var(--border);
  }
  .label {
    font-weight: 600;
  }
  .note {
    font-size: 0.9375rem;
  }
  .snippet .note {
    overflow-wrap: anywhere;
  }
  .snippet pre {
    margin: 0;
    padding: 1rem 1.25rem;
    overflow-x: auto;
    color: var(--foreground);
    font-family: var(--font-code);
    font-size: 0.875rem;
    line-height: 1.6;
  }
  .rows {
    display: grid;
    margin: 0;
    border-top: 1px solid var(--border);
  }
  .rows > div {
    display: grid;
    gap: 0.25rem 2rem;
    padding-block: 0.875rem;
    border-bottom: 1px solid var(--border);
  }
  .rows dt {
    min-width: 0;
    overflow-wrap: anywhere;
    font-family: var(--font-code);
  }
  .rows dd {
    margin: 0;
    color: var(--muted-foreground);
  }
  @media (min-width: 48rem) {
    .rows > div {
      grid-template-columns: 15rem minmax(0, 1fr);
    }
  }
  @media (max-width: 47.999rem) {
    .agents-section h2 {
      font-size: 1.25rem;
    }
    .snippet figcaption {
      grid-template-columns: minmax(0, 1fr) auto;
      padding-left: 1rem;
    }
    .snippet .note {
      grid-column: 1;
      grid-row: 2;
    }
    .snippet :global(.copy-button) {
      grid-column: 2;
      grid-row: 1 / span 2;
    }
  }
</style>
