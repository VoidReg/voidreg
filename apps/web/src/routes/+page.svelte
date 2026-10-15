<script lang="ts">
  import { resolve } from '$app/paths';
  import BrandMark from '$lib/components/BrandMark.svelte';
  import ProjectCard from '$lib/components/ProjectCard.svelte';
  import { projects } from '$lib/data/projects';

  import { onMount } from 'svelte';
  import ArticleCard from '$lib/publishing/ArticleCard.svelte';
  import { getPublic, type Article, type Page } from '$lib/publishing/api';
  let posts = $state<Article[]>([]),
    postsLoading = $state(true),
    postsError = $state('');
  async function loadPosts(force = false) {
    postsLoading = true;
    postsError = '';
    try {
      posts = (await getPublic<Page<Article>>('/blogs?per_page=3', undefined, force)).items;
    } catch {
      postsError = 'Latest articles could not be loaded.';
    } finally {
      postsLoading = false;
    }
  }
  onMount(() => {
    void loadPosts();
  });
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
        <a class="button" href={resolve('/projects')}>View projects</a><a
          class="button button-secondary"
          href={resolve('/blog')}>Read the blog</a
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
      {#if postsLoading}<p role="status">Loading latest articles…</p>
      {:else if postsError}<p role="alert">{postsError}</p>
        <button class="button button-secondary" onclick={() => loadPosts(true)}>Try again</button>
      {:else if posts.length === 0}<p>No articles published yet. Check back soon.</p>
      {:else}{#each posts as article (article.slug)}<ArticleCard
            {article}
            heading="h3"
          />{/each}{/if}
    </div>
    <a class="text-link" href={resolve('/blog')}>View all blogs <span aria-hidden="true">→</span></a
    >
  </section>

  <section>
    <a class="text-link" href={resolve('/about#contact')}
      >Get in touch <span aria-hidden="true">→</span></a
    >
  </section>
</main>

<style>
  .home-page {
    container: home-content / inline-size;
  }
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
  }
  @container home-content (max-width: 59.999rem) {
    .hero {
      grid-template-columns: 1fr;
    }
    .hero-mark {
      order: 2;
    }
    .card-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @container home-content (max-width: 43.999rem) {
    .card-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
