/* Offline flowcharts; the pinned Mermaid runtime precedes this wrapper. */
(() => {
  const figures = [...document.querySelectorAll('[data-document-diagram]')];
  if (!figures.length) return;
  const renderer = globalThis.mermaid;
  if (!renderer || typeof renderer.render !== 'function') return;
  let initializationFailed = false;
  try { renderer.initialize({
    startOnLoad: false, securityLevel: 'strict', htmlLabels: false, arrowMarkerAbsolute: false,
    suppressErrorRendering: true, logLevel: 'fatal',
    maxTextSize: 50000, maxEdges: 500, deterministicIds: true,
    deterministicIDSeed: 'sensa-documentation',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif',
    flowchart: { htmlLabels: false, useMaxWidth: false, wrappingWidth: 250 },
    secure: ['securityLevel', 'startOnLoad', 'htmlLabels', 'arrowMarkerAbsolute', 'suppressErrorRendering',
      'maxTextSize', 'maxEdges', 'deterministicIds', 'deterministicIDSeed', 'flowchart'],
  }); } catch { initializationFailed = true; }

  const render = async () => {
    try { await document.fonts?.ready; } catch { /* System fonts remain usable. */ }
    for (const figure of figures) {
      const source = figure.querySelector('.language-mermaid').textContent;
      const canvas = figure.querySelector('.doc-diagram-canvas');
      const details = figure.querySelector('.doc-diagram-source');
      const status = figure.querySelector('.doc-diagram-status');
      try {
        if (initializationFailed) throw new Error('Diagram renderer initialization failed');
        // The documentation uses plain flowcharts. Do not let an authored fence
        // override security settings, load images/icons or add interactive code.
        // This check happens before Mermaid creates its measurement DOM.
        if (/%%\{|^\s*---\s*$|@\{|\b(?:https?|data|javascript|vbscript):|\burl\s*\(|<\/?[a-z]|^\s*(?:click|style|classDef|linkStyle)\b/im.test(source))
          throw new Error('Unsupported active diagram content');
        const { svg } = await renderer.render(figure.dataset.diagramId, source);
        // Mermaid returns SVG, so require a well-formed SVG XML document rather
        // than accepting HTML parser recovery. Do not process DTD/entity input.
        if (typeof svg !== 'string' || /<!DOCTYPE|<!ENTITY/i.test(svg))
          throw new Error('Unexpected SVG declaration');
        const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
        const graphic = parsed.documentElement;
        if (parsed.doctype || parsed.querySelector('parsererror') || parsed.children.length !== 1
          || graphic?.localName !== 'svg' || graphic.namespaceURI !== 'http://www.w3.org/2000/svg'
          || graphic.querySelector('script, foreignObject, image, iframe, object, embed, a'))
          throw new Error('Unexpected active SVG content');
        for (const style of graphic.querySelectorAll('style')) {
          if (/@import|(?:https?|data|javascript|vbscript):|url\((?!\s*['"]?#[\w.:-]+['"]?\s*\))/i.test(style.textContent))
            throw new Error('Unexpected active SVG style');
        }
        for (const element of [graphic, ...graphic.querySelectorAll('*')]) {
          for (const attribute of [...element.attributes]) {
            if (attribute.name === 'xmlns' || attribute.name === 'xmlns:xlink') continue;
            if (/^on/i.test(attribute.name)
              || (/href$/i.test(attribute.name) && !attribute.value.startsWith('#'))
              || /(?:https?:|data:|javascript:|vbscript:|@import)/i.test(attribute.value)
              || /url\((?!\s*['"]?#[\w.:-]+['"]?\s*\))/i.test(attribute.value))
              throw new Error('Unexpected active SVG attribute');
          }
        }
        graphic.setAttribute('role', 'img');
        graphic.setAttribute('aria-label', figure.dataset.diagramLabel);
        canvas.replaceChildren(document.importNode(graphic, true));
        canvas.hidden = false;
        details.open = false;
        status.hidden = true;
        figure.dataset.diagramState = 'rendered';
      } catch {
        canvas.replaceChildren();
        canvas.hidden = true;
        details.open = true;
        status.textContent = figure.dataset.diagramError;
        status.hidden = false;
        figure.dataset.diagramState = 'error';
      }
    }
  };
  // A failure in one diagram retains its source and must not prevent the next.
  void render();
})();
