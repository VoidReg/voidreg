export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}
let onUnauthorized: (() => void) | undefined;
/** Called once per 401 so the shell can show the sign-in screen without each caller handling it. */
export function setUnauthorizedHandler(handler: (() => void) | undefined) {
  onUnauthorized = handler;
}
export async function adminRequest<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const csrf = document.cookie
    .split('; ')
    .find((c) => c.startsWith('voidreg_admin_csrf='))
    ?.split('=')
    .slice(1)
    .join('=');
  const response = await fetch('/api/v1/admin' + path, {
    credentials: 'include',
    method,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-CSRF-Token': decodeURIComponent(csrf) } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    if (response.status === 401 && path !== '/session' && path !== '/login-options')
      onUnauthorized?.();
    throw new ApiError(
      data?.error?.message ?? 'Request failed. Please try again.',
      response.status
    );
  }
  return response.json();
}
