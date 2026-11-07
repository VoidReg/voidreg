// Runs before first paint so the page never flashes the wrong theme. The same text is inlined
// in apps/web/src/app.html and apps/admin/src/app.html; theme-init.test.ts keeps them identical.
(() => {
  const name = 'voidreg-theme';
  const readCookie = (key) => {
    const prefix = key + '=';
    for (const part of document.cookie.split(';')) {
      const trimmed = part.trim();
      if (trimmed.startsWith(prefix)) {
        return decodeURIComponent(trimmed.slice(prefix.length));
      }
    }
    return '';
  };
  let saved = readCookie(name);
  if (saved !== 'light' && saved !== 'dark') {
    saved = '';
    try {
      const migrated = localStorage.getItem(name);
      if (migrated === 'light' || migrated === 'dark') {
        saved = migrated;
        const secure = location.protocol === 'https:' ? '; Secure' : '';
        document.cookie =
          name +
          '=' +
          encodeURIComponent(saved) +
          '; Path=/; Max-Age=31536000; SameSite=Lax' +
          secure;
        localStorage.removeItem(name);
      }
    } catch {
      /* private mode or blocked storage */
    }
  }
  const dark = saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.classList.toggle('light', !dark);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
