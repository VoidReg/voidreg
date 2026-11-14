export const ZOOM_MIN = 1;
export const ZOOM_MAX = 6;

export type ZoomView = { scale: number; x: number; y: number };

/** Scale around a point, and snap back to center at the fitted size. */
export function nextView(
  view: ZoomView,
  factor: number,
  anchorX: number,
  anchorY: number
): ZoomView {
  if (!Number.isFinite(factor) || factor <= 0 || view.scale <= 0) return view;
  const scale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, view.scale * factor));
  if (scale === ZOOM_MIN) return { scale, x: 0, y: 0 };
  const ratio = scale / view.scale;
  return {
    scale,
    x: anchorX - (anchorX - view.x) * ratio,
    y: anchorY - (anchorY - view.y) * ratio
  };
}

const fitted: ZoomView = { scale: ZOOM_MIN, x: 0, y: 0 };

function shownImage(figure: HTMLElement): HTMLImageElement | null {
  for (const img of figure.querySelectorAll<HTMLImageElement>('img')) {
    if (getComputedStyle(img).display === 'none') continue;
    return img;
  }
  return null;
}

function apply(img: HTMLImageElement, view: ZoomView) {
  img.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
}

/** One viewer for the page. Clicking a figure image, or its Enlarge button, opens it. */
export function mountFigureZoom(root: HTMLElement) {
  const scope = root.closest('article') ?? root;
  const preview = scope.classList.contains('live-preview-article');
  for (const figure of scope.querySelectorAll<HTMLElement>('figure')) {
    if (figure.dataset.figureZoom === 'ready') continue;
    if (figure.closest('.article-toc, .figure-zoom')) continue;
    if (!figure.querySelector('img')) continue;
    figure.dataset.figureZoom = 'ready';
    if (!preview) figure.classList.add('figure-zoomable');
    const button = figure.ownerDocument.createElement('button');
    button.type = 'button';
    button.className = 'figure-enlarge';
    button.textContent = 'Enlarge';
    figure.append(button);
    const open = () => {
      const img = shownImage(figure);
      if (img) openZoom(img, figure);
    };
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      open();
    });
    if (preview) continue;
    figure.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('a, button, summary, .diagram-source')) return;
      const img = target.closest('img');
      if (!(img instanceof HTMLImageElement) || !figure.contains(img)) return;
      event.preventDefault();
      openZoom(img, figure);
    });
  }
}

function openZoom(source: HTMLImageElement, figure: HTMLElement) {
  const dialog = ensureDialog(source.ownerDocument);
  const img = dialog.querySelector<HTMLImageElement>('.figure-zoom-stage img');
  const caption = dialog.querySelector<HTMLElement>('.figure-zoom-caption');
  const stage = dialog.querySelector<HTMLElement>('.figure-zoom-stage');
  if (!img || !caption || !stage) return;
  img.src = source.currentSrc || source.src;
  img.alt = source.alt;
  caption.textContent = (figure.querySelector('figcaption')?.textContent ?? '').replace(/\s+/g, ' ').trim();
  caption.hidden = caption.textContent.length === 0;
  const view = dialog.dataset;
  view.zoom = JSON.stringify(fitted);
  apply(img, fitted);
  stage.classList.remove('is-panning');
  if (!dialog.open) dialog.showModal();
  dialog.querySelector<HTMLButtonElement>('[data-zoom="close"]')?.focus();
}

function readView(dialog: HTMLElement): ZoomView {
  try {
    const parsed = JSON.parse(dialog.dataset.zoom ?? '') as ZoomView;
    if (parsed && typeof parsed.scale === 'number') return parsed;
  } catch {
    // A missing view falls back to the fitted image.
  }
  return fitted;
}

function writeView(dialog: HTMLDialogElement, img: HTMLImageElement, view: ZoomView) {
  dialog.dataset.zoom = JSON.stringify(view);
  apply(img, view);
}

/** Close after this click finishes, so the press cannot land on the page underneath. */
function dismiss(event: Event, dialog: HTMLDialogElement) {
  event.preventDefault();
  event.stopPropagation();
  window.setTimeout(() => {
    if (dialog.open) dialog.close();
  }, 0);
}

function ensureDialog(doc: Document): HTMLDialogElement {
  const existing = doc.querySelector<HTMLDialogElement>('dialog.figure-zoom');
  if (existing) return existing;
  const dialog = doc.createElement('dialog');
  dialog.className = 'figure-zoom';
  dialog.setAttribute('aria-label', 'Enlarged image');
  const bar = doc.createElement('div');
  bar.className = 'figure-zoom-bar';
  const caption = doc.createElement('p');
  caption.className = 'figure-zoom-caption';
  bar.append(caption);
  for (const [action, label] of [
    ['out', 'Zoom out'],
    ['in', 'Zoom in'],
    ['fit', 'Fit'],
    ['close', 'Close']
  ] as const) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.dataset.zoom = action;
    button.textContent = label;
    bar.append(button);
  }
  const stage = doc.createElement('div');
  stage.className = 'figure-zoom-stage';
  const img = doc.createElement('img');
  img.alt = '';
  img.draggable = false;
  stage.append(img);
  dialog.append(bar, stage);
  doc.body.append(dialog);

  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { distance: number; view: ZoomView } | null = null;

  const image = () => dialog.querySelector<HTMLImageElement>('.figure-zoom-stage img');
  const anchor = (clientX: number, clientY: number) => {
    const rect = stage.getBoundingClientRect();
    return { x: clientX - (rect.left + rect.width / 2), y: clientY - (rect.top + rect.height / 2) };
  };
  const change = (factor: number, point: { x: number; y: number }) => {
    const current = image();
    if (!current) return;
    writeView(dialog, current, nextView(readView(dialog), factor, point.x, point.y));
  };

  bar.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    const action = button?.dataset.zoom;
    if (action === 'close') dismiss(event, dialog);
    else if (action === 'in') change(1.25, { x: 0, y: 0 });
    else if (action === 'out') change(1 / 1.25, { x: 0, y: 0 });
    else if (action === 'fit') {
      const current = image();
      if (current) writeView(dialog, current, fitted);
    }
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dismiss(event, dialog);
  });
  dialog.addEventListener('close', () => {
    pointers.clear();
    pinch = null;
    stage.classList.remove('is-panning');
    const current = image();
    if (current) current.style.transform = '';
  });
  stage.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const point = anchor(event.clientX, event.clientY);
      const delta = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16 : event.deltaY;
      change(Math.exp(-delta * 0.0015), point);
    },
    { passive: false }
  );
  stage.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    stage.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    pinch = null;
    if (pointers.size === 1) stage.classList.add('is-panning');
  });
  stage.addEventListener('pointermove', (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const current = image();
    if (!current) return;
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (!pinch || pinch.distance <= 0) pinch = { distance, view: readView(dialog) };
      else {
        const point = anchor(mid.x, mid.y);
        writeView(dialog, current, nextView(pinch.view, distance / pinch.distance, point.x, point.y));
      }
      return;
    }
    const view = readView(dialog);
    writeView(dialog, current, {
      scale: view.scale,
      x: view.x + event.clientX - previous.x,
      y: view.y + event.clientY - previous.y
    });
  });
  const release = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    pinch = null;
    if (pointers.size === 0) stage.classList.remove('is-panning');
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  return dialog;
}
