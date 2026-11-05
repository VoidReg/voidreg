<script lang="ts">
  import { onMount, type Snippet } from 'svelte';

  let { children, index = 0 }: { children: Snippet; index?: number } = $props();
  let element: HTMLElement;
  let phase = $state<'idle' | 'hidden' | 'shown'>('idle');

  // Server output stays visible. After hydration, only content below the fold is
  // hidden and then revealed once, using transform and opacity (no layout shift).
  onMount(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (element.getBoundingClientRect().top < innerHeight * 0.9) return;
    phase = 'hidden';
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          phase = 'shown';
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(element);
    return () => observer.disconnect();
  });
</script>

<div
  bind:this={element}
  class="reveal"
  data-reveal={phase === 'idle' ? undefined : phase}
  style:--i={index}
>
  {@render children()}
</div>
