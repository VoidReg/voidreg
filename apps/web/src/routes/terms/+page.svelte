<script lang="ts">
  import SectionLabel from '$lib/components/SectionLabel.svelte';
  import Breadcrumb from '$lib/components/Breadcrumb.svelte';
  import { resolve } from '$app/paths';
  import Seo from '$lib/Seo.svelte';
</script>

<Seo
  title="Terms of service | Voidreg"
  description="The rules for reading, quoting and commenting on Voidreg, including accounts, moderation, acceptable use and the limits of what the site promises."
/>

<main id="main-content" class="site-container page-shell terms-page">
  <Breadcrumb items={[{ label: 'Home', href: resolve('/') }, { label: 'Terms' }]} />

  <section class="terms-section">
    <p class="eyebrow">Terms</p>
    <h1 class="display-heading">Terms of service</h1>
    <p class="lead">
      These terms cover reading, quoting and commenting on Voidreg. They are short on purpose. By
      using the site you agree to them. If you do not, please do not use the site.
    </p>
    <p class="updated">Last updated November 15, 2026.</p>
  </section>

  <section class="terms-section">
    <SectionLabel label="01 / The site" />
    <h2>What Voidreg is</h2>
    <p>
      Voidreg is a personal site with projects, notes and a knowledge map. It is run by Ammar Saleh
      and provided as is, free of charge. Pages, posts and features can change or disappear without
      notice. How personal data is handled is described in the
      <a class="text-link" href={resolve('/privacy')}>privacy notice</a>, which is part of these
      terms.
    </p>
  </section>

  <section class="terms-section">
    <SectionLabel label="02 / Content" />
    <h2>Using what is published here</h2>
    <p>
      Unless a page says otherwise, the text, images, diagrams and code on this site are the work of
      the operator and all rights are reserved. You are welcome to read, link to and share pages.
      You may quote short excerpts with credit and a link back to the page. For anything beyond
      that, such as republishing a post or reusing artwork, ask first through the
      <a class="text-link" href={resolve('/about#contact')}>About contact section</a>. Where a
      project names its own licence, that licence applies to that project.
    </p>
    <p>
      The Markdown versions of pages, <code>/llms.txt</code>, the RSS feed and the read-only MCP
      endpoint described on the
      <a class="text-link" href={resolve('/agents')}>agents page</a> exist so people and tools can read
      the site. Reading and summarising for a person who asked is fine. Please do not use them to copy
      the site wholesale or to train a competing publication.
    </p>
  </section>

  <section class="terms-section" id="comments">
    <SectionLabel label="03 / Comments and accounts" />
    <h2>Commenting</h2>
    <p>
      You can comment as a guest or after signing in with GitHub or Google. Signing in is optional.
      Guest comments are held for review. Comments from signed-in readers publish right away and can
      still be hidden afterwards.
    </p>
    <p>You keep ownership of what you write. By posting you give the operator permission to:</p>
    <ul>
      <li>display your comment on the page it belongs to, with the name you chose;</li>
      <li>store it, back it up and moderate it;</li>
      <li>
        keep it in its thread as &ldquo;Deleted user&rdquo; after you delete your account, unless
        you also choose to remove its text.
      </li>
    </ul>
    <p>
      You are responsible for what you post. You confirm that you wrote it or have the right to
      share it. Comments are plain text, up to 2000 characters. Links are fine when they are
      relevant.
    </p>
    <p>
      Your account is yours alone. Keep your sign-in to GitHub or Google secure, do not share
      access, and do not pick a display name that imitates someone else, the operator or the site.
      Some names are reserved. You can change your name or delete your account at any time from the
      <a class="text-link" href={resolve('/account')}>account page</a>.
    </p>
  </section>

  <section class="terms-section">
    <SectionLabel label="04 / Conduct" />
    <h2>What is not allowed</h2>
    <ul>
      <li>Harassment, threats, hate, or targeting a person or group.</li>
      <li>Spam, advertising, scams, or links meant to mislead or to harm a device.</li>
      <li>Illegal content, or content that infringes someone else&rsquo;s rights.</li>
      <li>Other people&rsquo;s private information, posted without their consent.</li>
      <li>
        Attacking, probing or overloading the site, bypassing rate limits, or creating accounts to
        evade a block.
      </li>
    </ul>
    <p>
      The operator may hide or remove any comment, block a person from commenting, or close an
      account that breaks these rules or harms the discussion, with or without notice. A block
      applies to every sign-in connected to the same profile. Deleting an account does not lift a
      block.
    </p>
  </section>

  <section class="terms-section">
    <SectionLabel label="05 / Limits" />
    <h2>No warranty and limited liability</h2>
    <p>
      Posts and projects share what the operator was working on at the time. They may be incomplete,
      out of date or wrong, and they are not professional advice. Try anything you read here at your
      own risk and check it before you rely on it.
    </p>
    <p>
      The site is provided without warranties of any kind, to the extent the law allows. The
      operator is not liable for loss or damage from using the site, from comments written by
      readers, or from external links, except where the law does not allow that liability to be
      excluded. Nothing here limits rights you have under mandatory consumer law.
    </p>
  </section>

  <section class="terms-section">
    <SectionLabel label="06 / Changes" />
    <h2>Changes and contact</h2>
    <p>
      These terms may change. The date at the top shows the latest version, and continuing to use
      the site after a change means you accept it. Questions, takedown requests and reports of abuse
      can be sent through the
      <a class="text-link" href={resolve('/about#contact')}>About contact section</a>.
    </p>
    <div class="button-row">
      <a class="button" href={resolve('/about#contact')}>Contact</a>
      <a class="button button-secondary" href={resolve('/privacy')}>Privacy notice</a>
    </div>
  </section>
</main>

<style>
  .terms-section {
    display: grid;
    gap: 1rem;
    max-width: 68rem;
  }

  .terms-section h2 {
    font-size: 1.5rem;
    line-height: 1.3;
  }

  .terms-section ul {
    display: grid;
    gap: 0.75rem;
    margin: 0;
    padding-inline-start: 1.2rem;
    color: var(--muted-foreground);
  }

  .terms-section p {
    color: var(--muted-foreground);
  }

  .updated {
    font-size: 0.9375rem;
  }

  code {
    font-family: var(--font-code);
    font-size: 0.8125rem;
  }

  @media (max-width: 47.999rem) {
    .terms-section h2 {
      font-size: 1.25rem;
    }
  }
</style>
