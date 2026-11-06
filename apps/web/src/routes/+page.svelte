<script lang="ts">
  import copy from '$lib/content/portfolio-copy.json';
  import CircuitDivider from '$lib/components/CircuitDivider.svelte';
  import ContactBand from '$lib/components/ContactBand.svelte';
  import EmptyContent from '$lib/components/EmptyContent.svelte';
  import FeatureProjectCard from '$lib/components/FeatureProjectCard.svelte';
  import HeroPanel from '$lib/components/HeroPanel.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import InterestStrip from '$lib/components/InterestStrip.svelte';
  import ProjectCard from '$lib/components/ProjectCard.svelte';
  import Reveal from '$lib/components/Reveal.svelte';
  import SectionHeader from '$lib/components/SectionHeader.svelte';
  import ArticleCard from '$lib/publishing/ArticleCard.svelte';
  import Seo from '$lib/Seo.svelte';
  import { resolve } from '$app/paths';

  let { data } = $props();
  const projects = $derived(data.projects);
  const posts = $derived(data.posts);
  // Manifest labels read "01 / FEATURED PROJECTS"; the index is a separate graphic.
  const splitLabel = (label: string) => label.split(' / ') as [string, string];
  const [workIndex, workEyebrow] = splitLabel(copy.workLabel);
  const [notesIndex, notesEyebrow] = splitLabel(copy.notesLabel);
  const [, contactEyebrow] = splitLabel(copy.contactLabel);
  const interestItems = copy.interests.split(/\s*\|\s*|\n/).filter(Boolean);
</script>

<Seo title="Voidreg | Deep dive into the Void" description={copy.homeDescription} />

<main id="main-content" class="home-page">
  <section class="band hero-band" aria-labelledby="hero-title">
    <div class="site-container hero-grid">
      <div class="hero-copy">
        <p class="hero-status rise" style:--i="0">{copy.homeEyebrow}</p>
        <h1 id="hero-title" class="display-xl rise" style:--i="1">
          Deep dive into the <span class="accent">Void</span>
        </h1>
        <p class="hero-lead rise" style:--i="2">{copy.homeIntro}</p>
        <div class="button-row rise" style:--i="3">
          <a class="button" href={resolve('/projects')}
            >View projects <Icon name="arrow-right" size={16} /></a
          ><a class="button button-secondary" href={resolve('/blog')}>Read the blog</a>
        </div>
        <p class="hero-note rise" style:--i="4">{copy.heroNote}</p>
      </div>
      <HeroPanel />
    </div>
  </section>

  <InterestStrip items={interestItems} label="Areas of work" />

  <section class="band band-pad" aria-labelledby="selected-projects">
    <div class="site-container">
      <CircuitDivider />
      <div class="section-split">
        <SectionHeader
          index={workIndex}
          eyebrow={workEyebrow}
          title={copy.workTitle}
          id="selected-projects"
        />
        <Reveal>
          <div class="section-body">
            <div class="work-grid">
              {#each projects as project, i (project.title)}
                {#if i === 0}<FeatureProjectCard {project} />{:else}<ProjectCard
                    {project}
                  />{/if}{:else}<EmptyContent kind="featured" />{/each}
            </div>
            <div>
              <a class="button" href={resolve('/projects')}
                >View all projects <Icon name="arrow-right" size={16} /></a
              >
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  </section>

  <section class="band band-card band-pad" aria-labelledby="latest-posts">
    <div class="site-container">
      <CircuitDivider delay={4} />
      <div class="section-split">
        <SectionHeader
          index={notesIndex}
          eyebrow={notesEyebrow}
          title={copy.notesTitle}
          id="latest-posts"
        />
        <Reveal>
          <div class="section-body">
            {#if posts.length}
              <div class="note-list">
                {#each posts as article (article.slug)}<ArticleCard {article} heading="h3" />{/each}
              </div>
            {:else}<EmptyContent kind="articles" />{/if}
            <div>
              <a class="button button-secondary" href={resolve('/blog')}
                >View all blogs <Icon name="arrow-right" size={16} /></a
              >
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  </section>

  <ContactBand
    eyebrow={contactEyebrow}
    title={copy.contactBandTitle}
    body={copy.contact}
    action={copy.contactAction}
  />
</main>
