<script lang="ts">
  import { resolve } from '$app/paths';
  import ReadingColumn from '$lib/components/ReadingColumn.svelte';
  import ArticleBody from '@voidreg/publishing-ui/ArticleBody.svelte';
  import Comments from '$lib/publishing/Comments.svelte';
  import type { Article } from '@voidreg/publishing-ui/api';
  import type { Project } from '$lib/data/projects';
  // Shared by the public post page and the private draft preview (no comments or source link).
  let {
    article,
    projects,
    newer = null,
    older = null,
    live = true
  }: {
    article: Article;
    projects: Project[];
    newer?: Article | null;
    older?: Article | null;
    live?: boolean;
  } = $props();
</script>

<main id="main-content" class="site-container page-shell">
  <ReadingColumn>
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href={resolve('/')}>Home</a><span>/</span><a href={resolve('/blog')}>Blog</a><span>/</span
      ><span aria-current="page">{article.title}</span>
    </nav>
  </ReadingColumn>
  <article class="section-stack detail-article">
    <ReadingColumn>
      <header class="section-stack detail-header">
        <p class="eyebrow">{article.category}</p>
        <h1 class="display-heading">{article.title}</h1>
        <p class="lead">{article.summary}</p>
        {#if article.tags?.length}<ul class="chip-row" aria-label="Tags">
            {#each article.tags as tag (tag)}<li>
                <a class="chip" href={resolve(`/blog?tag=${encodeURIComponent(tag)}` as '/blog')}
                  >{tag}</a
                >
              </li>{/each}
          </ul>{/if}
        <p>
          {#if article.published_at}<time datetime={article.published_at}
              >{new Date(article.published_at).toLocaleDateString('en', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                timeZone: 'UTC'
              })}</time
            >{/if}{#if article.reading_time_minutes}
            | {article.reading_time_minutes} min read{/if}
        </p>
        {#if live}<a class="text-link" href={resolve('/blog/[slug]/source', { slug: article.slug })}
            >View Markdown source</a
          >{/if}
      </header>
    </ReadingColumn>
    {#if article.hero_image}<figure>
        <img
          style="max-width:100%;height:auto"
          src={article.hero_image}
          alt={article.hero_alt ?? ''}
        />{#if article.hero_caption}<figcaption>{article.hero_caption}</figcaption>{/if}
      </figure>{/if}<ArticleBody {article} />
  </article>
  {#if projects.length}<ReadingColumn>
      <aside class="follows section-stack" aria-labelledby="follows-heading">
        <h2 id="follows-heading" class="section-heading">Following</h2>
        <ul class="follows-list">
          {#each projects as project (project.id)}<li class="follows-item">
              <span class="eyebrow">{project.category}</span>
              <h3>
                <a class="text-link" href={resolve('/projects/[slug]', { slug: project.slug })}
                  >{project.title}</a
                >
              </h3>
              <p>{project.summary}</p>
              <a class="text-link" href={resolve(`/map?focus=${encodeURIComponent(project.slug)}`)}
                >See on the map</a
              >
            </li>{/each}
        </ul>
        {#if newer || older}<nav class="timeline-nav" aria-label="More posts in this project">
            {#if older}<a
                class="timeline-link"
                rel="prev"
                href={resolve('/blog/[slug]', { slug: older.slug })}
                ><span class="eyebrow">Previous in {projects[0].title}</span><span
                  >{older.title}</span
                ></a
              >{/if}
            {#if newer}<a
                class="timeline-link"
                data-side="next"
                rel="next"
                href={resolve('/blog/[slug]', { slug: newer.slug })}
                ><span class="eyebrow">Next in {projects[0].title}</span><span>{newer.title}</span
                ></a
              >{/if}
          </nav>{/if}
      </aside>
    </ReadingColumn>{/if}
  <ReadingColumn>
    {#if live}{#key article.id ?? article.slug}<Comments slug={article.slug} />{/key}{/if}
  </ReadingColumn>
</main>
