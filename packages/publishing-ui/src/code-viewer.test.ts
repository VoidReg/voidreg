import assert from 'node:assert/strict';
import test from 'node:test';
import { highlightCode, languageFromClass, languageLabel } from './code-viewer.ts';

test('a code block reports its language name', () => {
  assert.equal(languageFromClass('language-rust'), 'rust');
  assert.equal(languageLabel('rs'), 'Rust');
  assert.equal(languageLabel('glsl'), 'GLSL');
  assert.equal(languageLabel(undefined), 'Text');
  assert.equal(languageLabel('wgsl'), 'WGSL');
});

test('known languages are highlighted and unknown source stays escaped', () => {
  const rust = highlightCode('fn main() {\n    let total = 1;\n}', 'rust');
  assert.match(rust, /class="hljs-keyword"/);
  assert.match(rust, /fn/);
  const plain = highlightCode('<script>alert(1)</script>', 'not-a-language');
  assert.equal(plain, '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.doesNotMatch(plain, /<script>/);
});
