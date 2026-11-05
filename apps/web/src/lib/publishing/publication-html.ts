import DOMPurify from './sanitize';

// KaTeX positions glyphs with numeric inline styles. Keep those geometry rules
// inside math only; authored HTML cannot add colors, URLs, or page positioning.
const mathProperties = new Set([
  'height',
  'width',
  'min-width',
  'max-width',
  'top',
  'bottom',
  'margin-left',
  'margin-right',
  'margin-top',
  'margin-bottom',
  'padding-left',
  'padding-right',
  'vertical-align',
  'font-size',
  'border-top-width',
  'border-bottom-width'
]);
const length = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:em|ex|px|%)?$/;

export function sanitizePublicationHtml(html: string): string {
  const fragment = DOMPurify.sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'style']
  });
  for (const element of fragment.querySelectorAll('[style]')) {
    const rules = element.closest('.katex')
      ? (element.getAttribute('style') ?? '').split(';').filter((rule) => {
          const [property, value, ...rest] = rule.split(':');
          return (
            rest.length === 0 &&
            mathProperties.has(property.trim()) &&
            length.test(value?.trim() ?? '')
          );
        })
      : [];
    if (rules.length) element.setAttribute('style', rules.join(';'));
    else element.removeAttribute('style');
  }
  const wrapper = fragment.ownerDocument.createElement('div');
  wrapper.append(fragment);
  return wrapper.innerHTML;
}
