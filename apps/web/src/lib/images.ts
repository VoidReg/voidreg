import { SITE } from '$lib/seo';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const DIAGRAM = `diagrams/[0-9a-f]{64}-(?:light|dark)`;
const MEDIA_URL = new RegExp(
  `^(https?:\\/\\/[^/]+)?\\/media\\/(${UUID}|${DIAGRAM})\\.(?:png|jpe?g)$`
);
const OPTIMIZED_FILE = new RegExp(`^(${UUID}|${DIAGRAM})\\.webp$`);

const SITE_ORIGINS = new Set([
  SITE,
  SITE.replace('://www.', '://'),
  SITE.replace('https://', 'http://'),
  SITE.replace('https://www.', 'http://')
]);

/** Public address of the compact rendition. Library files and diagram screenshots only. */
export function optimizedMediaUrl(url: string): string {
  const match = MEDIA_URL.exec(url);
  if (!match) return url;
  const origin = match[1];
  if (origin && !SITE_ORIGINS.has(origin)) return url;
  return `${origin ?? ''}/img/v1/${match[2]}.webp`;
}

/** Original files the compact rendition is encoded from, in the order to try them. */
export function originalMediaPaths(file: string): string[] | null {
  const match = OPTIMIZED_FILE.exec(file);
  if (!match) return null;
  const stem = match[1];
  if (stem.startsWith('diagrams/')) return [`/media/${stem}.png`];
  return [`/media/${stem}.png`, `/media/${stem}.jpg`];
}

function rewriteMediaUrls(html: string): string {
  return html.replace(
    /(\s(?:src|href)\s*=\s*)(["'])(.*?)\2/g,
    (whole, prefix: string, quote: string, url: string) => {
      const next = optimizedMediaUrl(url);
      return next === url ? whole : `${prefix}${quote}${next}${quote}`;
    }
  );
}

function hideSource(tag: string): string {
  if (!/\ssrc\s*=/.test(tag) || /\sdata-src\s*=/.test(tag)) return tag;
  return tag.replace(/\ssrc(\s*=\s*["'][^"']*["'])/, ' data-src$1');
}

function deferInactiveTheme(html: string, theme: 'light' | 'dark'): string {
  const themed = html.replace(
    /<figure\b[^>]*\bpublisle-figure-themed\b[^>]*>[\s\S]*?<\/figure>/g,
    (figure) =>
      figure.replace(/<img\b[^>]*>/g, (tag) => {
        const dark = /data-publisle-variant\s*=\s*["']dark["']/.test(tag);
        const hide = theme === 'light' ? dark : !dark;
        return hide ? hideSource(tag) : tag;
      })
  );
  return themed.replace(/<img\b[^>]*>/g, (tag) => {
    const dark = /class\s*=\s*["'][^"']*\bdiagram-dark\b/.test(tag);
    const light = /class\s*=\s*["'][^"']*\bdiagram-light\b/.test(tag);
    if ((theme === 'light' && dark) || (theme === 'dark' && light)) return hideSource(tag);
    return tag;
  });
}

/**
 * Point article images at the compact rendition. When the theme is already known, the hidden
 * variant keeps its address in `data-src` so the browser does not download it.
 */
export function optimizeArticleHtml(html: string, theme: 'light' | 'dark' | null): string {
  const rewritten = rewriteMediaUrls(html);
  return theme ? deferInactiveTheme(rewritten, theme) : rewritten;
}

type Presentable = {
  hero_image?: string | null;
  compiled?: { html?: string };
};

/** A copy of the article whose displayed images use the compact rendition. */
export function presentArticle<T extends Presentable>(
  article: T,
  theme: 'light' | 'dark' | null
): T {
  const hero = article.hero_image ? optimizedMediaUrl(article.hero_image) : article.hero_image;
  const html = article.compiled?.html;
  const compiled =
    article.compiled && typeof html === 'string'
      ? { ...article.compiled, html: optimizeArticleHtml(html, theme) }
      : article.compiled;
  if (hero === article.hero_image && compiled === article.compiled) return article;
  return { ...article, hero_image: hero, compiled };
}

function imageMatchesTheme(img: HTMLImageElement, dark: boolean): boolean {
  const role =
    img.classList.contains('diagram-dark') || img.dataset.publisleVariant === 'dark'
      ? 'dark'
      : img.classList.contains('diagram-light') || img.closest('.publisle-figure-themed')
        ? 'light'
        : null;
  if (!role) return true;
  return dark ? role === 'dark' : role === 'light';
}

/** Load a theme image when the reader switches theme, or when the page is printed. */
export function watchThemeImages(root: HTMLElement): () => void {
  const promote = (all: boolean) => {
    const dark = document.documentElement.classList.contains('dark');
    for (const img of root.querySelectorAll<HTMLImageElement>('img[data-src]')) {
      if (!all && !imageMatchesTheme(img, dark)) continue;
      const source = img.dataset.src;
      if (source && img.getAttribute('src') !== source) img.setAttribute('src', source);
    }
  };
  const onClass = () => promote(false);
  const onPrint = () => promote(true);
  onClass();
  const observer = new MutationObserver(onClass);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('beforeprint', onPrint);
  return () => {
    observer.disconnect();
    window.removeEventListener('beforeprint', onPrint);
  };
}
