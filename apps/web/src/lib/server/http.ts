import { createHash } from 'node:crypto';

/**
 * A text document with a validator. Feed readers and crawlers send `If-None-Match` on every
 * poll, so an unchanged feed costs a header check and a 304 with no body.
 */
export function textResponse(
  request: Request,
  body: string,
  type: string,
  options: { maxAge?: number; lastModified?: string } = {}
) {
  const etag = '"' + createHash('sha1').update(body).digest('base64url') + '"';
  const headers: Record<string, string> = {
    ETag: etag,
    'Cache-Control':
      'public, max-age=' + (options.maxAge ?? 900) + ', stale-while-revalidate=86400',
    Vary: 'Accept-Encoding'
  };
  if (options.lastModified && !Number.isNaN(Date.parse(options.lastModified)))
    headers['Last-Modified'] = new Date(options.lastModified).toUTCString();
  const sent = request.headers.get('if-none-match');
  const matches =
    sent !== null &&
    sent
      .split(',')
      .map((tag) => tag.trim().replace(/^W\//, ''))
      .some((tag) => tag === etag || tag === '*');
  if (matches) return new Response(null, { status: 304, headers });
  return new Response(body, { headers: { ...headers, 'Content-Type': type } });
}
