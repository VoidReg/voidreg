// Theme is stored in the same cookie the inline script in app.html reads before first paint.
const NAME = 'voidreg-theme';
class ThemeState {
  dark = $state(false);
  init() {
    this.dark = document.documentElement.classList.contains('dark');
  }
  toggle() {
    this.set(!this.dark);
  }
  set(dark: boolean) {
    this.dark = dark;
    const root = document.documentElement;
    root.classList.toggle('dark', dark);
    root.classList.toggle('light', !dark);
    root.dataset.theme = dark ? 'dark' : 'light';
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${NAME}=${dark ? 'dark' : 'light'}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  }
}
export const theme = new ThemeState();
