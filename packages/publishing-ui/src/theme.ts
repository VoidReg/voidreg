// The light and dark theme, shared by the reader and the admin. The choice is a cookie that the
// inline script in each app.html (see styles/theme-init.js) reads before first paint.
export type Theme = 'light' | 'dark';
export const THEME_COOKIE = 'voidreg-theme';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme !== 'dark');
  root.dataset.theme = theme;
}

export function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function readTheme(): Theme | null {
  if (typeof document === 'undefined') return null;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(THEME_COOKIE + '=')) {
      const value = decodeURIComponent(trimmed.slice(THEME_COOKIE.length + 1));
      return value === 'light' || value === 'dark' ? value : null;
    }
  }
  return null;
}

export function setTheme(theme: Theme): void {
  applyTheme(theme);
  if (typeof document === 'undefined') return;
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${THEME_COOKIE}=${theme}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}
