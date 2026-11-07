// Talks to the API's contact routes on behalf of the About page form. The API accepts these
// routes only with the shared forward token, which lives in this server's environment.
const unavailable = 'Messages cannot be sent right now. Please try again later.';

export type ContactFields = { name: string; email: string; message: string };
export type ContactSubmission = ContactFields & { form_token: string; website: string };
export type ContactResult = { ok: true } | { ok: false; message: string };

function base(env: Record<string, string | undefined>) {
  return (env.VOIDREG_API_URL ?? 'http://127.0.0.1:8080') + '/api/v1/contact';
}

export function forwardToken(env: Record<string, string | undefined> = process.env) {
  return env.CONTACT_FORWARD_TOKEN?.trim() || null;
}

/** A fresh signed form token, or null when the form is closed or the API is unreachable. */
export async function issueFormToken(
  fetcher: typeof fetch,
  env: Record<string, string | undefined> = process.env
): Promise<string | null> {
  const token = forwardToken(env);
  if (!token) return null;
  try {
    const response = await fetcher(base(env) + '/form', {
      method: 'POST',
      headers: { 'X-Contact-Forward': token },
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { token?: unknown };
    return typeof body.token === 'string' ? body.token : null;
  } catch {
    return null;
  }
}

export async function submitContact(
  fetcher: typeof fetch,
  submission: ContactSubmission,
  clientAddress: string,
  env: Record<string, string | undefined> = process.env
): Promise<ContactResult> {
  const token = forwardToken(env);
  if (!token) return { ok: false, message: unavailable };
  try {
    const response = await fetcher(base(env), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Contact-Forward': token,
        'X-Contact-Client': clientAddress
      },
      body: JSON.stringify(submission),
      signal: AbortSignal.timeout(15000)
    });
    if (response.ok) return { ok: true };
    if (response.status === 422 || response.status === 429) {
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: unknown };
      } | null;
      const message = body?.error?.message;
      if (typeof message === 'string' && message) return { ok: false, message };
    }
    return { ok: false, message: unavailable };
  } catch {
    return { ok: false, message: unavailable };
  }
}
