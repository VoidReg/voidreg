<script lang="ts">
  // Multi-select with removable chips and a server-backed suggestion list (ARIA combobox).
  // Used for tags (creation allowed) and project links (existing items only).
  import { addValue, buildOptions, moveActive, removeValue, type Option } from '../pickers';

  let {
    values = $bindable([]),
    label,
    help = '',
    placeholder = '',
    search,
    labelOf = (value: string) => value,
    createValue,
    max = Infinity,
    onchange
  }: {
    values: string[];
    label: string;
    help?: string;
    placeholder?: string;
    /** Returns suggestions for the typed text. Called with an empty string when the field opens. */
    search: (query: string) => Promise<Option[]>;
    /** Display text for a selected value, for example a project title for an id. */
    labelOf?: (value: string) => string;
    /** When set, text that matches nothing can be added as a new value. Returns the normalized value. */
    createValue?: (raw: string) => string;
    max?: number;
    onchange?: () => void;
  } = $props();

  const uid = $props.id();
  const listId = `picker-list-${uid}`;
  const helpId = `picker-help-${uid}`;
  let query = $state('');
  let open = $state(false);
  let results = $state<Option[]>([]);
  let failed = $state(false);
  let loading = $state(false);
  let active = $state(-1);
  let announcement = $state('');
  let input = $state<HTMLInputElement>();
  let requestId = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const options = $derived(buildOptions(results, values, query, createValue));
  const full = $derived(values.length >= max);

  function fetchSuggestions(text: string, delay = 150) {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const mine = ++requestId;
      loading = true;
      try {
        const found = await search(text);
        if (mine !== requestId) return;
        results = found;
        failed = false;
      } catch {
        if (mine !== requestId) return;
        results = [];
        failed = true;
      } finally {
        if (mine === requestId) loading = false;
      }
    }, delay);
  }

  function commit(next: string[], message: string) {
    values = next;
    announcement = message;
    onchange?.();
  }
  function choose(option: Option) {
    const next = addValue(values, option.value, max);
    if (next !== values) commit(next, `${option.label} added. ${next.length} selected.`);
    query = '';
    active = -1;
    fetchSuggestions('', 0);
    input?.focus();
  }
  function remove(value: string) {
    commit(removeValue(values, value), `${labelOf(value)} removed.`);
    input?.focus();
  }
  function addTyped() {
    const typed = createValue?.(query) ?? '';
    if (typed) choose({ value: typed, label: typed, create: true });
  }
  function keydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      open = true;
      active = moveActive(active, event.key === 'ArrowDown' ? 1 : -1, options.length);
    } else if (event.key === 'Enter') {
      if (open && active >= 0 && options[active]) {
        event.preventDefault();
        choose(options[active]);
      } else if (query.trim()) {
        // Never submit the surrounding form from here; create when allowed.
        event.preventDefault();
        addTyped();
      }
    } else if (event.key === ',' && createValue) {
      event.preventDefault();
      addTyped();
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      open = false;
      active = -1;
    } else if (event.key === 'Backspace' && !query && values.length) {
      remove(values[values.length - 1]);
    }
  }
  function focusIn() {
    open = true;
    fetchSuggestions(query, 0);
  }
  function focusOut(event: FocusEvent) {
    const next = event.relatedTarget as Node | null;
    if (next && (event.currentTarget as HTMLElement).contains(next)) return;
    open = false;
    active = -1;
    // Text left in the field is kept as a tag instead of being lost silently.
    if (createValue && query.trim()) addTyped();
  }
</script>

<!-- Typing in the search box must not mark the surrounding form as edited. -->
<div
  class="ui-picker"
  role="presentation"
  onfocusin={focusIn}
  onfocusout={focusOut}
  oninput={(event) => event.stopPropagation()}
>
  <label class="ui-picker-label" for={`picker-input-${uid}`}>{label}</label>
  <div class="ui-picker-box" class:open>
    {#if values.length}
      <ul class="ui-picker-chips" aria-label={`Selected: ${label}`}>
        {#each values as value (value)}
          <li class="ui-chip">
            <span>{labelOf(value)}</span>
            <button
              type="button"
              class="ui-chip-remove"
              aria-label={`Remove ${labelOf(value)}`}
              onclick={() => remove(value)}>x</button
            >
          </li>
        {/each}
      </ul>
    {/if}
    <input
      id={`picker-input-${uid}`}
      bind:this={input}
      bind:value={query}
      class="ui-picker-input"
      role="combobox"
      aria-expanded={open}
      aria-controls={listId}
      aria-autocomplete="list"
      aria-describedby={help ? helpId : undefined}
      aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
      autocomplete="off"
      placeholder={full ? `Limit of ${max} reached` : placeholder}
      disabled={full}
      oninput={() => {
        open = true;
        active = -1;
        fetchSuggestions(query);
      }}
      onkeydown={keydown}
    />
  </div>
  {#if open}
    <ul id={listId} class="ui-picker-list" role="listbox" aria-label={`${label} suggestions`}>
      {#each options as option, index (option.value + (option.create ? ':new' : ''))}
        <li
          id={`${listId}-${index}`}
          role="option"
          aria-selected={index === active}
          class:active={index === active}
        >
          <button
            type="button"
            tabindex="-1"
            onmousedown={(event) => event.preventDefault()}
            onclick={() => choose(option)}
          >
            {#if option.create}<span class="ui-picker-create">Create</span>{/if}
            <span>{option.label}</span>
            {#if option.hint}<small>{option.hint}</small>{/if}
          </button>
        </li>
      {:else}
        <li class="ui-picker-empty" role="presentation">
          {#if loading}Searching...{:else if failed}Suggestions are unavailable.{createValue
              ? ' You can still type a new value.'
              : ''}{:else}No matches.{/if}
        </li>
      {/each}
    </ul>
  {/if}
  {#if help}<p id={helpId} class="editor-help">{help}</p>{/if}
  <p class="sr-only" role="status" aria-live="polite">{announcement}</p>
</div>
