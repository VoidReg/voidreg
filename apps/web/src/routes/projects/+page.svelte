<script lang="ts">
  import { resolve } from '$app/paths';
  import ProjectCard from '$lib/components/ProjectCard.svelte';
  import { projects } from '$lib/data/projects';
  const featured = projects[0];
</script>

<svelte:head>
  <title>Projects | Voidreg</title>
  <meta
    name="description"
    content="Projects across systems, graphics, RF and embedded work, and design engineering."
  />
</svelte:head>

<main id="main-content" class="site-container page-shell projects-page">
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <a href={resolve('/')}>Home</a><span>/</span><span aria-current="page">Projects</span>
  </nav>
  <section class="projects-intro">
    <p class="eyebrow">Projects</p>
    <h1 class="display-heading">Projects across layers</h1>
    <p class="lead">
      A collection of projects across systems, graphics, RF and embedded work, and design
      engineering.
    </p>
    <p class="project-disciplines">Systems · Graphics · RF / Embedded · Design Engineering</p>
  </section>

  <section class="section-stack" aria-labelledby="featured-project">
    <p id="featured-project" class="eyebrow">01 / Featured Project</p>
    <article class="featured-project">
      <div class="render-placeholder">
        <p class="eyebrow">miniRT render placeholder</p>
        <p class="placeholder-note">Replace with a verified miniRT render.</p>
      </div>
      <div class="featured-copy">
        <p class="eyebrow">Featured Project / Graphics</p>
        <h2>{featured.title}</h2>
        <p class="featured-purpose">{featured.summary}</p>
        <p class="lead">
          Focus: intersections, camera rays, shading, texture mapping, and rendering concurrency.
        </p>
        <div class="tags" aria-label="miniRT technologies">
          {#each featured.tags as tag (tag)}<span class="tag">{tag}</span>{/each}
        </div>
        <span class="button button-disabled" aria-disabled="true"
          >View project <span aria-hidden="true">→</span></span
        >
      </div>
    </article>
  </section>

  <section class="section-stack" aria-labelledby="more-projects">
    <h2 id="more-projects" class="more-heading">More projects</h2>
    <div class="card-grid">
      {#each [projects[2], projects[1], projects[3]] as project (project.title)}<ProjectCard
          {project}
        />{/each}
    </div>
  </section>
</main>

<style>
  .projects-intro {
    display: grid;
    gap: 1.5rem;
    max-width: 68rem;
  }
  .project-disciplines {
    color: var(--primary);
    font-size: 0.875rem;
    text-transform: uppercase;
  }
  .featured-project {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
    gap: 2rem;
    border-radius: var(--radius);
    background: var(--card);
    padding: 1.5rem;
  }
  .render-placeholder {
    display: grid;
    min-height: 20rem;
    place-content: center;
    gap: 0.75rem;
    border-radius: var(--radius);
    background: var(--secondary);
    text-align: center;
  }
  .featured-copy {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1.25rem;
    padding: 0.25rem 0;
  }
  .featured-copy h2,
  .more-heading {
    font-size: 1.5rem;
    line-height: 1.3;
  }
  .featured-purpose {
    font-size: 1.125rem;
  }
  @media (max-width: 47.999rem) {
    .featured-project {
      grid-template-columns: 1fr;
      padding: 1.25rem;
    }
    .render-placeholder {
      min-height: 14rem;
    }
    .featured-copy .button {
      width: 100%;
    }
  }
</style>
