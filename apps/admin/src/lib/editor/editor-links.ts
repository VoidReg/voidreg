/** Only web destinations can be opened from draft content. */
export function editorLink(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim() || value.trim().startsWith('#')) return;
  try {
    const url = new URL(value, 'https://www.voidreg.xyz/');
    if (url.protocol === 'https:' || url.protocol === 'http:') return value;
  } catch {
    /* Incomplete URLs stay editable without becoming links. */
  }
}
