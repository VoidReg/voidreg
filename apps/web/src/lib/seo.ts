// Pure SEO helpers shared by pages and server routes. Nothing here touches the DOM.
export const SITE = 'https://www.voidreg.xyz';
export const SITE_NAME = 'Voidreg';
export const DEFAULT_IMAGE = '/og-default.png';
export const DEFAULT_IMAGE_ALT = 'Voidreg, deep dive into the Void';
const TITLE_MAX = 60;
const DESCRIPTION_MAX = 160;

/** Cuts at a word boundary and never splits the text mid-word. */
function clip(text: string, max: number) {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 3);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, '') + '...';
}

/** A search-friendly description: the author's text, else the summary, capped near 160 chars. */
export function describe(...candidates: (string | null | undefined)[]) {
  const first = candidates.find((value) => value && value.trim());
  return clip(first ?? '', DESCRIPTION_MAX);
}

/** Page titles stay short enough for results, then carry the site suffix. */
export function pageTitle(title: string) {
  return clip(title, TITLE_MAX) + ' | ' + SITE_NAME;
}

export const absolute = (path: string) => new URL(path, SITE + '/').href;

export type Crumb = { name: string; path: string };

export function breadcrumbs(items: Crumb[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absolute(item.path)
    }))
  };
}

export const author = { '@type': 'Person', name: SITE_NAME, url: absolute('/about') };

export function wordCount(sections: { heading?: string; body: string }[] | undefined) {
  if (!sections) return undefined;
  const words = sections
    .map((section) => (section.heading ?? '') + ' ' + section.body)
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return words || undefined;
}

type Item = { slug: string; title: string; summary?: string };

/** A CollectionPage that also lists the items on the page, for list and topic routes. */
export function collection(
  name: string,
  path: string,
  description: string,
  items: Item[],
  itemPath: (item: Item) => string
) {
  return {
    '@type': 'CollectionPage',
    name,
    description,
    url: absolute(path),
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: items.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: absolute(itemPath(item)),
        name: item.title
      }))
    }
  };
}

export function website(description: string) {
  return [
    {
      '@type': 'WebSite',
      name: SITE_NAME,
      url: SITE + '/',
      description,
      inLanguage: 'en'
    },
    { ...author, '@type': 'Person', description }
  ];
}

/** Wraps nodes in one schema.org graph so each page ships a single JSON-LD block. */
export function graph(nodes: Record<string, unknown> | Record<string, unknown>[]) {
  const list = Array.isArray(nodes) ? nodes : [nodes];
  return list.length === 1
    ? { '@context': 'https://schema.org', ...list[0] }
    : { '@context': 'https://schema.org', '@graph': list };
}
