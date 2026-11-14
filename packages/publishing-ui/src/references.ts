import { citationKey } from '@publisle/adapter-core';
import {
  isInteractiveEnvelope,
  type Document,
  type PublicationMetadata
} from '@publisle/schema';

/** One citable work stored on a bibliography block. */
export type ReferenceEntry = {
  id: string;
  type?: string;
  title?: string;
  authors?: string[];
  issued?: string;
  containerTitle?: string;
  volume?: string;
  issue?: string;
  page?: string;
  publisher?: string;
  edition?: string;
  doi?: string;
  url?: string;
  raw?: string;
};

type CitationItem = {
  id: string;
  locator?: string;
  label?: string;
  suppressAuthor?: boolean;
};

type CitationCluster = {
  items: CitationItem[];
  prefix?: string;
  suffix?: string;
};

/** A reference line a person can read, numbered in citation order. */
export function formatReference(entry: ReferenceEntry, number: number): string {
  if (entry.raw) return `${number}. ${entry.raw}`;
  const authors = entry.authors?.filter(Boolean).join(', ');
  const place = [entry.volume && `vol. ${entry.volume}`, entry.issue && `no. ${entry.issue}`, entry.page && `pp. ${entry.page}`]
    .filter((part): part is string => Boolean(part))
    .join(', ');
  const body = [authors, entry.issued && `(${entry.issued})`, entry.title, entry.containerTitle, entry.edition, entry.publisher, place]
    .filter((part): part is string => Boolean(part))
    .join('. ')
    .replace(/\.+/g, '.');
  const link = entry.url || (entry.doi ? `https://doi.org/${entry.doi}` : '');
  const sentence = body ? (body.endsWith('.') ? body : `${body}.`) : entry.id;
  return `${number}. ${sentence}${link ? ` ${link}` : ''}`;
}

/** Bracketed citation numbers, with a locator kept beside its number. */
export function formatCitation(items: readonly CitationItem[], numbers: ReadonlyMap<string, number>): string {
  const parts = items.map((item) => {
    const number = numbers.get(item.id);
    const label = number === undefined ? item.id : String(number);
    return item.locator ? `${label}, ${item.locator}` : label;
  });
  return `[${parts.join('; ')}]`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function entryFrom(value: unknown): ReferenceEntry | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id) return undefined;
  const authors = Array.isArray(value.authors)
    ? value.authors.filter((author): author is string => typeof author === 'string')
    : undefined;
  const text = (key: string) => (typeof value[key] === 'string' ? (value[key] as string) : undefined);
  const type = text('type');
  const title = text('title');
  const issued = text('issued');
  const containerTitle = text('containerTitle');
  const volume = text('volume');
  const issue = text('issue');
  const page = text('page');
  const publisher = text('publisher');
  const edition = text('edition');
  const doi = text('doi');
  const url = text('url');
  const raw = text('raw');
  return {
    id: value.id,
    ...(type ? { type } : {}),
    ...(title ? { title } : {}),
    ...(authors?.length ? { authors } : {}),
    ...(issued ? { issued } : {}),
    ...(containerTitle ? { containerTitle } : {}),
    ...(volume ? { volume } : {}),
    ...(issue ? { issue } : {}),
    ...(page ? { page } : {}),
    ...(publisher ? { publisher } : {}),
    ...(edition ? { edition } : {}),
    ...(doi ? { doi } : {}),
    ...(url ? { url } : {}),
    ...(raw ? { raw } : {})
  };
}

/** Bibliography entries in document order. */
export function bibliographyEntries(document: Document): ReferenceEntry[] {
  const entries: ReferenceEntry[] = [];
  for (const block of document.blocks) {
    if (block.type !== 'publisle:bibliography' || !isRecord(block.data)) continue;
    const list = block.data.entries;
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const entry = entryFrom(item);
      if (entry) entries.push(entry);
    }
  }
  return entries;
}

function clusterFrom(node: Record<string, unknown>): CitationCluster | undefined {
  if (node.type !== 'citationReference' || !Array.isArray(node.items)) return undefined;
  const items = node.items.flatMap((item): CitationItem[] => {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id) return [];
    return [
      {
        id: item.id,
        ...(typeof item.locator === 'string' ? { locator: item.locator } : {}),
        ...(typeof item.label === 'string' ? { label: item.label } : {}),
        ...(item.suppressAuthor === true ? { suppressAuthor: true } : {})
      }
    ];
  });
  if (!items.length) return undefined;
  return {
    items,
    ...(typeof node.prefix === 'string' ? { prefix: node.prefix } : {}),
    ...(typeof node.suffix === 'string' ? { suffix: node.suffix } : {})
  };
}

function walk(value: unknown, visit: (node: Record<string, unknown>) => void) {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (!isRecord(value)) return;
  visit(value);
  for (const child of Object.values(value)) walk(child, visit);
}

/** First-appearance numbers. Works named only in the bibliography follow the citations. */
export function referenceNumbers(document: Document): Map<string, number> {
  const numbers = new Map<string, number>();
  const take = (id: string) => {
    if (!numbers.has(id)) numbers.set(id, numbers.size + 1);
  };
  walk(document.blocks, (node) => {
    const cluster = clusterFrom(node);
    if (cluster) for (const item of cluster.items) take(item.id);
  });
  for (const entry of bibliographyEntries(document)) take(entry.id);
  return numbers;
}

function clusterKey(cluster: CitationCluster): string {
  return citationKey({
    items: cluster.items,
    prefix: cluster.prefix ?? '',
    suffix: cluster.suffix ?? ''
  });
}

/** Values the publication compiler substitutes for citation markers and the reference list. */
export function referenceRender(document: Document): {
  citations?: Record<string, string>;
  bibliography?: { id: string; text: string }[];
} {
  const numbers = referenceNumbers(document);
  if (!numbers.size) return {};
  const citations: Record<string, string> = {};
  walk(document.blocks, (node) => {
    const cluster = clusterFrom(node);
    if (!cluster) return;
    citations[clusterKey(cluster)] = formatCitation(cluster.items, numbers);
  });
  const byId = new Map(bibliographyEntries(document).map((entry) => [entry.id, entry]));
  const bibliography = [...numbers].map(([id, number]) => ({
    id,
    text: formatReference(byId.get(id) ?? { id }, number)
  }));
  return {
    ...(Object.keys(citations).length ? { citations } : {}),
    bibliography
  };
}

function withLabel(block: Document['blocks'][number]): Document['blocks'][number] {
  const data = block.data;
  if (!isInteractiveEnvelope(data)) return block;
  const label = data.accessibility?.label?.trim();
  if (!label) return block;
  const content = data.content ?? {};
  const known = JSON.stringify(content) + JSON.stringify(data.fallback ?? []);
  if (known.includes(label)) return block;
  const description = content.description ?? [];
  return {
    ...block,
    data: {
      activation: data.activation,
      payload: data.payload,
      ...(data.initialState !== undefined ? { initialState: data.initialState } : {}),
      ...(data.fallback ? { fallback: data.fallback } : {}),
      ...(data.accessibility ? { accessibility: data.accessibility } : {}),
      content: {
        ...content,
        description: [{ type: 'paragraph', content: [{ type: 'text', value: label }] }, ...description]
      }
    }
  } as unknown as Document['blocks'][number];
}

function rewriteValue(value: unknown, numbers: ReadonlyMap<string, number>): unknown {
  if (Array.isArray(value)) return value.map((item) => rewriteValue(item, numbers));
  if (!isRecord(value)) return value;
  const cluster = clusterFrom(value);
  if (cluster) return { type: 'text', value: formatCitation(cluster.items, numbers) };
  const copy: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) copy[key] = rewriteValue(child, numbers);
  return copy;
}

/** Turn compiled citation markers into links and give each reference a fragment id. */
export function linkRenderedReferences(root: ParentNode) {
  const numbers = new Map<string, number>();
  for (const item of root.querySelectorAll<HTMLElement>('[data-publisle-bibliography-id]')) {
    const id = item.getAttribute('data-publisle-bibliography-id') ?? '';
    const fragment = referenceFragment(id);
    if (item.id !== fragment) item.id = fragment;
    if (!numbers.has(id)) numbers.set(id, numbers.size + 1);
    if (item.dataset.publisleLinked === 'true') continue;
    linkifyUrls(item);
    item.dataset.publisleLinked = 'true';
  }
  for (const cite of root.querySelectorAll<HTMLElement>('.publisle-citation')) {
    if (cite.querySelector('a')) continue;
    const raw = cite.getAttribute('data-publisle-citation');
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) continue;
    const doc = cite.ownerDocument;
    cite.replaceChildren(doc.createTextNode('['));
    parsed.forEach((item, index) => {
      if (!isRecord(item)) return;
      if (index) cite.append(doc.createTextNode('; '));
      const id = typeof item.id === 'string' ? item.id : '';
      const number = numbers.get(id);
      const label = number === undefined ? id : String(number);
      if (id && number !== undefined) {
        const link = doc.createElement('a');
        link.href = `#${referenceFragment(id)}`;
        link.textContent = label;
        cite.append(link);
      } else cite.append(doc.createTextNode(label));
      if (typeof item.locator === 'string' && item.locator)
        cite.append(doc.createTextNode(`, ${item.locator}`));
    });
    cite.append(doc.createTextNode(']'));
  }
}

function linkifyUrls(item: HTMLElement) {
  const doc = item.ownerDocument;
  const pattern = /https?:\/\/[^\s<>]+/g;
  for (const node of [...item.childNodes]) {
    if (node.nodeType !== doc.TEXT_NODE) continue;
    const value = node.textContent ?? '';
    if (!pattern.test(value)) continue;
    pattern.lastIndex = 0;
    const fragment = doc.createDocumentFragment();
    let cursor = 0;
    for (const match of value.matchAll(pattern)) {
      const url = match[0].replace(/[).,;]+$/, '');
      const index = match.index ?? 0;
      fragment.append(doc.createTextNode(value.slice(cursor, index)));
      const link = doc.createElement('a');
      link.href = url;
      link.textContent = url;
      fragment.append(link);
      fragment.append(doc.createTextNode(value.slice(index + url.length, index + match[0].length)));
      cursor = index + match[0].length;
    }
    fragment.append(doc.createTextNode(value.slice(cursor)));
    node.replaceWith(fragment);
  }
}

function paragraph(id: string, value: string): Document['blocks'][number] {
  return {
    id: id as Document['blocks'][number]['id'],
    type: 'publisle:paragraph',
    schemaVersion: 1,
    data: { content: [{ type: 'text', value }] }
  };
}

/**
 * The document behind the Markdown LLMs and readers download.
 * Schematic payloads, schema versions, and extension metadata stay in the archival export.
 */
export function readingDocument(document: Document): Document {
  const numbers = referenceNumbers(document);
  const byId = new Map(bibliographyEntries(document).map((entry) => [entry.id, entry]));
  const metadata = leanMetadata(document.metadata);
  return {
    schemaVersion: document.schemaVersion,
    ...(metadata ? { metadata } : {}),
    blocks: document.blocks.flatMap((block) => {
      if (block.type === 'publisle:bibliography') {
        return [...numbers].map(([id, number]) =>
          paragraph(`${block.id}-${number}`, formatReference(byId.get(id) ?? { id }, number))
        );
      }
      const rewritten = rewriteValue(withLabel(block), numbers) as Document['blocks'][number];
      return [rewritten];
    })
  };
}

/** Title, description, language, author names, dates, and subjects. Not ids, images, or extension blobs. */
export function leanMetadata(metadata: PublicationMetadata | undefined): PublicationMetadata | undefined {
  if (!metadata) return undefined;
  const authors = metadata.authors
    ?.map((author) => ({
      name: author.name,
      ...(author.affiliation ? { affiliation: author.affiliation } : {})
    }))
    .filter((author) => author.name);
  const lean: PublicationMetadata = {
    ...(metadata.title ? { title: metadata.title } : {}),
    ...(metadata.description ? { description: metadata.description } : {}),
    ...(metadata.language ? { language: metadata.language } : {}),
    ...(authors?.length ? { authors } : {}),
    ...(metadata.publishedAt ? { publishedAt: metadata.publishedAt } : {}),
    ...(metadata.modifiedAt ? { modifiedAt: metadata.modifiedAt } : {}),
    ...(metadata.subjects?.length ? { subjects: metadata.subjects } : {})
  };
  return Object.keys(lean).length ? lean : undefined;
}

/** Fragment id for a bibliography entry. */
export function referenceFragment(id: string): string {
  const safe = id.replace(/[^A-Za-z0-9_-]/g, '');
  return `ref-${safe || 'item'}`;
}
