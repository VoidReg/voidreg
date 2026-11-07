<script lang="ts">
  let { items, label }: { items: string[]; label: string } = $props();

  // The track holds two identical groups and slides by exactly one group, so the loop has no
  // visible seam. Each group must be at least as wide as the screen, or the right edge would
  // run empty before the loop restarts, so the list repeats as often as the width needs.
  const SPEED = 45; // pixels per second, the same on every screen size
  let strip = $state<HTMLElement>();
  let first = $state<HTMLElement>();
  let repeat = $state(1);
  let duration = $state(48);

  $effect(() => {
    if (!strip || !first) return;
    const section = strip;
    const list = first;
    const measure = () => {
      const unit = list.getBoundingClientRect().width;
      if (!unit) return;
      repeat = Math.min(8, Math.max(1, Math.ceil(section.clientWidth / unit)));
      duration = Math.max(20, Math.round((unit * repeat) / SPEED));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(section);
    observer.observe(list);
    measure();
    return () => observer.disconnect();
  });
</script>

<section class="band band-primary strip" aria-label={label} bind:this={strip}>
  <div class="strip-track" style:--strip-duration="{duration}s">
    <div class="strip-group">
      <ul class="strip-list" bind:this={first}>
        {#each items as item (item)}<li class="strip-item">{item}</li>{/each}
      </ul>
      {#each { length: repeat - 1 }, copy (copy)}
        <ul class="strip-list strip-repeat" aria-hidden="true">
          {#each items as item (item)}<li class="strip-item">{item}</li>{/each}
        </ul>
      {/each}
    </div>
    <div class="strip-group strip-dup" aria-hidden="true">
      {#each { length: repeat }, copy (copy)}
        <ul class="strip-list">
          {#each items as item (item)}<li class="strip-item">{item}</li>{/each}
        </ul>
      {/each}
    </div>
  </div>
</section>
