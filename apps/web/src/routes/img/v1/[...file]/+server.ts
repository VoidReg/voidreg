import { error } from '@sveltejs/kit';
import { originalMediaPaths } from '$lib/images';
import { cachedRaster } from '$lib/server/image-cache';

/** Compact WebP for a library image or a diagram screenshot. The stored file stays unchanged. */
export async function GET({ params }) {
  const file = params.file;
  const sources = originalMediaPaths(file);
  if (!sources) error(404, 'Not found');
  const result = await cachedRaster(file, sources);
  if (result.status === 'missing') error(404, 'Not found');
  if (result.status === 'fallback') {
    return new Response(null, {
      status: 302,
      headers: { location: result.path, 'cache-control': 'no-store' }
    });
  }
  return new Response(Buffer.from(result.body), {
    headers: {
      'content-type': 'image/webp',
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff'
    }
  });
}
