import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizePublicationHtml } from '../src/lib/publishing/publication-html';

test('preserves numeric KaTeX geometry needed for fractions and aligned equations', () => {
  const result = sanitizePublicationHtml(
    '<span class="katex"><span style="top:-2.314em;height:3.5em;margin-right:0.1em;vertical-align:-0.2em">x</span></span>'
  );
  assert.match(result, /top:-2.314em/);
  assert.match(result, /height:3.5em/);
  assert.match(result, /vertical-align:-0.2em/);
});

test('rejects page positioning, external CSS URLs, and arbitrary styling even inside math', () => {
  const result = sanitizePublicationHtml(
    '<span class="katex"><span style="height:2em;position:fixed;top:expression(alert(1));background:url(https://example.test/track);color:red;width:calc(100vw)">x</span></span><p style="height:999px">text</p>'
  );
  assert.match(result, /style="height:2em"/);
  assert.doesNotMatch(result, /position|expression|url\(|color:red|calc\(|999px/);
});

test('retains MathML and reference anchors while removing active HTML', () => {
  const result = sanitizePublicationHtml(
    '<span class="katex"><math><semantics><mi>x</mi></semantics></math></span><a href="#equation-1">Equation 1</a><script>alert(1)</script><iframe src="https://example.test"></iframe><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">bad</a>'
  );
  assert.match(result, /<math>/);
  assert.match(result, /href="#equation-1"/);
  assert.doesNotMatch(result, /<script|<iframe|onerror|javascript:/);
});
