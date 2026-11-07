<script lang="ts">
  // A themed replacement for <input list=...> with a <datalist>: free text with suggestions.
  // Before the page is interactive (and without JavaScript) a native input and datalist are
  // shown. With `separator`, the field holds a list ("r1, r2") and suggestions replace only the
  // last item.
  import { onMount, tick } from 'svelte';
  import { currentToken, filterChoices, replaceToken, step, type Choice } from './listbox';
  import { place, watchOutside } from './popup';
  import './listbox.css';

  let {
    value = $bindable(''),
    options,
    name,
    label,
    id,
    type = 'text',
    placeholder = '',
    maxlength,
    disabled = false,
    separator,
    filter = true,
    oninput,
    onchange
  }: {
    value?: string;
    options: Choice[];
    name?: string;
    label?: string;
    id?: string;
    type?: 'text' | 'search';
    placeholder?: string;
    maxlength?: number;
    disabled?: boolean;
    separator?: string;
    /** Set to false when the suggestions are already filtered, for example by a server. */
    filter?: boolean;
    /** Called as the text changes. */
    oninput?: (value: string) => void;
    /** Called when the text is committed: a suggestion was picked, or the field lost focus. */
    onchange?: (value: string) => void;
  } = $props();

  const uid = $props.id();
  const listId = `combo-list-${uid}`;
  let ready = $state(false);
  let open = $state(false);
  let active = $state(-1);
  let field = $state<HTMLInputElement>();
  let popup = $state<HTMLDivElement>();

  onMount(() => {
    ready = true;
  });

  const shown = $derived(
    filter ? filterChoices(options, currentToken(value, separator)) : options.slice(0, 50)
  );
  const showing = $derived(open && shown.length > 0);

  function pick(index: number) {
    const choice = shown[index];
    if (!choice) return;
    value = replaceToken(value, choice.value, separator);
    open = false;
    active = -1;
    field?.focus();
    void tick().then(() => {
      oninput?.(value);
      onchange?.(value);
    });
  }

  $effect(() => {
    if (!showing || !popup || !field) return;
    popup.showPopover();
    place(field, popup);
    return watchOutside(
      (target) => !!(field?.contains(target) || popup?.contains(target)),
      () => (open = false)
    );
  });
  $effect(() => {
    if (showing && active >= 0) {
      document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
    }
  });

  function keydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!showing) {
        open = true;
        active = event.key === 'ArrowDown' ? 0 : shown.length - 1;
      } else {
        active = step(shown, active, event.key === 'ArrowDown' ? 1 : -1, true);
      }
    } else if (event.key === 'Enter' && showing && active >= 0) {
      // Choosing a suggestion must not submit the surrounding form.
      event.preventDefault();
      pick(active);
    } else if (event.key === 'Escape' && showing) {
      event.preventDefault();
      event.stopPropagation();
      open = false;
      active = -1;
    } else if (event.key === 'Tab') {
      open = false;
    }
  }
</script>

{#if ready}
  <span class="ui-combobox">
    <input
      bind:this={field}
      {id}
      {name}
      {type}
      {placeholder}
      {maxlength}
      {disabled}
      {value}
      class="ui-combobox-input"
      role="combobox"
      autocomplete="off"
      aria-label={label}
      aria-autocomplete="list"
      aria-expanded={showing}
      aria-controls={showing ? listId : undefined}
      aria-activedescendant={showing && active >= 0 ? `${listId}-${active}` : undefined}
      oninput={(event) => {
        value = event.currentTarget.value;
        open = true;
        active = -1;
        oninput?.(value);
      }}
      onchange={(event) => onchange?.(event.currentTarget.value)}
      onfocus={() => (open = options.length > 0)}
      onclick={() => (open = true)}
      onkeydown={keydown}
    />
    {#if showing}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div
        bind:this={popup}
        popover="manual"
        class="ui-listbox"
        role="presentation"
        onclick={(event) => event.preventDefault()}
      >
        <div id={listId} role="listbox" aria-label={label} tabindex="-1">
          {#each shown as choice, index (choice.value)}
            <div
              id={`${listId}-${index}`}
              role="option"
              tabindex="-1"
              aria-selected={index === active}
              class="ui-option"
              class:active={index === active}
              onpointerdown={(event) => event.preventDefault()}
              onpointermove={() => (active = index)}
              onclick={() => pick(index)}
            >
              <span class="ui-option-label">{choice.label}</span>
              {#if choice.hint}<small>{choice.hint}</small>{/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </span>
{:else}
  {@const listName = `${listId}-native`}
  <input
    {id}
    {name}
    {type}
    {placeholder}
    {maxlength}
    {disabled}
    {value}
    class="ui-combobox-input"
    autocomplete="off"
    aria-label={label}
    list={listName}
  />
  <datalist id={listName}>
    {#each options as choice (choice.value)}
      <option value={choice.value} label={choice.hint ?? choice.label}></option>
    {/each}
  </datalist>
{/if}

<style>
  .ui-combobox {
    position: relative;
    display: block;
    width: 100%;
    min-width: 0;
  }
  .ui-combobox-input {
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
  .ui-combobox-input:focus-visible {
    outline: 3px solid var(--ring, highlight);
    outline-offset: 2px;
  }
  .ui-combobox-input::placeholder {
    color: var(--muted-foreground, graytext);
  }
</style>
