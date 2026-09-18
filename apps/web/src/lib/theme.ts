import { COOKIE_THEME, THEME_MAX_AGE_SECONDS, getCookie, setCookie } from './cookies';

export type Theme = 'light' | 'dark';

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const dark = theme === 'dark';
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.classList.toggle('light', !dark);
  document.documentElement.dataset.theme = theme;
}

export function readTheme(): Theme | null {
  const value = getCookie(COOKIE_THEME);
  return value === 'light' || value === 'dark' ? value : null;
}

export function setTheme(theme: Theme): void {
  applyTheme(theme);
  setCookie(COOKIE_THEME, theme, THEME_MAX_AGE_SECONDS);
}
