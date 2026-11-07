// Minimal admin API client shared by the seed and stress scripts (Node 20+ fetch).
export const ORIGIN = (process.env.SEED_ORIGIN ?? 'http://127.0.0.1:5174').replace(/\/$/, '');
export const PASSWORD = process.env.ADMIN_PASSWORD ?? '';
const ADMIN = `${ORIGIN}/api/v1/admin`;

// These scripts create sample content, so they only run against a local development stack.
// A remote host needs ALLOW_REMOTE_SEED=1, and the production site is always refused.
const PRODUCTION = /(^|\.)voidreg\.xyz$/i;
export function assertSafeOrigin(
  origin = ORIGIN,
  allowRemote = process.env.ALLOW_REMOTE_SEED === '1'
) {
  const host = new URL(origin).hostname.replace(/^\[|\]$/g, '');
  if (PRODUCTION.test(host)) throw new Error(`Refusing to seed the production site (${host}).`);
  const local = host === 'localhost' || host === '::1' || /^127\./.test(host);
  if (!local && !allowRemote)
    throw new Error(
      `Refusing to write sample content to ${host}. Use a local stack, or set ALLOW_REMOTE_SEED=1 for a disposable remote one.`
    );
}
assertSafeOrigin();

export type Json = Record<string, unknown>;
const jar = new Map<string, string>();
let csrf = '';

export async function call<T = Json>(method: string, path: string, body?: unknown): Promise<T> {
  const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const response = await fetch(`${ADMIN}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  for (const line of response.headers.getSetCookie()) {
    const [pair] = line.split(';');
    const index = pair.indexOf('=');
    jar.set(pair.slice(0, index), pair.slice(index + 1));
  }
  const text = await response.text();
  const value = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new ApiFailure(method, path, response.status, value?.error?.message ?? text);
  }
  return value as T;
}

export class ApiFailure extends Error {
  constructor(
    readonly method: string,
    readonly path: string,
    readonly status: number,
    readonly detail: string
  ) {
    super(`${method} ${path} -> ${status} ${detail}`);
  }
}

/** Public, unauthenticated read. Returns the status and parsed body without throwing. */
export async function publicGet(path: string): Promise<{ status: number; body: any }> {
  const response = await fetch(`${ORIGIN}/api/v1${path}`);
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

export async function signIn() {
  await call('POST', '/session', { password: PASSWORD });
  const entry = [...jar].find(([name]) => /csrf/i.test(name));
  csrf = entry ? decodeURIComponent(entry[1]) : '';
}
