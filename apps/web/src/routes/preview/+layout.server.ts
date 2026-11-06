import { requireSession } from '$lib/server/preview';

// Everything under /preview is private: never cached, never indexed, never without a session.
export function load({ cookies, setHeaders }) {
  setHeaders({
    'cache-control': 'private, no-store',
    'x-robots-tag': 'noindex, nofollow'
  });
  requireSession(cookies);
  return {};
}
