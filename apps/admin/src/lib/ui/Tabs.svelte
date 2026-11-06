<script lang="ts">
  // Automatic activation tablist with roving tabindex and arrow, Home and End keys.
  interface Tab {
    id: string;
    label: string;
    disabled?: boolean;
  }
  let {
    tabs,
    value,
    label,
    idPrefix,
    onselect,
    class: className = ''
  }: {
    tabs: Tab[];
    value: string;
    label: string;
    idPrefix: string;
    onselect: (id: string) => void;
    class?: string;
  } = $props();
  let list = $state<HTMLElement>();

  function move(event: KeyboardEvent) {
    const enabled = tabs.filter((tab) => !tab.disabled);
    const index = enabled.findIndex((tab) => tab.id === value);
    let next = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
      next = (index + 1) % enabled.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = (index - 1 + enabled.length) % enabled.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = enabled.length - 1;
    else return;
    event.preventDefault();
    const target = enabled[next];
    if (!target) return;
    onselect(target.id);
    queueMicrotask(() =>
      list?.querySelector<HTMLElement>(`#${idPrefix}-tab-${target.id}`)?.focus()
    );
  }
</script>

<div class={`ui-tabs ${className}`} role="tablist" aria-label={label} bind:this={list}>
  {#each tabs as tab (tab.id)}
    <button
      type="button"
      role="tab"
      id={`${idPrefix}-tab-${tab.id}`}
      aria-selected={value === tab.id}
      aria-controls={`${idPrefix}-panel`}
      tabindex={value === tab.id ? 0 : -1}
      disabled={tab.disabled}
      onclick={() => onselect(tab.id)}
      onkeydown={move}>{tab.label}</button
    >
  {/each}
</div>
