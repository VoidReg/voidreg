export const COOKIE_THEME = 'voidreg-theme';
export const COOKIE_CONSENT = 'voidreg-consent';

export const THEME_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

function cookieSuffix(maxAgeSeconds: number): string {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  return `; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
}

export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

export function setCookie(name: string, value: string, maxAgeSeconds: number): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)}${cookieSuffix(maxAgeSeconds)}`;
}

export function deleteCookie(name: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${cookieSuffix(0)}`;
}
