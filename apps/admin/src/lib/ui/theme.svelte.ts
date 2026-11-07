// The cookie and the pre-paint script are shared with the reader (see publishing-ui/src/theme.ts).
import { currentTheme, setTheme } from '@voidreg/publishing-ui/theme';

class ThemeState {
  dark = $state(false);
  init() {
    this.dark = currentTheme() === 'dark';
  }
  toggle() {
    this.set(!this.dark);
  }
  set(dark: boolean) {
    this.dark = dark;
    setTheme(dark ? 'dark' : 'light');
  }
}
export const theme = new ThemeState();
