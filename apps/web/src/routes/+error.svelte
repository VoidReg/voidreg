<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { copyForError } from '$lib/data/errors';

  const copy = $derived(copyForError(page.status, page.error?.message));
</script>

<svelte:head>
  <title>{page.status} | Voidreg</title>
</svelte:head>

<main id="main-content" class="error-page">
  <div class="error-copy">
    <div class="error-heading">
      <p class="error-status">{page.status}</p>
      <h1>{copy.title}</h1>
    </div>
    <p class="lead">{copy.detail}</p>
    <a class="text-link" href={resolve('/')}>Home</a>
  </div>
</main>

<style>
  .error-page {
    display: grid;
    place-content: center;
    min-height: calc(100dvh - 5rem);
    padding: 2.5rem 1.5rem 4rem;
  }

  .error-copy {
    display: grid;
    justify-items: center;
    gap: 1.5rem;
    max-width: 28rem;
    text-align: center;
  }

  .error-heading {
    display: grid;
    justify-items: center;
    gap: 0.5rem;
  }

  .error-status {
    color: var(--primary);
    font-family: var(--font-code);
    font-size: clamp(2.5rem, 6vw, 3.75rem);
    font-weight: 500;
    line-height: 1.15;
  }

  .error-copy h1 {
    font-size: 2.25rem;
    line-height: 1.15;
  }

  @media (max-width: 63.999rem) {
    .error-page {
      min-height: calc(100dvh - 4.5rem);
    }
  }

  @media (max-width: 47.999rem) {
    .error-copy h1 {
      font-size: 1.75rem;
    }
  }
</style>
