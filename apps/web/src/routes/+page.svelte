<script lang="ts">
  import { resolve } from '$app/paths';
  import BrandMark from '$lib/components/BrandMark.svelte';
  import ProjectCard from '$lib/components/ProjectCard.svelte';
  import { projects } from '$lib/data/projects';

  const posts = [
    {
      category: 'Design Engineering / Draft',
      title: 'How to validate a semantic color system',
      summary:
        'A practical approach to testing contrast, interaction states, and theme consistency.'
    },
    {
      category: 'Systems / Draft',
      title: 'What building an HTTP server teaches about protocol design',
      summary:
        'Parsing, connection lifecycles, and the boundary between a protocol and its implementation.'
    }
  ];
</script>

<svelte:head>
  <title>Voidreg | Deep dive into the Void</title>
  <meta
    name="description"
    content="Projects and writing on systems, graphics, RF, design engineering, and low-level programming."
  />
</svelte:head>

<main id="main-content" class="site-container page-shell home-page">
  <section class="hero">
    <div class="hero-copy">
      <p class="eyebrow">Systems · Graphics · Design Engineering</p>
      <h1 class="display-heading">Deep dive into the Void</h1>
      <p class="lead">
        A site where I share work and updates on low-level programming, graphics programming,
        bare-metal development, AI, and performance optimization.
      </p>
      <div class="button-row">
        <a class="button" href={resolve('/projects')}>View projects</a><span
          class="button button-secondary button-disabled"
          aria-disabled="true">Read the blog</span
        >
      </div>
    </div>
    <div class="hero-mark"><BrandMark size={192} extruded /></div>
  </section>

  <section class="credibility" aria-label="Areas of work">
    <p>
      Systems · Graphics · Web infrastructure<br />AI/ML · Bare-metal development · Kernel
      programming · Performance optimization
    </p>
    <p>Independent portfolio · projects, experiments, and technical notes</p>
  </section>

  <section class="section-stack" aria-labelledby="selected-projects">
    <div>
      <p class="eyebrow">01 / Featured Projects</p>
      <h2 id="selected-projects" class="section-heading">Selected projects</h2>
    </div>
    <div class="card-grid">
      {#each projects.slice(0, 3) as project (project.title)}<ProjectCard {project} />{/each}
    </div>
    <div>
      <a class="button" href={resolve('/projects')}
        >View all projects <span aria-hidden="true">→</span></a
      >
    </div>
  </section>

  <section class="section-stack writing-preview" aria-labelledby="latest-posts">
    <div>
      <p class="eyebrow">02 / Blogs</p>
      <h2 id="latest-posts" class="section-heading">Latest Blog Posts</h2>
    </div>
    <div class="post-list">
      {#each posts as post (post.title)}
        <article class="post-preview">
          <p class="eyebrow">{post.category}</p>
          <h3>{post.title}</h3>
          <p>{post.summary}</p>
          <p class="placeholder-note">Unpublished · date and reading time pending</p>
        </article>
      {/each}
    </div>
    <span class="control-disabled text-link" aria-disabled="true"
      >View all blogs <span aria-hidden="true">→</span></span
    >
  </section>

  <section>
    <a class="text-link" href={resolve('/about#contact')}
      >Get in touch <span aria-hidden="true">→</span></a
    >
  </section>
</main>

<style>
  .hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 18rem;
    gap: 3rem;
    align-items: center;
  }
  .hero-copy {
    display: grid;
    gap: 1.5rem;
    max-width: 47rem;
  }
  .hero-mark {
    display: grid;
    place-items: center;
  }
  .credibility {
    display: grid;
    gap: 1rem;
    border-top: 1px solid var(--border);
    padding-top: 1rem;
    color: var(--muted-foreground);
    font-family: var(--font-code);
    font-size: 0.75rem;
  }
  .credibility p:last-child {
    color: var(--primary);
  }
  .post-list {
    display: grid;
  }
  .post-preview {
    display: grid;
    gap: 0.65rem;
    border-bottom: 1px solid var(--border);
    padding-block: 1.5rem;
  }
  .post-preview:first-child {
    padding-top: 0;
  }
  .post-preview h3 {
    font-size: 1.5rem;
    line-height: 1.3;
  }
  @media (max-width: 63.999rem) {
    .hero {
      grid-template-columns: 1fr;
    }
    .hero-mark {
      order: 2;
    }
  }
  @media (max-width: 47.999rem) {
    .hero-mark :global(svg) {
      width: 10rem;
      height: 10rem;
    }
    .post-preview h3 {
      font-size: 1.25rem;
    }
  }
</style>
