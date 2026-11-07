import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const norm = (text: string) => text.replace(/\s+/g, ' ').trim();
const source = readFileSync(new URL('./styles/theme-init.js', import.meta.url), 'utf8')
  .split('\n')
  .filter((line) => !line.startsWith('//'))
  .join('\n');

for (const app of ['web', 'admin']) {
  test(`the ${app} app.html inlines the shared pre-paint theme script`, () => {
    const html = readFileSync(
      new URL(`../../../apps/${app}/src/app.html`, import.meta.url),
      'utf8'
    );
    const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    assert.ok(
      inline.some((script) => norm(script) === norm(source)),
      `${app}/src/app.html must contain packages/publishing-ui/src/styles/theme-init.js`
    );
  });
}
