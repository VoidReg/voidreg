import type { Handle } from '@sveltejs/kit/hooks';
import { prefersMarkdown } from '$lib/server/llm';

const detail = /^\/(blog|projects)\/([^/.]+)$/;

// Agents that ask for text/markdown on a post or project URL get its Markdown twin.
export const handle: Handle = async ({ event, resolve }) => {
  const match = detail.exec(event.url.pathname);
  if (!match) return resolve(event);
  if (event.request.method === 'GET' && prefersMarkdown(event.request.headers.get('accept'))) {
    const response = await event.fetch(event.url.pathname + '.md');
    return response;
  }
  const response = await resolve(event);
  response.headers.append('Vary', 'Accept');
  return response;
};
