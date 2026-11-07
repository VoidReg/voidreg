<script lang="ts">
  import copy from '$lib/content/portfolio-copy.json';
  import Icon from '$lib/components/Icon.svelte';
  import { resolve } from '$app/paths';
  import { enhance } from '$app/forms';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  let sending = $state(false);
  let sent = $derived(form !== null && 'sent' in form && form.sent === true);
  let failure = $derived(form !== null && 'error' in form ? form : null);
</script>

<svelte:head>
  <title>About | Voidreg</title>
  <meta name="description" content={copy.aboutDescription} />
</svelte:head>

<main id="main-content" class="site-container page-shell about-page">
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <a href={resolve('/')}>Home</a><span>/</span><span aria-current="page">About</span>
  </nav>

  <section class="about-section overview">
    <p class="eyebrow">01 / Overview</p>
    <p class="eyebrow">About</p>
    <h1 class="display-heading">{copy.aboutTitle}</h1>
    <p class="lead">
      {copy.aboutIntro}
    </p>
    <p class="project-disciplines">Independent projects and technical writing</p>
    <div class="button-row">
      <a class="button" href={resolve('/projects')}
        >Explore projects <Icon name="arrow-right" size={16} /></a
      ><a class="button button-secondary" href={resolve('/blog')}
        >Read the blog <Icon name="arrow-right" size={16} /></a
      >
    </div>
  </section>

  <section class="about-section prose-section">
    <p class="eyebrow">02 / Background</p>
    <h2>I learn by building.</h2>
    <p>
      Most of what I know comes from implementing systems and then digging into why they behave the
      way they do. That habit started with poking at low-level details through reverse engineering
      and studying open-source codebases, and it grew into other areas, from systems and graphics to
      the internals of AI/ML. The same impulse still drives the work: go past the polished interface
      and figure out how the hardware actually behaves.
    </p>
    <p class="lead">
      I am still following that thread, building and writing about the parts that stay interesting
      once you look underneath.
    </p>
  </section>

  <section class="about-section">
    <p class="eyebrow">{copy.interestLabel}</p>
    <div class="practice-grid">
      <article>
        <h2>Systems</h2>
        <p>
          {copy.systems}
        </p>
      </article>
      <article>
        <h2>Graphics</h2>
        <p>
          Graphics is where math stops being abstract. I enjoy the moment when geometry and
          rendering finally line up with what I imagined.
        </p>
      </article>
      <article>
        <h2>{copy.hardwareTitle}</h2>
        <p>
          {copy.hardware}
        </p>
      </article>
    </div>
    <p class="lead technology-line">{copy.tools}</p>
  </section>

  <section class="about-section">
    <p class="eyebrow">04 / Building and Writing</p>
    <div class="two-column">
      <article>
        <p class="eyebrow">Building</p>
        <p>
          Projects are where ideas are tested through implementation: systems, renderers, developer
          tools and technical interfaces.
        </p>
        <a class="button" href={resolve('/projects')}
          >Explore projects <Icon name="arrow-right" size={16} /></a
        >
      </article>
      <article>
        <p class="eyebrow">Writing</p>
        <p>
          Articles are where implementation decisions, mathematical models and engineering
          trade-offs are examined more closely.
        </p>
        <a class="button button-secondary" href={resolve('/blog')}
          >Read the blog <Icon name="arrow-right" size={16} /></a
        >
      </article>
    </div>
  </section>

  <section class="about-section principles">
    <p class="eyebrow">05 / Engineering Principles</p>
    <h2>Explicit constraints</h2>
    <h2>Understandable architecture</h2>
    <h2>Usable tools</h2>
    <p class="lead">
      I prefer clear boundaries, observable behavior, and interfaces that expose the right level of
      detail without hiding the underlying system.
    </p>
  </section>

  <section class="about-section">
    <p class="eyebrow">{copy.focusLabel}</p>
    <div class="two-column focus-columns">
      <div>
        <p class="eyebrow">{copy.buildingLabel}</p>
        <ul>
          <li>{copy.fpga}</li>
          <li>{copy.dsp}</li>
          <li>Systems programming</li>
          <li>{copy.graphics}</li>
        </ul>
      </div>
      <div>
        <p class="eyebrow">{copy.writingLabel}</p>
        <ul>
          <li>Graphics and mathematics</li>
          <li>Protocol behaviour</li>
          <li>{copy.ml}</li>
          <li>{copy.connections}</li>
        </ul>
      </div>
    </div>
  </section>

  <section id="contact" class="about-section contact-section" aria-labelledby="contact-heading">
    <div class="contact-copy">
      <p class="eyebrow">07 / Contact</p>
      <h2 id="contact-heading">Want to compare notes?</h2>
      <p class="lead">
        {copy.contact}
      </p>
    </div>
    {#if sent}
      <p class="contact-note" role="status" tabindex="-1">{copy.contactSent}</p>
    {:else if !data.contactToken}
      <p class="contact-note">{copy.contactStatus}</p>
    {:else}
      <form
        method="POST"
        action="?/contact"
        aria-busy={sending}
        use:enhance={() => {
          sending = true;
          return async ({ update }) => {
            await update({ reset: false });
            sending = false;
          };
        }}
      >
        <input type="hidden" name="form_token" value={data.contactToken} />
        <fieldset disabled={sending}>
          <label
            >Name<input
              type="text"
              name="name"
              placeholder="Your name"
              autocomplete="name"
              maxlength="120"
              required
              value={failure?.name ?? ''}
            /></label
          >
          <label
            >Email<input
              type="email"
              name="email"
              placeholder="you@example.com"
              autocomplete="email"
              maxlength="254"
              required
              value={failure?.email ?? ''}
            /></label
          >
          <label
            >Message<textarea
              name="message"
              rows="4"
              placeholder="Write your message..."
              minlength="5"
              maxlength="5000"
              required
              value={failure?.message ?? ''}></textarea></label
          >
          <div class="hp" aria-hidden="true">
            <label
              >Website<input type="text" name="website" tabindex="-1" autocomplete="off" /></label
            >
          </div>
          <button class="button" type="submit">{sending ? 'Sending...' : 'Send Message'}</button>
        </fieldset>
        {#if failure}
          <p class="contact-error" role="alert">{failure.error}</p>
        {/if}
      </form>
    {/if}
  </section>
</main>

<style>
  .about-section {
    display: grid;
    gap: 1rem;
  }
  .overview {
    gap: 1.5rem;
  }
  .overview .lead,
  .prose-section {
    max-width: 68rem;
  }
  .project-disciplines {
    color: var(--primary);
    font-size: 0.875rem;
  }
  .prose-section h2,
  .practice-grid h2,
  .principles h2,
  .contact-copy h2 {
    font-size: 1.5rem;
    line-height: 1.3;
  }
  .practice-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 3rem;
  }
  .practice-grid article,
  .two-column article {
    display: grid;
    align-content: start;
    gap: 1rem;
  }
  .technology-line {
    font-size: 0.875rem;
  }
  .two-column {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4rem;
  }
  .two-column .button {
    justify-self: start;
  }
  .principles {
    gap: 0.4rem;
  }
  .principles .lead {
    margin-top: 0.75rem;
  }
  .focus-columns ul {
    display: grid;
    gap: 0.5rem;
    margin: 0.75rem 0 0;
    padding: 0;
    color: var(--muted-foreground);
    list-style: none;
  }
  .contact-section {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 4rem;
    scroll-margin-top: 2rem;
  }
  .contact-copy {
    display: grid;
    align-content: start;
    gap: 1rem;
  }
  fieldset {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
    margin: 0;
    border: 0;
    padding: 0;
  }
  label {
    display: grid;
    gap: 0.4rem;
    font-size: 0.8125rem;
    font-weight: 500;
  }
  input,
  textarea {
    width: 100%;
    min-height: 2.75rem;
    border: 1px solid var(--input);
    border-radius: var(--radius);
    background: var(--background);
    color: var(--foreground);
    padding: 0.65rem 0.8rem;
    font: inherit;
  }
  input:disabled,
  textarea:disabled {
    background: var(--muted);
    color: var(--disabled-foreground);
  }
  /* Bots fill every field. People never see this one. */
  .hp {
    position: absolute;
    left: -10000px;
    width: 1px;
    height: 1px;
    overflow: hidden;
  }
  .contact-note,
  .contact-error {
    margin: 0.75rem 0 0;
    font-size: 0.875rem;
  }
  .contact-note {
    color: var(--muted-foreground);
  }
  .contact-error {
    color: var(--foreground);
    border-left: 2px solid var(--foreground);
    padding-left: 0.75rem;
  }
  textarea {
    min-height: 7rem;
    resize: vertical;
  }
  form .button {
    justify-self: start;
  }
  @media (max-width: 47.999rem) {
    .practice-grid,
    .two-column,
    .contact-section {
      grid-template-columns: 1fr;
      gap: 2rem;
    }
    .practice-grid {
      gap: 1.5rem;
    }
    .two-column .button,
    form .button {
      width: 100%;
    }
  }
</style>
