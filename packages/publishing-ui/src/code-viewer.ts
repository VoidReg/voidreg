import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cmake from 'highlight.js/lib/languages/cmake';
import cpp from 'highlight.js/lib/languages/cpp';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import glsl from 'highlight.js/lib/languages/glsl';
import go from 'highlight.js/lib/languages/go';
import ini from 'highlight.js/lib/languages/ini';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import makefile from 'highlight.js/lib/languages/makefile';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

const languages = {
  bash,
  c,
  cmake,
  cpp,
  css,
  diff,
  glsl,
  go,
  ini,
  javascript,
  json,
  makefile,
  markdown,
  python,
  rust,
  sql,
  typescript,
  xml,
  yaml
} as const;

let registered = false;

function ensureLanguages() {
  if (registered) return;
  registered = true;
  for (const [name, definition] of Object.entries(languages)) hljs.registerLanguage(name, definition);
}

/** Fence names that highlight.js knows under a different id. */
const highlightAliases: Record<string, string> = {
  rs: 'rust',
  'c++': 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  h: 'c',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  md: 'markdown',
  html: 'xml',
  svg: 'xml',
  vert: 'glsl',
  frag: 'glsl',
  make: 'makefile'
};

const labels: Record<string, string> = {
  rust: 'Rust',
  rs: 'Rust',
  c: 'C',
  cpp: 'C++',
  'c++': 'C++',
  cc: 'C++',
  h: 'C',
  hpp: 'C++',
  glsl: 'GLSL',
  vert: 'GLSL',
  frag: 'GLSL',
  wgsl: 'WGSL',
  hlsl: 'HLSL',
  python: 'Python',
  py: 'Python',
  javascript: 'JavaScript',
  js: 'JavaScript',
  jsx: 'JSX',
  typescript: 'TypeScript',
  ts: 'TypeScript',
  tsx: 'TSX',
  bash: 'Shell',
  sh: 'Shell',
  shell: 'Shell',
  zsh: 'Shell',
  json: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  toml: 'TOML',
  markdown: 'Markdown',
  md: 'Markdown',
  html: 'HTML',
  xml: 'XML',
  svg: 'SVG',
  css: 'CSS',
  sql: 'SQL',
  go: 'Go',
  diff: 'Diff',
  ini: 'INI',
  cmake: 'CMake',
  make: 'Makefile',
  makefile: 'Makefile',
  text: 'Text',
  txt: 'Text',
  plaintext: 'Text'
};

/** The language token on a Publisle code element, such as `language-rust`. */
export function languageFromClass(className: string | null): string | undefined {
  const match = className?.match(/(?:^|\s)language-([^\s]+)/i);
  return match?.[1];
}

/** A short name for the language bar. Unknown tokens stay readable. */
export function languageLabel(language: string | undefined): string {
  if (!language) return 'Text';
  const key = language.toLowerCase();
  return (
    labels[key] ?? key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

function highlightId(language: string | undefined): string | undefined {
  if (!language) return undefined;
  const key = language.toLowerCase();
  return highlightAliases[key] ?? key;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

/** Highlighted HTML for a code block. Unknown languages stay escaped plain text. */
export function highlightCode(source: string, language: string | undefined): string {
  ensureLanguages();
  const id = highlightId(language);
  if (!id || !hljs.getLanguage(id)) return escapeHtml(source);
  return hljs.highlight(source, { language: id, ignoreIllegals: true }).value;
}

function skip(pre: HTMLElement): boolean {
  return (
    pre.classList.contains('diagram-source-preview') ||
    pre.classList.contains('publisle-math-error') ||
    Boolean(pre.closest('.code-viewer, .katex, .publisle-math')) ||
    pre.hasAttribute('data-publisle-raw-html')
  );
}

/** Add a language bar, syntax colors, and a copy button to each code block. */
export function mountCodeViewers(root: ParentNode) {
  const document = root instanceof Document ? root : root.ownerDocument;
  if (!document) return;
  for (const pre of root.querySelectorAll<HTMLElement>('pre')) {
    if (skip(pre)) continue;
    const code = pre.querySelector(':scope > code');
    if (!code) continue;
    const language = languageFromClass(code.getAttribute('class'));
    const label = languageLabel(language);
    const viewer = document.createElement('div');
    viewer.className = 'code-viewer';
    const bar = document.createElement('div');
    bar.className = 'code-viewer-bar';
    const name = document.createElement('span');
    name.className = 'code-viewer-language';
    name.textContent = label;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'code-viewer-copy';
    button.textContent = 'Copy';
    const status = document.createElement('span');
    status.className = 'code-viewer-status';
    status.setAttribute('role', 'status');
    bar.append(name, button, status);
    const parent = pre.parentNode;
    if (!parent) continue;
    parent.insertBefore(viewer, pre);
    viewer.append(bar, pre);
    code.innerHTML = highlightCode(code.textContent ?? '', language);
    let timer = 0;
    button.addEventListener('click', () => {
      const text = code.textContent ?? '';
      const done = () => {
        button.textContent = 'Copied';
        status.textContent = 'Copied to clipboard';
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          button.textContent = 'Copy';
          status.textContent = '';
        }, 2000);
      };
      const clipboard = navigator.clipboard;
      if (!clipboard) return;
      void clipboard.writeText(text).then(done, () => {
        status.textContent = '';
      });
    });
  }
}
