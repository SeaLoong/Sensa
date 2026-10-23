/* Shared language preference; the site never opens Sensa or activates outputs.
   共用语言偏好；文档站不启动 Sensa 或启用输出。 */
(() => {
  const normalize = value => {
    if (typeof value !== 'string') return null;
    const tag = value.trim().replaceAll('_', '-').toLowerCase();
    return /^en(?:-[a-z0-9]{1,8})*$/.test(tag) ? 'en' : /^zh(?:-[a-z0-9]{1,8})*$/.test(tag) ? 'zh-CN' : null;
  };
  const read = () => { try { return localStorage.getItem('sensa.locale'); } catch { return null; } };
  const save = locale => { try { localStorage.setItem('sensa.locale', locale === 'en' ? 'en-US' : locale); } catch { /* Private storage may be unavailable. / 隐私模式可能禁用存储。 */ } };
  const home = document.body.hasAttribute('data-home');
  let locale = normalize(new URL(location.href).searchParams.get('lang')) || normalize(read())
    || [...(navigator.languages || []), navigator.language].map(normalize).find(Boolean) || 'en';
  const apply = next => {
    locale = next;
    document.documentElement.lang = next === 'en' ? 'en-US' : next;
    document.title = next === 'en' ? 'Sensa — Inputs, computation and outputs' : 'Sensa — 输入、计算与输出';
    document.querySelectorAll('[data-en]').forEach(x => { x.hidden = next !== 'en'; });
    document.querySelectorAll('[data-zh]').forEach(x => { x.hidden = next !== 'zh-CN'; });
    document.querySelectorAll('[data-doc]').forEach(x => {
      const fragment = next === 'en' ? x.dataset.fragmentEn : x.dataset.fragmentZh;
      x.href = next + '/' + x.dataset.doc + '.html' + (fragment ? '#' + encodeURIComponent(fragment) : '');
    });
    document.querySelectorAll('[data-label-en]').forEach(x => { x.setAttribute('aria-label', next === 'en' ? x.dataset.labelEn : x.dataset.labelZh); });
    document.querySelectorAll('[data-diagram]').forEach(x => { x.href = 'parameter-geometry.html?lang=' + (next === 'en' ? 'en-US' : next); });
    document.getElementById('language').textContent = next === 'en' ? '简体中文' : 'English';
    const available = document.body.dataset.vpm === 'true';
    document.getElementById('vcc').hidden = !available;
    document.getElementById('copy-vpm').hidden = !available;
    if (available) document.getElementById('vpm-status').textContent = next === 'en' ? 'Stable packages are available through VCC.' : '可通过 VCC 安装正式版 Unity 组件包。';
  };
  if (home) {
    apply(locale);
    document.getElementById('language').addEventListener('click', () => {
      apply(locale === 'en' ? 'zh-CN' : 'en'); save(locale);
      const url = new URL(location.href);
      if (url.searchParams.has('lang')) { url.searchParams.set('lang', locale === 'en' ? 'en-US' : locale); history.replaceState(null, '', url); }
    });
    const vpm = new URL('vpm.json', location.href).href;
    document.getElementById('vcc').href = 'vcc://vpm/addRepo?url=' + encodeURIComponent(vpm);
    document.getElementById('copy-vpm').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(vpm); document.getElementById('vpm-status').textContent = locale === 'en' ? 'VPM URL copied.' : 'VPM 地址已复制。'; }
      catch { document.getElementById('vpm-status').textContent = vpm; }
    });
  } else {
    // Explicit documentation routes keep their language, irrespective of stored preferences.
    // 明确文档语言路由不被已有偏好覆盖。
    document.querySelectorAll('[data-locale]').forEach(link => {
      const target = new URL(link.href, location.href);
      let headings = {};
      try { headings = JSON.parse(link.dataset.headingMap || '{}'); } catch { /* Older static pages have no map. */ }
      const updateTarget = () => {
        let heading;
        try { heading = decodeURIComponent(location.hash.slice(1)); } catch { heading = ''; }
        target.hash = Object.hasOwn(headings, heading) ? headings[heading] : heading === 'content' ? 'content' : '';
        link.href = target.href;
      };
      updateTarget();
      window.addEventListener('hashchange', updateTarget);
      link.addEventListener('click', () => save(link.dataset.locale));
    });
    const scrollAreas = [...document.querySelectorAll('.doc-scroll')];
    const updateScrollAreas = () => scrollAreas.forEach(area => { area.tabIndex = area.scrollWidth > area.clientWidth + 1 ? 0 : -1; });
    updateScrollAreas();
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(updateScrollAreas);
      scrollAreas.forEach(area => { observer.observe(area); if (area.firstElementChild) observer.observe(area.firstElementChild); });
    }
    window.addEventListener('resize', updateScrollAreas);
    document.fonts?.ready?.then(updateScrollAreas);
    if (matchMedia('(max-width: 760px)').matches) document.querySelector('.navigation')?.removeAttribute('open');
  }
})();
