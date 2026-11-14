import { COOKIE_THEME } from '$lib/cookies';

export function load({ cookies }: { cookies: { get: (name: string) => string | undefined } }) {
  const value = cookies.get(COOKIE_THEME);
  return { theme: value === 'light' || value === 'dark' ? value : null };
}
