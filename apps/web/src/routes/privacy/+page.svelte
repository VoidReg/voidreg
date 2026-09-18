<script lang="ts">
  import { resolve } from '$app/paths';
  import { openCookieSettings } from '$lib/consent';
</script>

<svelte:head>
  <title>Privacy and cookies | Voidreg</title>
  <meta
    name="description"
    content="How Voidreg uses strictly necessary cookies, what is stored, and how to change your preferences."
  />
</svelte:head>

<main id="main-content" class="site-container page-shell privacy-page">
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <a href={resolve('/')}>Home</a><span>/</span><span aria-current="page">Privacy</span>
  </nav>

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
    <p class="eyebrow">01 / Controller</p>
    <h2>Who is responsible</h2>
    <p>
      The operator of Voidreg is the controller for personal data processed through this website.
      Questions, access requests, and other privacy correspondence can be sent through the
      <a class="text-link" href={resolve('/about#contact')}>contact section on the About page</a>.
    </p>
  </section>

  <section class="privacy-section">
    <p class="eyebrow">02 / What we store</p>
    <h2>Cookies we use</h2>
    <p>
      Cookies are small files stored on your device. This site uses first-party cookies only. Theme
      and consent cookies are strictly necessary: they provide a service you ask for (your display
      preference and remembering this choice) and stay on even if you reject non-essential cookies.
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
        </tbody>
      </table>
    </div>
    <p>
      On a first visit with no theme cookie, the site follows your system colour scheme and does not
      store a theme cookie until you choose one. Optional analytics and marketing cookies are listed
      in preferences for future use; they are not set today.
    </p>
  </section>

  <section class="privacy-section">
    <p class="eyebrow">03 / Legal bases</p>
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
    </ul>
  </section>

  <section class="privacy-section">
    <p class="eyebrow">04 / Recipients and retention</p>
    <h2>Who sees data, and for how long</h2>
    <p>
      The site is statically hosted. The hosting provider processes technical request data (such as
      IP address and user agent in server logs) as a processor, for as long as those logs are kept
      by the host. Fonts are served from this site, not from Google. There are no analytics,
      advertising, or social-media trackers. Data is not sold.
    </p>
    <p>
      Theme cookies expire after one year, consent cookies after six months. After six months you
      will be asked again. You can change or withdraw optional consent at any time through Cookie
      settings in the footer.
    </p>
  </section>

  <section class="privacy-section">
    <p class="eyebrow">05 / Your rights</p>
    <h2>Control and complaints</h2>
    <p>
      Depending on applicable law you may request access, correction, erasure, restriction,
      objection, or portability, and you may withdraw consent without affecting processing that
      already happened. Use the
      <a class="text-link" href={resolve('/about#contact')}>About contact section</a>
      for these requests. You may also lodge a complaint with your local supervisory authority.
    </p>
    <p>
      This site does not use automated decision-making that produces legal or similarly significant
      effects.
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
