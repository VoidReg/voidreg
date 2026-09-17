export type ErrorCopy = { title: string; detail: string };

const genericPlaceholders = new Set(['Internal Error', 'Not Found', 'Error']);

export const errorCopy: Record<number, ErrorCopy> = {
  400: { title: 'Bad request', detail: 'This request could not be understood.' },
  401: { title: 'Unauthorized', detail: 'You need to be signed in to view this.' },
  403: { title: 'Forbidden', detail: "You don't have access to this." },
  404: { title: 'Not found', detail: "This URL isn't on Voidreg." },
  405: { title: 'Method not allowed', detail: "This page doesn't accept that request." },
  408: { title: 'Request timeout', detail: 'The request took too long to complete.' },
  410: { title: 'Gone', detail: 'This page has been removed.' },
  429: { title: 'Too many requests', detail: 'Slow down and try again in a moment.' },
  500: { title: 'Something went wrong', detail: "The page couldn't be loaded." },
  502: { title: 'Bad gateway', detail: 'An upstream service returned an invalid response.' },
  503: { title: 'Unavailable', detail: 'The site is temporarily unavailable.' },
  504: { title: 'Gateway timeout', detail: 'An upstream service took too long to respond.' }
};

export function copyForError(status: number, message?: string): ErrorCopy {
  const known = errorCopy[status];
  if (known) return known;

  const trimmed = message?.trim();
  const detail =
    trimmed && !genericPlaceholders.has(trimmed) ? trimmed : 'An unexpected error occurred.';

  return { title: 'Something went wrong', detail };
}
