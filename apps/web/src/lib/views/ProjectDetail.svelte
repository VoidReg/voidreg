<script lang="ts">
  import Breadcrumb from '$lib/components/Breadcrumb.svelte';
  import { resolve } from '$app/paths';
  import ReadingColumn from '$lib/components/ReadingColumn.svelte';
  import ArticleBody from '@voidreg/publishing-ui/ArticleBody.svelte';
  import ArticleCard from '$lib/publishing/ArticleCard.svelte';
  import type { Article } from '@voidreg/publishing-ui/api';
  import type { ProjectLog } from '$lib/topics';
  import type { Project } from '$lib/data/projects';
  // Shared by the public project page and the private draft preview.
  let {
    project,
    log,
    live = true
  }: { project: Project; log: ProjectLog; live?: boolean } = $props();
  const topics = $derived([...log.sections.map((s) => s.topic), ...log.more]);
  const allPosts = $derived(`/blog?project=${encodeURIComponent(project.slug)}`);
</script>

<main id="main-content" class="site-container page-shell">
  <ReadingColumn>
    <Breadcrumb
      items={[
        { label: 'Home', href: resolve('/') },
        { label: 'Projects', href: resolve('/projects') },
        { label: project.title }
      ]}
    />
  </ReadingColumn>
  <article class="section-stack detail-article">
    <ReadingColumn>
      <header class="section-stack detail-header">
        <p class="eyebrow">{project.category}</p>
        <h1 class="display-heading">{project.title}</h1>
        <p class="lead">{project.summary}</p>
        {#if project.tags.length}<div class="tags">
            {#each project.tags as tag (tag)}<span class="tag">{tag}</span>{/each}
          </div>{/if}
        {#if topics.length}<nav aria-label="Topics in this project">
            <ul class="chip-row labelled-chips">
              <li><span class="chip-label">Topics</span></li>
              {#each topics as topic (topic.id)}<li>
                  {#if live}<a
                      class="chip chip-topic"
                      href={resolve('/projects/[slug]/topics/[topic]', {
                        slug: project.slug,
                        topic: topic.slug
                      })}>{topic.title} <span class="chip-count">{topic.post_count}</span></a
                    >{:else}<span class="chip chip-topic"
                      >{topic.title} <span class="chip-count">{topic.post_count}</span></span
                    >{/if}
                </li>{/each}
            </ul>
          </nav>{/if}
        <!-- eslint-disable svelte/no-navigation-without-resolve -- repository and demo links are external -->
        {#if project.repo_url || project.demo_url}<div class="button-row">
            {#if project.repo_url}<a class="button button-secondary" href={project.repo_url}
                >Repository</a
              >{/if}{#if project.demo_url}<a class="button button-secondary" href={project.demo_url}
                >Live demo</a
              >{/if}
          </div>{/if}
        <!-- eslint-enable svelte/no-navigation-without-resolve -->
      </header>
    </ReadingColumn>
    {#if project.hero_image}<img
        class="project-image"
        src={project.hero_image}
        alt={project.hero_alt ?? project.title}
      />{/if}
    <ArticleBody article={project as unknown as Article} />
  </article>
  {#if project.related?.length}<ReadingColumn>
      <section class="section-stack" aria-labelledby="related-projects">
        <h2 id="related-projects" class="section-heading">Related projects</h2>
        <ul class="follows-list">
          {#each project.related as related (related.id)}<li class="follows-item">
              <span class="eyebrow">{related.category}</span>
              <h3>
                <a class="text-link" href={resolve('/projects/[slug]', { slug: related.slug })}
                  >{related.title}</a
                >
              </h3>
              <p>{related.summary}</p>
            </li>{/each}
        </ul>
      </section>
    </ReadingColumn>{/if}
  {#if log.total}<ReadingColumn>
      <section class="section-stack" aria-labelledby="project-posts">
        <h2 id="project-posts" class="section-heading">
          Project log <span class="section-count">{log.total}</span>
        </h2>
        {#if log.sections.length}
          <p class="lead">Posts that follow this project, grouped by topic. Newest first.</p>
          {#each log.sections as section (section.topic.id)}
            <section class="topic-block" aria-labelledby={`topic-${section.topic.slug}`}>
              <header class="topic-head">
                <h3 id={`topic-${section.topic.slug}`} class="topic-title">
                  {#if live}<a
                      class="text-link"
                      href={resolve('/projects/[slug]/topics/[topic]', {
                        slug: project.slug,
                        topic: section.topic.slug
                      })}>{section.topic.title}</a
                    >{:else}{section.topic.title}{/if}
                  <span class="section-count">{section.topic.post_count}</span>
                </h3>
                {#if section.topic.summary}<p class="topic-summary">{section.topic.summary}</p>{/if}
              </header>
              <div class="note-list">
                {#each section.items as article (article.slug)}<ArticleCard
                    {article}
                    heading="h4"
                    hideTopic
                  />{/each}
              </div>
              {#if live && section.topic.post_count > section.items.length}<p>
                  <a
                    class="text-link"
                    href={resolve('/projects/[slug]/topics/[topic]', {
                      slug: project.slug,
                      topic: section.topic.slug
                    })}>All {section.topic.post_count} posts in {section.topic.title}</a
                  >
                </p>{/if}
            </section>
          {/each}
          {#if log.more.length}<nav class="topic-more" aria-label="More topics">
              <h3 class="topic-title">More topics</h3>
              <ul class="chip-row">
                {#each log.more as topic (topic.id)}<li>
                    {#if live}<a
                        class="chip"
                        href={resolve('/projects/[slug]/topics/[topic]', {
                          slug: project.slug,
                          topic: topic.slug
                        })}>{topic.title} <span class="chip-count">{topic.post_count}</span></a
                      >{:else}<span class="chip">{topic.title}</span>{/if}
                  </li>{/each}
              </ul>
            </nav>{/if}
          {#if log.other}<section class="topic-block" aria-labelledby="topic-other">
              <header class="topic-head">
                <h3 id="topic-other" class="topic-title">
                  Other posts <span class="section-count">{log.other.total}</span>
                </h3>
              </header>
              <div class="note-list">
                {#each log.other.items as article (article.slug)}<ArticleCard
                    {article}
                    heading="h4"
                  />{/each}
              </div>
              {#if live && log.other.total > log.other.items.length}<p>
                  <a class="text-link" href={resolve(`${allPosts}&topic=none` as '/blog')}
                    >All {log.other.total} other posts</a
                  >
                </p>{/if}
            </section>{/if}
        {:else}
          <p class="lead">Posts that follow this project, newest first.</p>
          <div class="note-list">
            {#each log.flat as article (article.slug)}<ArticleCard {article} heading="h3" />{/each}
          </div>
          {#if live && log.total > log.flat.length}<p>
              <a class="text-link" href={resolve(allPosts as '/blog')}>All {log.total} posts</a>
            </p>{/if}
        {/if}
      </section>
    </ReadingColumn>{/if}
  <ReadingColumn>
    <p class="button-row">
      <a class="text-link" href={resolve('/projects')}>All projects</a>
      <a class="text-link" href={resolve(`/map?focus=${encodeURIComponent(project.slug)}`)}
        >See on the map</a
      >
    </p>
  </ReadingColumn>
</main>

<style>
  .topic-block {
    display: grid;
    gap: 1rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--border);
  }
  .topic-head {
    display: grid;
    gap: 0.5rem;
  }
  .topic-title {
    margin: 0;
    font-size: 1.25rem;
    line-height: 1.3;
  }
  .topic-summary {
    margin: 0;
    color: var(--muted-foreground);
  }
  .topic-more {
    display: grid;
    gap: 0.75rem;
  }
  .project-image {
    width: 100%;
    height: auto;
    border-radius: var(--radius);
  }
</style>
