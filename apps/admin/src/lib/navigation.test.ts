import assert from 'node:assert/strict';
import test from 'node:test';
import { adminRoute, adminUrl, editorIdentity } from './navigation';
const url = (query = '') => new URL('https://example.test/admin/' + query);
test('legacy article deep links restore editor without list membership', () => {
  const route = adminRoute(url('?article=older-article&mode=preview&panel=settings'));
  assert.equal(route.tab, 'articles');
  assert.equal(route.item, 'older-article');
  assert.equal(route.editing, true);
  assert.equal(route.mode, 'preview');
  assert.equal(route.panel, 'settings');
});
test('project and new draft routes have distinct identities', () => {
  assert.equal(editorIdentity(url('?project=example')), 'projects:example');
  assert.equal(editorIdentity(url('?tab=projects&new=1')), 'projects:$new');
  assert.equal(editorIdentity(url('?tab=media&article=example')), '');
});
test('editor view navigation preserves identity and list return filters', () => {
  const start = url('?tab=projects&project=example&page=3&q=engine&status=draft');
  const next = new URL(adminUrl(start, { mode: 'preview', panel: 'settings' }), start);
  assert.equal(editorIdentity(next), editorIdentity(start));
  const back = new URL(adminUrl(next, { project: null, mode: null, panel: null }), start);
  assert.equal(editorIdentity(back), '');
  assert.equal(adminRoute(back).page, 3);
  assert.equal(adminRoute(back).query, 'engine');
  assert.equal(adminRoute(back).status, 'draft');
});
test('new draft identity can be replaced with saved slug while retaining view', () => {
  const start = url('?tab=articles&new=1&mode=preview');
  const saved = new URL(adminUrl(start, { new: null, article: 'saved-draft' }), start);
  assert.equal(editorIdentity(saved), 'articles:saved-draft');
  assert.equal(adminRoute(saved).mode, 'preview');
});
test('invalid navigation parameters use safe defaults', () => {
  const r = adminRoute(url('?tab=unknown&page=-5&mode=invalid&panel=unknown'));
  assert.equal(r.tab, 'articles');
  assert.equal(r.page, 1);
  assert.equal(r.mode, 'write');
  assert.equal(r.panel, 'document');
});
test('URL updates encode values and retain moderation filters', () => {
  const next = new URL(
    adminUrl(url('?tab=comments&view=users&m_source=source-id'), { m_q: 'a & b', m_page: 2 }),
    url()
  );
  assert.equal(next.searchParams.get('m_q'), 'a & b');
  assert.equal(next.searchParams.get('m_source'), 'source-id');
  assert.equal(next.pathname, '/admin/');
});
