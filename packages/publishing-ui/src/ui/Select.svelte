<script lang="ts">
  // A themed replacement for the native <select>. It follows the ARIA select-only combobox
  // pattern: focus stays on the button while arrow keys move through the list. Before the page
  // is interactive (and without JavaScript) a native <select> with the same options is shown,
  // so forms keep working.
  import { onMount, tick } from 'svelte';
  import { edge, sections, step, typeahead, type Choice } from './listbox';
  import { place, watchOutside } from './popup';
  import './listbox.css';

  let {
    value = $bindable(''),
    options,
    name,
    label,
    id,
    disabled = false,
    required = false,
    placeholder = 'Select',
    onchange
  }: {
    value?: string;
    options: Choice[];
    /** Form field name. A hidden input carries the value while the themed list is shown. */
    name?: string;
    /** Accessible name. Use the same text as the visible label. */
    label?: string;
    id?: string;
    disabled?: boolean;
    required?: boolean;
    placeholder?: string;
    onchange?: (value: string) => void;
  } = $props();

  const uid = $props.id();
  const listId = `select-list-${uid}`;
  let ready = $state(false);
  let open = $state(false);
  let active = $state(-1);
  let button = $state<HTMLButtonElement>();
  let popup = $state<HTMLDivElement>();
  let typed = '';
  let typedAt = 0;

  onMount(() => {
    ready = true;
  });

  const current = $derived(options.find((option) => option.value === value));
  const groups = $derived(sections(options));

  function show() {
    if (disabled || open) return;
    const selected = options.findIndex((option) => option.value === value && !option.disabled);
    active = selected >= 0 ? selected : edge(options, 'first');
    open = true;
  }
  function hide() {
    open = false;
  }
  function choose(index: number) {
    const choice = options[index];
    if (!choice || choice.disabled) return;
    const changed = choice.value !== value;
    value = choice.value;
    hide();
    button?.focus();
    // The hidden input must hold the new value before listeners (such as a form submit) run.
    if (changed) void tick().then(() => onchange?.(choice.value));
  }

  $effect(() => {
    if (!open || !popup || !button) return;
    popup.showPopover();
    place(button, popup);
    const stop = watchOutside(
      (target) => !!(button?.contains(target) || popup?.contains(target)),
      hide
    );
    return stop;
  });
  $effect(() => {
    if (open && popup && active >= 0) {
      document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
    }
  });

  function keydown(event: KeyboardEvent) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(key)) {
        event.preventDefault();
        show();
      } else if (key.length === 1) {
        // Typing on a closed select changes the value, like a native one.
        const found = typeahead(
          options,
          key,
          options.findIndex((o) => o.value === value)
        );
        if (found >= 0) choose(found);
      }
      return;
    }
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault();
      active = step(options, active, key === 'ArrowDown' ? 1 : -1);
    } else if (key === 'Home' || key === 'End') {
      event.preventDefault();
      active = edge(options, key === 'Home' ? 'first' : 'last');
    } else if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      choose(active);
    } else if (key === 'Escape') {
      // Close the list without also closing a surrounding dialog or panel.
      event.preventDefault();
      event.stopPropagation();
      hide();
    } else if (key === 'Tab') {
      hide();
    } else if (key.length === 1) {
      const now = Date.now();
      typed = now - typedAt > 600 ? key : typed + key;
      typedAt = now;
      const found = typeahead(options, typed, active);
      if (found >= 0) active = found;
    }
  }
</script>

{#if ready}
  <span class="ui-select" class:open>
    {#if name}<input type="hidden" {name} {value} />{/if}
    <button
      bind:this={button}
      {id}
      type="button"
      class="ui-select-button"
      role="combobox"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listId : undefined}
      aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
      aria-label={label}
      aria-required={required || undefined}
      {disabled}
      onclick={() => (open ? hide() : show())}
      onkeydown={keydown}
    >
      <span class="ui-select-value" class:placeholder={!current}
        >{current ? current.label : placeholder}</span
      >
      <svg class="ui-select-chevron" viewBox="0 0 12 8" aria-hidden="true" focusable="false">
        <path d="M1 1.5 6 6.5l5-5" fill="none" stroke="currentColor" stroke-width="1.5" />
      </svg>
    </button>
    {#if open}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div
        bind:this={popup}
        popover="manual"
        class="ui-listbox"
        onclick={(event) => event.preventDefault()}
        role="presentation"
      >
        <div id={listId} role="listbox" aria-label={label} tabindex="-1">
          {#each groups as group, groupIndex (groupIndex)}
            {#if group.label}
              <div class="ui-listbox-group" role="presentation">{group.label}</div>
            {/if}
            {#each group.items as item (item.index)}
              <div
                id={`${listId}-${item.index}`}
                role="option"
                tabindex="-1"
                aria-selected={item.choice.value === value}
                aria-disabled={item.choice.disabled || undefined}
                class="ui-option"
                class:active={item.index === active}
                class:grouped={!!group.label}
                onpointerdown={(event) => event.preventDefault()}
                onpointermove={() => !item.choice.disabled && (active = item.index)}
                onclick={() => choose(item.index)}
              >
                <span class="ui-option-label">{item.choice.label}</span>
                {#if item.choice.hint}<small>{item.choice.hint}</small>{/if}
                {#if item.choice.value === value}
                  <svg class="ui-option-check" viewBox="0 0 12 10" aria-hidden="true">
                    <path
                      d="M1 5.5 4.5 9 11 1.5"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.8"
                    />
                  </svg>
                {/if}
              </div>
            {/each}
          {/each}
        </div>
      </div>
    {/if}
  </span>
{:else}
  <select class="ui-select-native" {id} {name} {disabled} {required} aria-label={label} {value}>
    {#each options as option (option.value)}
      <option value={option.value} disabled={option.disabled} selected={option.value === value}
        >{option.label}</option
      >
    {/each}
  </select>
{/if}

<style>
  .ui-select {
    position: relative;
    display: block;
    width: 100%;
    min-width: 0;
  }
  .ui-select-button,
  .ui-select-native {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    min-height: var(--ui-control-height, 2.75rem);
    border: 1px solid var(--input, currentColor);
    border-radius: var(--radius, 0);
    background: var(--background, canvas);
    color: var(--foreground, canvastext);
    padding: 0.5rem 0.75rem;
    font: inherit;
    font-size: var(--ui-control-size, 1rem);
    font-weight: 400;
    line-height: 1.4;
  }
  .ui-select-button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    text-align: left;
    cursor: pointer;
  }
  .ui-select-button:focus-visible,
  .ui-select-native:focus-visible {
    outline: 3px solid var(--ring, highlight);
    outline-offset: 2px;
  }
  .ui-select-button:disabled {
    background: var(--disabled, transparent);
    color: var(--disabled-foreground, graytext);
    cursor: not-allowed;
  }
  .ui-select-value {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ui-select-value.placeholder {
    color: var(--muted-foreground, graytext);
  }
  .ui-select-chevron {
    flex: none;
    width: 0.75rem;
    height: 0.5rem;
    transition: rotate var(--duration-fast, 120ms) var(--ease-standard, ease);
  }
  .open .ui-select-chevron {
    rotate: 180deg;
  }

  @media (prefers-reduced-motion: reduce) {
    .ui-select-chevron {
      transition: none;
    }
  }
</style>
