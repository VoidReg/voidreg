---
slug: publisle
title: Publisle
category: Document tooling
summary: A portable semantic document format for technical writing. Markdown or typed JSON compiles to static articles, with optional interactive islands, citations, LaTeX, JATS and PDF export.
tags: [typescript, rust, markdown, latex, pdf, jats, documents]
repo_url: https://github.com/publisle/publisle
featured: true
sort_order: 20
related: [voidreg]
---

## What it is

Publisle turns Markdown or typed JSON into readable, static articles. An article keeps working without JavaScript. When you want something richer, such as an interactive explainer, you add an island that has its own authored fallback, so the page still makes sense if the runtime is missing.

A research profile adds citations, publisher templates, and export to LaTeX, JATS and PDF.

## The idea

Keep the document as structured data with a stable schema, not as the output of one editor. Plain Markdown covers prose. Typed blocks cover what Markdown cannot express: figures, math, citations and interactive diagrams. The same source can then become a web page, a paper or a PDF, and any tool can read it.

## A first article

```sh
npm install -g @publisle/cli

cat > article.md <<'EOF'
---
title: My first article
---

# Hello, Publisle

Readable articles start with Markdown.
EOF

publisle build article.md --out dist/
```

Open `dist/index.html` and you have a finished article.

## What is in the repository

- **Core packages.** Schema, block registry, validation and the compile pipeline.
- **Adapters.** Astro, Next, React, Svelte and Vue, so a host application can render a compiled publication.
- **Research profile.** `@publisle/cli-research` with templates for ACM, Elsevier, IEEE, Springer and a plain article, plus citation handling.
- **Playgrounds.** Svelte and React playgrounds, and a hosted one at [publisle.xyz/playground](https://publisle.xyz/playground) with an interactive FFT butterfly.
- **Block SDK.** Define custom blocks and codecs when the built-in set is not enough.

## The native engine

[publisle-rs](https://github.com/publisle/publisle-rs) is the Rust side of the project. It does two jobs that the JavaScript side should not:

- `publisle-pdf` lays out an article, shapes text and vector graphics, and writes a tagged PDF.
- `publisle-math` parses a bounded subset of TeX math into MathML. It never runs TeX, and anything it does not support stays visible in red with a structured warning, so a missing command is never silently dropped.

Neither crate touches the network. The PDF engine ships with pinned fonts through platform packages on npm.

```sh
publisle-rs math '\hat{x}+\binom{n}{k}' --mathml
```

## Where it runs

This site compiles every project and article with Publisle, and the admin editor uses the same blocks and compiler. That is the main test of the format: it has to handle real writing on a real site.

## Status

Beta. The core format and CLI are published on npm, and the native crates are published on crates.io. The Rust engine is experimental, and the repository keeps a measured gap report that lists where it still falls short. PDF/UA metadata records the requested standard, but accessibility compliance still needs independent validation, and template availability does not imply journal acceptance.

## Links

- Source: [publisle/publisle](https://github.com/publisle/publisle) and [publisle/publisle-rs](https://github.com/publisle/publisle-rs)
- Playground: [publisle.xyz/playground](https://publisle.xyz/playground)
- Used by: [Voidreg](/projects/voidreg)
