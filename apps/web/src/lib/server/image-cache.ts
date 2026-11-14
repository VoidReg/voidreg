import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { encodeRaster } from './raster';

const MAX_BYTES = 8 * 1024 * 1024;
const inflight = new Map<string, Promise<RasterHit>>();

function cachePath(file: string): string {
  const root = process.env.IMAGE_CACHE ?? path.join(tmpdir(), 'voidreg-img');
  return path.join(root, file.replaceAll('/', '_'));
}

async function readCache(file: string): Promise<Uint8Array | null> {
  try {
    return await readFile(cachePath(file));
  } catch {
    return null;
  }
}

async function writeCache(file: string, body: Uint8Array): Promise<void> {
  const target = cachePath(file);
  const temporary = `${target}.${process.pid}.part`;
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(temporary, body);
  await rename(temporary, target);
}

async function fetchOriginal(paths: string[]): Promise<{ path: string; bytes: Uint8Array } | null> {
  const base = (process.env.VOIDREG_API_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '');
  for (const source of paths) {
    let response: Response;
    try {
      response = await fetch(base + source, { signal: AbortSignal.timeout(15_000) });
    } catch {
      return null;
    }
    if (response.status === 404) continue;
    if (!response.ok) return null;
    const type = response.headers.get('content-type') ?? '';
    if (!type.startsWith('image/')) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return null;
    return { path: source, bytes };
  }
  return null;
}

export type RasterHit =
  | { status: 'ready'; body: Uint8Array }
  | { status: 'missing' }
  | { status: 'fallback'; path: string };

/** The compact file, a redirect to the stored file when encoding fails, or a miss. */
export async function cachedRaster(file: string, sources: string[]): Promise<RasterHit> {
  const cached = await readCache(file);
  if (cached) return { status: 'ready', body: cached };
  let job = inflight.get(file);
  if (!job) {
    job = (async () => {
      const found = await fetchOriginal(sources);
      if (!found) return { status: 'missing' } as const;
      try {
        const encoded = await encodeRaster(found.bytes);
        try {
          await writeCache(file, encoded);
        } catch (error) {
          console.error(
            'image cache write failed',
            file,
            error instanceof Error ? error.message : error
          );
        }
        return { status: 'ready', body: encoded } as const;
      } catch (error) {
        console.error('image encode failed', file, error instanceof Error ? error.message : error);
        return { status: 'fallback', path: found.path } as const;
      }
    })().finally(() => inflight.delete(file));
    inflight.set(file, job);
  }
  return job;
}
