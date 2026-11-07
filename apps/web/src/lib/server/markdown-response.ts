/** Inline Markdown with the HTML page declared canonical, so search engines index one URL. */
export function markdownResponse(request: Request, text: string, canonical: string, tag: string) {
  const etag = '"' + tag.replace(/[^\w.-]/g, '') + '-llm"';
  const headers = {
    'Content-Type': 'text/markdown; charset=utf-8',
    Link: '<' + canonical + '>; rel="canonical"',
    'Cache-Control': 'public, max-age=300, must-revalidate',
    Vary: 'Accept',
    ETag: etag,
    'X-Content-Type-Options': 'nosniff'
  };
  if (request.headers.get('if-none-match') === etag)
    return new Response(null, { status: 304, headers });
  return new Response(text, { headers });
}
