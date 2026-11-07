import { fail } from '@sveltejs/kit';
import { issueFormToken, submitContact } from '$lib/server/contact';
import type { Actions, PageServerLoad } from './$types';

const text = (data: FormData, key: string) => {
  const value = data.get(key);
  return typeof value === 'string' ? value : '';
};

// The token is issued when the page is served and proves the form was open for a few seconds.
export const load: PageServerLoad = async ({ fetch, setHeaders }) => {
  setHeaders({ 'Cache-Control': 'no-store' });
  return { contactToken: await issueFormToken(fetch) };
};

export const actions: Actions = {
  contact: async ({ request, fetch, getClientAddress }) => {
    const data = await request.formData();
    const fields = {
      name: text(data, 'name'),
      email: text(data, 'email'),
      message: text(data, 'message')
    };
    let address = 'unknown';
    try {
      address = getClientAddress();
    } catch {
      // No peer address available (for example behind an unconfigured proxy).
    }
    const result = await submitContact(
      fetch,
      { ...fields, form_token: text(data, 'form_token'), website: text(data, 'website') },
      address
    );
    if (!result.ok) return fail(422, { ...fields, error: result.message });
    return { sent: true as const };
  }
};
