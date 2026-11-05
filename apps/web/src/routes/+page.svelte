<script lang="ts">
  import copy from '$lib/content/portfolio-copy.json';
  import EmptyContent from '$lib/components/EmptyContent.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import { resolve } from '$app/paths';
  import BrandMark from '$lib/components/BrandMark.svelte';
  import ProjectCard from '$lib/components/ProjectCard.svelte';
  import ArticleCard from '$lib/publishing/ArticleCard.svelte';
  import Seo from '$lib/Seo.svelte';
  let { data } = $props();
  const projects = $derived(data.projects);
  const posts = $derived(data.posts);
</script>

<Seo title="Voidreg | Deep dive into the Void" description={copy.homeDescription} />

<main id="main-content" class="site-container page-shell home-page">
  <section class="hero">
    <div class="hero-copy">
      <p class="eyebrow">{copy.homeEyebrow}</p>
      <h1 class="display-heading">Deep dive into the Void</h1>
      <p class="lead">
        {copy.homeIntro}
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
      {copy.interests}
    </p>
    <p>Independent portfolio | projects, experiments, and technical notes</p>
  </section>

  <section class="section-stack" aria-labelledby="selected-projects">
    <div>
      <p class="eyebrow">01 / Featured Projects</p>
      <h2 id="selected-projects" class="section-heading">Selected projects</h2>
    </div>
    <div class="card-grid">
      {#each projects as project (project.title)}<ProjectCard {project} />{:else}<EmptyContent
          kind="featured"
        />{/each}
    </div>
    <div>
      <a class="button" href={resolve('/projects')}
        >View all projects <Icon name="arrow-right" size={16} /></a
      >
    </div>
  </section>

  <section class="section-stack writing-preview" aria-labelledby="latest-posts">
    <div>
      <p class="eyebrow">02 / Blogs</p>
      <h2 id="latest-posts" class="section-heading">Latest Blog Posts</h2>
    </div>
    <div class="post-list">
      {#each posts as article (article.slug)}<ArticleCard
          {article}
          heading="h3"
        />{:else}<EmptyContent kind="articles" />{/each}
    </div>
    <a class="text-link" href={resolve('/blog')}
      >View all blogs <Icon name="arrow-right" size={16} /></a
    >
  </section>

  <section>
    <a class="text-link" href={resolve('/about#contact')}
      >Get in touch <Icon name="arrow-right" size={16} /></a
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
  .credibility p {
    white-space: pre-line;
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
