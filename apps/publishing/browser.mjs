import DOMPurify from '/deps/dompurify/dist/purify.es.mjs';
let mermaid;
export async function mermaidSvg(source, palette) {
  mermaid ??= (await import('/deps/mermaid/dist/mermaid.esm.min.mjs')).default;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    maxTextSize: 50000,
    maxEdges: 500,
    theme: 'base',
    htmlLabels: false,
    themeVariables: {
      darkMode: palette.dark,
      background: palette.background,
      primaryColor: palette.card,
      primaryTextColor: palette.foreground,
      primaryBorderColor: palette.input,
      secondaryColor: palette.secondary,
      secondaryTextColor: palette.foreground,
      tertiaryColor: palette.muted,
      tertiaryTextColor: palette.foreground,
      textColor: palette.foreground,
      lineColor: palette.input,
      mainBkg: palette.card,
      nodeBorder: palette.input,
      clusterBkg: palette.muted,
      clusterBorder: palette.border,
      edgeLabelBackground: palette.background,
      actorBkg: palette.card,
      actorBorder: palette.input,
      actorTextColor: palette.foreground,
      signalColor: palette.foreground,
      signalTextColor: palette.foreground,
      labelBoxBkgColor: palette.card,
      labelBoxBorderColor: palette.input,
      labelTextColor: palette.foreground,
      loopTextColor: palette.foreground,
      noteBkgColor: palette.secondary,
      noteBorderColor: palette.input,
      noteTextColor: palette.foreground,
      activationBkgColor: palette.secondary,
      activationBorderColor: palette.input,
      titleColor: palette.foreground,
      taskBkgColor: palette.card,
      taskBorderColor: palette.input,
      taskTextColor: palette.foreground,
      taskTextOutsideColor: palette.foreground,
      taskTextLightColor: palette.foreground,
      taskTextDarkColor: palette.foreground,
      activeTaskBkgColor: palette.secondary,
      activeTaskBorderColor: palette.input,
      doneTaskBkgColor: palette.muted,
      doneTaskBorderColor: palette.input,
      critBkgColor: palette.card,
      critBorderColor: palette.primary,
      todayLineColor: palette.primary,
      sectionBkgColor: palette.background,
      sectionBkgColor2: palette.card,
      altSectionBkgColor: palette.card,
      gridColor: palette.border,
      pieTitleTextColor: palette.foreground,
      pieLegendTextColor: palette.foreground,
      pieSectionTextColor: palette.foreground,
      pieStrokeColor: palette.input,
      pie1: palette.card,
      pie2: palette.secondary,
      pie3: palette.background
    },
    fontFamily: 'IBM Plex Sans, sans-serif',
    secure: [
      'secure',
      'securityLevel',
      'startOnLoad',
      'maxTextSize',
      'maxEdges',
      'theme',
      'themeVariables',
      'themeCSS',
      'fontFamily',
      'htmlLabels',
      'suppressErrorRendering'
    ]
  });
  const result = await mermaid.render('compiled-diagram', source);
  return result.svg;
}
export async function displaySvg(svg, palette) {
  const clean = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['foreignObject', 'script', 'a', 'image']
  });
  const canvas = document.getElementById('canvas');
  canvas.replaceChildren();
  canvas.style.background = palette.background;
  canvas.innerHTML = clean;
  const graphic = canvas.querySelector('svg');
  if (!graphic) throw new Error('Renderer did not produce SVG.');
  const box = graphic.getAttribute('viewBox')?.split(/[ ,]+/).map(Number);
  if (box?.length === 4 && box.every(Number.isFinite)) {
    graphic.setAttribute('width', String(Math.ceil(box[2])));
    graphic.setAttribute('height', String(Math.ceil(box[3])));
  }
  graphic.style.maxWidth = 'none';
  graphic.style.display = 'block';
  graphic.style.fontFamily = 'IBM Plex Sans, sans-serif';
  await document.fonts.ready;
  const bounds = canvas.getBoundingClientRect();
  if (bounds.width * 2 > 16000 || bounds.height * 2 > 16000)
    throw new Error('Diagram exceeds the supported image dimensions.');
  return { width: Math.ceil(bounds.width), height: Math.ceil(bounds.height) };
}
window.compiler = { mermaidSvg, displaySvg };
