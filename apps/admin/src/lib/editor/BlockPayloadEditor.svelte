<script lang="ts">
  // Editor for the payload of an interactive block from the block kit. A block can ship its own
  // Editor.svelte; otherwise a form is built from the payload schema in its definition.
  import type { Component } from 'svelte';
  import { blockDefinitions } from '@voidreg/authoring/blocks';
  import { editors } from '@voidreg/publishing-ui/blocks/editors';
  import type { EditorProps } from '@voidreg/publishing-ui/blocks/kit';
  import SchemaPayload from '$lib/SchemaPayload.svelte';

  let {
    type,
    value,
    onchange
  }: { type: string; value: Record<string, unknown>; onchange: (next: unknown) => void } = $props();

  const definition = $derived(blockDefinitions.find((item) => item.type === type));
  const load = $derived(editors[type]);
  let Editor = $state.raw<Component<EditorProps> | null>(null);
  let failed = $state(false);
  $effect(() => {
    const loader = load;
    Editor = null;
    failed = false;
    if (!loader) return;
    let current = true;
    loader().then(
      (module) => {
        if (current) Editor = module.default;
      },
      () => {
        if (current) failed = true;
      }
    );
    return () => {
      current = false;
    };
  });
</script>

{#if load}
  {#if Editor}
    <Editor {value} {onchange} />
  {:else if failed}
    <p class="block-validation-error error" role="alert">
      The editor for this block failed to load.
    </p>
  {:else}
    <!-- Reserve room so the block does not jump while its editor loads. -->
    <div class="block-editor-loading" role="status" aria-label="Loading editor"></div>
  {/if}
{:else if definition}
  <SchemaPayload schema={definition.descriptor.payloadSchema} {value} {onchange} />
{/if}

<style>
  .block-editor-loading {
    min-height: 12rem;
    border: 1px dashed var(--border);
    background: var(--card);
  }
</style>
