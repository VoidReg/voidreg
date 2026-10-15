// Shared by the browser editor and the headless MCP service.
import { prepare, assertPrepared } from '@publisle/core';
import { compilePublication, type PublicationArtifact } from '@publisle/adapter-core';
import { parseDocument, type Document, type Diagnostic } from '@publisle/schema';
import { accessibilityProfile, interactivePublicationProfile } from '@publisle/profiles';
import { fromMarkdown, toMarkdown } from '@publisle/markdown';
import { registry, extensions } from './blocks';
import { defaultData, blockFields, blockLabels } from '@publisle/playground';
import { rendererRegistry } from './publishing/renderers';

export function compileDocument(
  input: unknown,
  title: string
): {
  document?: Document;
  artifact?: PublicationArtifact;
  diagnostics: readonly Diagnostic[];
} {
  try {
    const parsed = parseDocument(input);
    const document = {
      ...parsed,
      metadata: { ...parsed.metadata, title, language: parsed.metadata?.language ?? 'en' }
    };
    const prepared = prepare(document, {
      registry,
      unknownBlocks: 'error',
      profiles: [accessibilityProfile(), interactivePublicationProfile()]
    });
    const artifact = compilePublication(assertPrepared(prepared), {
      renderers: rendererRegistry,
      rawHtml: 'escape'
    });
    return { document, artifact, diagnostics: artifact.diagnostics };
  } catch (error) {
    return {
      diagnostics: [{ level: 'error', code: 'validation', message: (error as Error).message }]
    };
  }
}

export function importMarkdown(markdown: string) {
  return fromMarkdown(markdown, {
    resolveSchemaVersion: (type) => registry.get(type)?.schemaVersion
  });
}

// Plain Markdown editing is limited to native prose blocks. Custom/interactive
// blocks must use the canonical document even if an archival directive exists.
const markdownTypes = new Set(
  [
    'paragraph',
    'heading',
    'list',
    'quote',
    'code',
    'math',
    'figure',
    'table',
    'callout',
    'divider',
    'footnote',
    'raw-html',
    'embed',
    'diagram'
  ].map((name) => 'publisle:' + name)
);
export function safeMarkdown(document: Document) {
  if (document.blocks.some((block) => !markdownTypes.has(block.type))) {
    return {
      diagnostics: [
        {
          level: 'error' as const,
          code: 'markdown-loss',
          message:
            'This document contains rich blocks. Use structured editing to preserve their payloads.'
        }
      ]
    };
  }
  try {
    return toMarkdown(document, { policy: 'strict' });
  } catch (error) {
    return {
      diagnostics: [
        { level: 'error' as const, code: 'markdown-loss', message: (error as Error).message }
      ]
    };
  }
}

export function blockCatalog() {
  return [...registry.definitions.values()].map((definition) => ({
    type: definition.type,
    schemaVersion: definition.schemaVersion,
    label: blockLabels(extensions)[definition.type],
    ...(definition.contract && 'dataSchema' in definition.contract
      ? {
          dataSchema: definition.contract.dataSchema,
          schemaDependencies: definition.contract.schemaDependencies
        }
      : {}),
    fields: blockFields(definition.type, extensions),
    example: {
      id: '018fabc0-0000-4000-8000-000000000001',
      type: definition.type,
      schemaVersion: definition.schemaVersion,
      data: defaultData(definition.type, extensions)
    },
    ...('descriptor' in definition ? { descriptor: definition.descriptor } : {})
  }));
}
