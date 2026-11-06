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

/** JSON POST with upload progress, for large base64 bodies where fetch cannot report bytes sent. */
export function adminUpload<T>(
  path: string,
  body: unknown,
  onProgress?: (fraction: number) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const csrf = document.cookie
      .split('; ')
      .find((c) => c.startsWith('voidreg_admin_csrf='))
      ?.split('=')
      .slice(1)
      .join('=');
    const request = new XMLHttpRequest();
    request.open('POST', '/api/v1/admin' + path);
    request.withCredentials = true;
    request.setRequestHeader('Content-Type', 'application/json');
    if (csrf) request.setRequestHeader('X-CSRF-Token', decodeURIComponent(csrf));
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    request.onerror = () => reject(new ApiError('The upload could not reach the server.', 0));
    request.onload = () => {
      let data: unknown = null;
      try {
        data = JSON.parse(request.responseText);
      } catch {
        /* empty body */
      }
      if (request.status >= 200 && request.status < 300) return resolve(data as T);
      if (request.status === 401) onUnauthorized?.();
      reject(
        new ApiError(
          (data as { error?: { message?: string } } | null)?.error?.message ??
            'Upload failed. Please try again.',
          request.status
        )
      );
    };
    request.send(JSON.stringify(body));
  });
}
