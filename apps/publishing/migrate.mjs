// Run after the compiler/API rollout and before replacing the public reader.
// Credentials come from a private cookie file, never command-line arguments.
import { readFile } from 'node:fs/promises';
const origin = process.env.PUBLISHING_ORIGIN;
if (!origin || !process.env.ADMIN_COOKIE_FILE)
  throw Error('Set PUBLISHING_ORIGIN and ADMIN_COOKIE_FILE.');
const cookie = (await readFile(process.env.ADMIN_COOKIE_FILE, 'utf8')).trim();
const csrf = decodeURIComponent(
  cookie
    .split('; ')
    .find((c) => c.startsWith('voidreg_admin_csrf='))
    ?.split('=')
    .slice(1)
    .join('=') ?? ''
);
const headers = { Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' };
async function request(path, method = 'GET', body) {
  const r = await fetch(origin + '/api/v1' + path, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (!r.ok) throw Error(path + ': ' + r.status + ' ' + (await r.text()));
  return r.json();
}
let scanned = 0,
  refreshed = 0;
for (const kind of ['articles', 'projects'])
  for (let page = 1; ; page++) {
    const result = await request('/admin/' + kind + '?page=' + page + '&per_page=100');
    for (const row of result.items) {
      if (row.archived || row.status !== 'published') continue;
      const publicPath = kind === 'articles' ? '/blogs/' : '/projects/';
      const published = await request(publicPath + row.slug);
      scanned++;
      if (!published.document?.blocks?.some((b) => b.type === 'publisle:diagram')) continue;
      const working = await request('/admin/' + kind + '/' + row.slug);
      const job = await request('/admin/' + kind + '/' + row.slug + '/compile', 'POST', {
        expected_revision: working.revision,
        snapshot: 'published'
      });
      let ready = false;
      for (let n = 0; n < 480; n++) {
        const state = await request('/admin/compilations/' + job.id);
        if (state.state === 'failed')
          throw Error(
            'Publication compilation failed: ' + row.slug + ' ' + JSON.stringify(state.diagnostics)
          );
        if (state.state === 'ready') {
          ready = true;
          break;
        }
        await new Promise((ok) => setTimeout(ok, 500));
      }
      if (!ready) throw Error('Compilation timed out: ' + row.slug);
      await request('/admin/' + kind + '/' + row.slug + '/refresh-publication', 'POST', {
        expected_revision: working.revision,
        compilation_id: job.id
      });
      refreshed++;
    }
    if (page * result.per_page >= result.total) break;
  }
console.log(JSON.stringify({ scanned, refreshed }));
