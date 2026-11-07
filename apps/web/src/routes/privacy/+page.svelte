<script lang="ts">
  import SectionLabel from '$lib/components/SectionLabel.svelte';
  import Breadcrumb from '$lib/components/Breadcrumb.svelte';
  import { resolve } from '$app/paths';
  import { openCookieSettings } from '$lib/consent';
  import Seo from '$lib/Seo.svelte';
</script>

<Seo
  title="Privacy and cookies | Voidreg"
  description="How Voidreg uses strictly necessary cookies, what commenter accounts store, and how to change or delete your data."
/>

<main id="main-content" class="site-container page-shell privacy-page">
  <Breadcrumb items={[{ label: 'Home', href: resolve('/') }, { label: 'Privacy' }]} />

  <section class="privacy-section">
    <p class="eyebrow">Privacy</p>
    <h1 class="display-heading">Privacy and cookies</h1>
    <p class="lead">
      This notice explains who is responsible for this site, what information is stored on your
      device, why, and how to change or withdraw your choices. It follows the GDPR and the ePrivacy
      rules on cookies and similar technologies.
    </p>
  </section>

  <section class="privacy-section">
    <SectionLabel label="01 / Controller" />
    <h2>Who is responsible</h2>
    <p>
      The operator of Voidreg is the controller for personal data processed through this website.
      Questions, access requests, and other privacy correspondence can be sent through the
      <a class="text-link" href={resolve('/about#contact')}>contact section on the About page</a>.
    </p>
  </section>

  <section class="privacy-section">
    <SectionLabel label="02 / What we store" />
    <h2>Cookies we use</h2>
    <p>
      Cookies are small files stored on your device. This site uses first-party cookies only. Theme,
      consent and sign-in cookies are strictly necessary: they provide a service you ask for (your
      display preference, remembering this choice, and keeping you signed in after you choose to
      sign in) and stay on even if you reject non-essential cookies.
    </p>
    <div class="table-wrap">
      <table>
        <caption class="sr-only">Cookies used on Voidreg</caption>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Purpose</th>
            <th scope="col">Type</th>
            <th scope="col">Duration</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>voidreg-theme</code></td>
            <td>Remembers light or dark theme after you toggle it.</td>
            <td>Strictly necessary</td>
            <td>1 year</td>
          </tr>
          <tr>
            <td><code>voidreg-consent</code></td>
            <td>Remembers your cookie preferences so the banner does not return on every visit.</td>
            <td>Strictly necessary</td>
            <td>6 months</td>
          </tr>
          <tr>
            <td><code>voidreg_commenter_session</code></td>
            <td>
              Keeps you signed in as a commenter. Set only after you sign in with GitHub or Google,
              and removed when you sign out.
            </td>
            <td>Strictly necessary</td>
            <td>30 days</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p>
      On a first visit with no theme cookie, the site follows your system colour scheme and does not
      store a theme cookie until you choose one. Optional analytics and marketing cookies are listed
      in preferences for future use; they are not set today.
    </p>
  </section>

  <section class="privacy-section" id="accounts">
    <SectionLabel label="03 / Accounts and comments" />
    <h2>Commenter accounts and comments</h2>
    <p>
      Signing in is optional. You can comment as a guest by typing a name. Guest comments are held
      for review before they appear.
    </p>
    <p>
      When you sign in with GitHub or Google we receive and store the provider and your account
      number there, your email address, your name, and the web address of your profile photo. We use
      them only to run your profile: to tie your comments to one identity, to join your GitHub and
      Google sign-ins when they share a verified email, and to let a moderator block abuse. Your
      email is never shown to other readers.
    </p>
    <p>
      Your display name is public and appears next to your comments. Your photo stays hidden unless
      you choose to show it. When shown, we serve a copy from this site, so GitHub or Google never
      learn who reads which discussion.
    </p>
    <p>
      Each comment also stores a salted one-way hash of your network address, used only to limit
      spam and abuse. Short-lived anti-abuse counters expire within 30 days.
    </p>
    <p>
      Account data is kept until you delete your account. On your
      <a class="text-link" href={resolve('/account')}>account page</a> you can change your name and photo,
      disconnect a provider, sign out everywhere, download your data as JSON, and delete your account.
      Deleting removes your profile, connected accounts and sessions. Your comments stay in their threads
      as &ldquo;Deleted user&rdquo; unless you choose to remove their text as well.
    </p>
  </section>

  <section class="privacy-section">
    <SectionLabel label="04 / Legal bases" />
    <h2>Why this is allowed</h2>
    <ul>
      <li>
        Strictly necessary cookies: ePrivacy Article 5(3) exemption for a service you request, with
        GDPR Article 6(1)(b) and/or 6(1)(f) for the related processing (providing the site and
        keeping your chosen appearance).
      </li>
      <li>
        Optional cookies, if they are ever used: prior consent under ePrivacy Article 5(3) and GDPR
        Article 6(1)(a). Consent is given by Accept all or by saving preferences with a category
        switched on. It is not implied by scrolling or continuing to browse.
      </li>
      <li>
        Commenter accounts: GDPR Article 6(1)(b) to provide the profile you ask for, and Article
        6(1)(f) for our interest in keeping the discussion free of spam and abuse.
      </li>
    </ul>
  </section>

  <section class="privacy-section">
    <SectionLabel label="05 / Recipients and retention" />
    <h2>Who sees data, and for how long</h2>
    <p>
      The site is statically hosted. The hosting provider processes technical request data (such as
      IP address and user agent in server logs) as a processor, for as long as those logs are kept
      by the host. Fonts are served from this site, not from Google. There are no analytics,
      advertising, or social-media trackers. Data is not sold. If you sign in, GitHub or Google
      handles that sign-in under its own privacy policy.
    </p>
    <p>
      Theme cookies expire after one year, consent cookies after six months, and the sign-in cookie
      after 30 days. After six months you will be asked again about optional cookies. You can change
      or withdraw optional consent at any time through Cookie settings in the footer.
    </p>
  </section>

  <section class="privacy-section">
    <SectionLabel label="06 / Your rights" />
    <h2>Control and complaints</h2>
    <p>
      Depending on applicable law you may request access, correction, erasure, restriction,
      objection, or portability, and you may withdraw consent without affecting processing that
      already happened. If you have an account, you can download and delete your data yourself on
      the account page. For anything else, use the
      <a class="text-link" href={resolve('/about#contact')}>About contact section</a>
      for these requests. You may also lodge a complaint with your local supervisory authority.
    </p>
    <p>
      This site does not use automated decision-making that produces legal or similarly significant
      effects. The rules for using the site and commenting are in the
      <a class="text-link" href={resolve('/terms')}>terms of service</a>.
    </p>
    <div class="button-row">
      <button type="button" class="button button-secondary" onclick={openCookieSettings}
        >Cookie settings</button
      >
      <a class="button" href={resolve('/about#contact')}>Contact</a>
    </div>
  </section>
</main>

<style>
  .privacy-section {
    display: grid;
    gap: 1rem;
    max-width: 68rem;
  }

  .privacy-section h2 {
    font-size: 1.5rem;
    line-height: 1.3;
  }

  .privacy-section ul {
    display: grid;
    gap: 0.75rem;
    margin: 0;
    padding-inline-start: 1.2rem;
    color: var(--muted-foreground);
  }

  .privacy-section p,
  .privacy-section td {
    color: var(--muted-foreground);
  }

  .table-wrap {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9375rem;
  }

  th,
  td {
    text-align: start;
    vertical-align: top;
    border-bottom: 1px solid var(--border);
    padding: 0.75rem 1rem 0.75rem 0;
  }

  th {
    color: var(--foreground);
    font-weight: 500;
  }

  code {
    font-family: var(--font-code);
    font-size: 0.8125rem;
  }

  @media (max-width: 47.999rem) {
    .privacy-section h2 {
      font-size: 1.25rem;
    }
  }
</style>
