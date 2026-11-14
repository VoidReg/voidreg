// Loads docs/drafts/projects/*.md into the admin as DRAFT projects. It never publishes.
// Safe to rerun: an existing draft with the same slug is updated, using its current revision
// (each rerun saves one new draft revision per project).
//
// Local stack (password sign-in):
//   SEED_ORIGIN=http://127.0.0.1:5174 ADMIN_PASSWORD=... \
//     pnpm --filter @voidreg/authoring import:projects
//
// Real site (OAuth sign-in; copy the two cookies from a signed-in admin tab for this run only,
// never store them):
//   IMPORT_ORIGIN=https://www.voidreg.xyz ADMIN_SESSION=... ADMIN_CSRF=... \
//     pnpm --filter @voidreg/authoring import:projects
//
// Add DRY_RUN=1 to validate every file and print the plan without writing anything.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { importMarkdown } from "../src/authoring.ts";
import {
  isLocalAsset,
  localAssets,
  parseDraft,
  withMediaUrls,
  type ProjectDraft,
} from "./project-drafts.ts";

const DIR = new URL("../../../docs/drafts/projects/", import.meta.url);
const ORIGIN = (
  process.env.IMPORT_ORIGIN ??
  process.env.SEED_ORIGIN ??
  "http://127.0.0.1:5174"
).replace(/\/$/, "");
const ADMIN = `${ORIGIN}/api/v1/admin`;
const DRY = process.env.DRY_RUN === "1";

type Json = Record<string, any>;
const jar = new Map<string, string>();
let csrf = "";

async function call<T = Json>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T | null> {
  const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const response = await fetch(`${ADMIN}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: ORIGIN,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const value = text ? JSON.parse(text) : {};
  if (response.status === 404 && method === "GET") return null;
  if (!response.ok)
    throw new Error(
      `${method} ${path} -> ${response.status} ${value?.error?.message ?? text}`,
    );
  return value as T;
}

async function signIn() {
  if (process.env.ADMIN_SESSION) {
    jar.set("voidreg_admin_session", process.env.ADMIN_SESSION);
    csrf = process.env.ADMIN_CSRF ?? "";
    jar.set("voidreg_admin_csrf", csrf);
    if (!csrf) throw new Error("ADMIN_CSRF is required with ADMIN_SESSION");
    return;
  }
  if (!process.env.ADMIN_PASSWORD) {
    throw new Error(
      "Set ADMIN_PASSWORD (local stack) or ADMIN_SESSION and ADMIN_CSRF",
    );
  }
  const response = await fetch(`${ADMIN}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }),
  });
  if (!response.ok) throw new Error(`Sign-in failed: ${response.status}`);
  for (const line of response.headers.getSetCookie()) {
    const [pair] = line.split(";");
    const index = pair.indexOf("=");
    jar.set(pair.slice(0, index), pair.slice(index + 1));
  }
  const entry = [...jar].find(([name]) => /csrf/i.test(name));
  csrf = entry ? decodeURIComponent(entry[1]) : "";
}

function load(): ProjectDraft[] {
  const names = readdirSync(DIR)
    .filter((name) => name.endsWith(".md") && name !== "README.md")
    .sort();
  return names.map((name) =>
    parseDraft(readFileSync(new URL(name, DIR), "utf8")),
  );
}

// Image files the drafts refer to as assets/..., uploaded once to the media library. A file already
// in the library under the same name and byte size is reused, so reruns do not pile up copies.
type Media = Map<string, { id: string; url: string }>;
const DRY_MEDIA: Media = new Map();

function assetFile(ref: string): Buffer {
  const url = new URL(ref, DIR);
  if (!existsSync(url)) throw new Error(`Missing image file ${ref}`);
  return readFileSync(url);
}

function checkAssets(draft: ProjectDraft) {
  if (
    draft.hero_image &&
    !isLocalAsset(draft.hero_image) &&
    !/^(https?:\/\/|\/media\/)/.test(draft.hero_image)
  )
    throw new Error(`${draft.slug}: hero_image must be assets/*.png, a URL or /media/`);
  for (const ref of localAssets(draft)) assetFile(ref);
}

async function uploadAssets(drafts: ProjectDraft[]): Promise<Media> {
  const media: Media = new Map();
  const refs = [...new Set(drafts.flatMap(localAssets))];
  if (!refs.length) return media;
  const library = await call<{ items: Json[] }>("GET", "/media");
  for (const ref of refs) {
    const bytes = assetFile(ref);
    const name = ref.replace(/^assets\//, "");
    const alt = drafts
      .filter((d) => d.hero_image === ref)
      .map((d) => d.hero_alt)[0];
    const caption = drafts
      .filter((d) => d.hero_image === ref)
      .map((d) => d.hero_caption)[0];
    let asset = library?.items.find(
      (item) => item.name === name && item.bytes === bytes.length,
    ) as Json | undefined;
    if (!asset)
      asset = (await call<Json>("POST", "/media", {
        name,
        alt: alt ?? "",
        data: bytes.toString("base64"),
      }))!;
    if ((alt ?? "") !== (asset.alt ?? "") || (caption ?? "") !== (asset.caption ?? ""))
      asset = (await call<Json>("PUT", `/media/${asset.id}`, {
        alt: alt ?? asset.alt ?? "",
        caption: caption ?? asset.caption ?? "",
      }))!;
    media.set(ref, { id: String(asset.id), url: String(asset.url) });
    console.log(`  image ${ref} -> ${asset.url}`);
  }
  return media;
}

function documentOf(draft: ProjectDraft, media: Media) {
  const urls = new Map([...media].map(([ref, asset]) => [ref, asset.url]));
  const result = importMarkdown(withMediaUrls(draft.body, urls));
  const errors = result.diagnostics.filter((d) => d.level === "error");
  if (errors.length || !result.document)
    throw new Error(
      `${draft.slug}: ${errors.map((d) => d.message).join("; ") || "no document"}`,
    );
  return {
    ...result.document,
    metadata: { ...result.document.metadata, title: draft.title },
  };
}

function fields(draft: ProjectDraft, media: Media) {
  const hero = draft.hero_image;
  const cover = hero && isLocalAsset(hero) ? media.get(hero)?.url : hero;
  return {
    slug: draft.slug,
    title: draft.title,
    category: draft.category,
    summary: draft.summary,
    tags: draft.tags,
    repo_url: draft.repo_url,
    featured: draft.featured,
    sort_order: draft.sort_order,
    ...(cover ? { hero_image: cover } : {}),
    media_ids: localAssets(draft)
      .map((ref) => media.get(ref)?.id)
      .filter((id): id is string => Boolean(id)),
    document: documentOf(draft, media),
  };
}

async function main() {
  const drafts = load();
  // Validate everything first so a bad file never leaves a half-imported batch.
  for (const draft of drafts) {
    checkAssets(draft);
    fields(draft, DRY_MEDIA);
  }
  console.log(
    `${drafts.length} drafts valid at ${ORIGIN}${DRY ? " (dry run)" : ""}`,
  );
  if (DRY) {
    for (const d of drafts)
      console.log(
        `  ${String(d.sort_order).padStart(3)} ${d.slug}  ${d.title}`,
      );
    return;
  }
  await signIn();
  const media = await uploadAssets(drafts);
  const ids = new Map<string, string>();
  for (const draft of drafts) {
    const existing = await call<Json>("GET", `/projects/${draft.slug}`);
    const saved = existing
      ? await call<Json>("PUT", `/projects/${draft.slug}`, {
          ...fields(draft, media),
          expected_revision: existing.revision,
        })
      : await call<Json>("POST", "/projects", fields(draft, media));
    ids.set(draft.slug, saved!.id);
    console.log(
      `  ${existing ? "updated" : "created"} draft ${draft.slug} (revision ${saved!.revision})`,
    );
  }
  for (const draft of drafts.filter((d) => d.related.length)) {
    const current = await call<Json>("GET", `/projects/${draft.slug}`);
    const related = draft.related.map((slug) => {
      const id = ids.get(slug);
      if (!id)
        throw new Error(`${draft.slug} relates to unknown project ${slug}`);
      return id;
    });
    if (
      JSON.stringify(current!.related_project_ids ?? []) ===
      JSON.stringify(related)
    )
      continue;
    await call("PUT", `/projects/${draft.slug}`, {
      related_project_ids: related,
      expected_revision: current!.revision,
    });
    console.log(`  linked ${draft.slug} to ${draft.related.join(", ")}`);
  }
  console.log("Done. Drafts only; publish from the admin after previewing.");
}

main().catch((error) => {
  console.error(String(error.message ?? error));
  process.exit(1);
});
