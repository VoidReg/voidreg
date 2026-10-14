<script lang="ts">
  import type { PortableSchema } from '@publisle/schema';
  let {
    schema,
    value,
    onchange
  }: {
    schema: PortableSchema;
    value: Record<string, unknown>;
    onchange: (next: Record<string, unknown>) => void;
  } = $props();
</script>

<fieldset class="publishing-form">
  <legend>{schema.description ?? 'Custom block payload'}</legend>
  {#each Object.entries(schema.properties) as [key, field] (key)}
    {#if field.type === 'number'}<label
        >{field.description}<input
          type="number"
          value={Number(value[key] ?? 0)}
          oninput={(event) => onchange({ ...value, [key]: event.currentTarget.valueAsNumber })}
        /></label
      >
    {:else if field.type === 'string'}<label
        >{field.description}<input
          value={String(value[key] ?? '')}
          oninput={(event) => onchange({ ...value, [key]: event.currentTarget.value })}
        /></label
      >
    {:else if field.type === 'boolean'}<label
        >{field.description}<input
          type="checkbox"
          checked={Boolean(value[key])}
          onchange={(event) => onchange({ ...value, [key]: event.currentTarget.checked })}
        /></label
      >{/if}
  {/each}
</fieldset>
