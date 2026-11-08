---
slug: voidreg
title: Voidreg
category: Web platform
summary: The site you are reading, built as one system. A Rust API, a server-rendered reader, a browser admin, an MCP server and a document compiler, all open source.
tags: [rust, actix, sveltekit, mcp, publishing, self-hosted]
repo_url: https://github.com/VoidReg/voidreg-site
featured: true
sort_order: 10
related: [publisle]
---

## What it is

Voidreg is the publishing platform behind this site. It holds every project and article, serves them as fast server-rendered pages, and gives me an admin to write and publish without rebuilding anything. The code is one monorepo, and it is the same code that runs in production.

## What it is for

A place to write about systems work with full control over the content model, the reading experience, the feeds, and the way AI tools can read and draft content. It is also the real-world test for my other tools. [Publisle](/projects/publisle) compiles every page here, so the format has to survive actual writing.

## How it is put together

| Part | What it does |
| --- | --- |
| `apps/api` | Rust API on Actix, storing content in libSQL. Owns projects, articles, comments, accounts, moderation and media. |
| `apps/web` | SvelteKit reader, server-rendered. Pages work without JavaScript. |
| `apps/admin` | Single-page admin served at `/admin/`. Edit working copies, then publish a snapshot. |
| `apps/mcp` | MCP server. Anyone can read published content. A revocable token lets an AI client write drafts, never publish. |
| `apps/publishing` | Internal compiler that turns diagrams into images and validates math before an article goes live. |
| `packages/*` | Shared reader components, sanitizer and authoring blocks. |

Content is stored as a working copy and a published snapshot. Autosave only changes the working copy, and publishing swaps the public snapshot in one step. Deleted URLs stay reserved so links never get reused.

## Built for readers, search and machines

- Posts and projects are real documents, compiled from [Publisle](/projects/publisle).
- The same content is available as Markdown at `/blog/<slug>.md` and `/projects/<slug>.md`.
- `/llms.txt` and `/llms-full.txt` are built as bounded maps of the site, with a budget per project, so a model sees a fair slice of every project instead of only the newest posts. Each project also has its own `llms/<project>.txt`.
- RSS and the sitemap are cached with ETags and `stale-while-revalidate`, so crawlers and feed readers get fast, cheap answers.
- The MCP endpoint lets a client search and read the site with no sign-in.

## Comments and accounts

Commenting is optional. Visitors can sign in with GitHub or Google. One person is one profile: accounts are linked only when the provider reports the same verified email, or when you connect them yourself on the account page. Profile photos are hidden until you choose to show them and are always served through the site, so providers never learn who reads a post. You can export or delete your data from `/account`.

## Running it

Production is Docker Compose behind nginx on a single VPS. CI builds the API image, and a local script ships a release. The repository documents the deploy and the environment.

```sh
pnpm install
pnpm dev:web     # reader, proxies /api to localhost:8080
pnpm dev:admin   # admin on port 5174
cd apps/api && cargo test
```

## Status

In daily use. This is the live site.

## Links

- Source: [VoidReg/voidreg-site](https://github.com/VoidReg/voidreg-site)
- Document engine: [Publisle](/projects/publisle)
