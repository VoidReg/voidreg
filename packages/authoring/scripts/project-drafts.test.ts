import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { importMarkdown } from "../src/authoring.ts";
import {
  isLocalAsset,
  localAssets,
  parseDraft,
  withMediaUrls,
} from "./project-drafts.ts";

const DIR = new URL("../../../docs/drafts/projects/", import.meta.url);
const files = readdirSync(DIR).filter(
  (name) => name.endsWith(".md") && name !== "README.md",
);

test("front matter is parsed", () => {
  const draft = parseDraft(
    "---\nslug: a\ntitle: A\ncategory: C\nsummary: S\ntags: [x, y]\nrepo_url: https://e.test\nfeatured: true\nsort_order: 10\nrelated: [b]\n---\n\n## Body\n",
  );
  assert.deepEqual(draft.tags, ["x", "y"]);
  assert.deepEqual(draft.related, ["b"]);
  assert.equal(draft.featured, true);
  assert.equal(draft.body, "## Body\n");
  assert.throws(() => parseDraft("no front matter"), /front matter/);
});

test("there is at least one draft", () => {
  assert.ok(files.length >= 1);
});

test("every draft has valid fields and imports without errors", () => {
  const slugs = new Set<string>();
  for (const name of files) {
    const draft = parseDraft(readFileSync(new URL(name, DIR), "utf8"));
    assert.match(draft.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, name);
    assert.ok(!slugs.has(draft.slug), `duplicate slug in ${name}`);
    slugs.add(draft.slug);
    assert.ok(draft.summary.length <= 300, `${name} summary is too long`);
    assert.ok(
      draft.tags.length >= 1 && draft.tags.length <= 12,
      `${name} tag count`,
    );
    assert.ok(
      !/[\u2014\u2013]/.test(readFileSync(new URL(name, DIR), "utf8")),
      `${name} has a dash`,
    );
    const result = importMarkdown(draft.body);
    const errors = result.diagnostics.filter((d) => d.level === "error");
    assert.deepEqual(errors, [], `${name} import errors`);
    assert.ok(result.document, `${name} produced no document`);
  }
  for (const name of files) {
    const draft = parseDraft(readFileSync(new URL(name, DIR), "utf8"));
    for (const slug of draft.related)
      assert.ok(slugs.has(slug), `${name} relates to unknown ${slug}`);
  }
});

test("cover and body images are found and rewritten", () => {
  const draft = parseDraft(
    "---\nslug: a\ntitle: A\ncategory: C\nsummary: S\ntags: [x]\nfeatured: false\nsort_order: 1\nhero_image: assets/a/cover.png\nhero_alt: Cover: a mark\nhero_caption: Cap\n---\n\n![Alt](assets/a/shot.png \"Title\")\n\n![Remote](https://e.test/x.png)\n",
  );
  assert.equal(draft.hero_alt, "Cover: a mark");
  assert.deepEqual(localAssets(draft), ["assets/a/cover.png", "assets/a/shot.png"]);
  const urls = new Map([["assets/a/shot.png", "/media/1.png"]]);
  assert.equal(
    withMediaUrls(draft.body, urls),
    '![Alt](/media/1.png "Title")\n\n![Remote](https://e.test/x.png)\n',
  );
  assert.ok(!isLocalAsset("assets/../secret.png"));
  assert.ok(!isLocalAsset("/etc/passwd.png"));
});

test("every local image exists, is a small PNG or JPEG, and has alt text", () => {
  for (const name of files) {
    const draft = parseDraft(readFileSync(new URL(name, DIR), "utf8"));
    for (const ref of localAssets(draft)) {
      const bytes = readFileSync(new URL(ref, DIR));
      assert.ok(bytes.length <= 4 * 1024 * 1024, `${ref} is over 4 MiB`);
      const png = bytes.subarray(0, 8).equals(Buffer.from("\x89PNG\r\n\x1a\n", "latin1"));
      const jpg = bytes[0] === 0xff && bytes[1] === 0xd8;
      assert.ok(png || jpg, `${ref} is not a PNG or JPEG`);
    }
    if (draft.hero_image) assert.ok(draft.hero_alt, `${name} cover needs alt text`);
  }
});
