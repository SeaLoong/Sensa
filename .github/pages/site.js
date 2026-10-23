/* Language choices follow the current browser tab. / 语言选择保存在当前浏览器标签页。 */
(() => {
  const normalize = value => {
    if (typeof value !== 'string') return null;
    const tag = value.trim().replaceAll('_', '-').toLowerCase();
    return /^en(?:-[a-z0-9]{1,8})*$/.test(tag) ? 'en' : /^zh(?:-[a-z0-9]{1,8})*$/.test(tag) ? 'zh-CN' : null;
  };
  const read = () => { try { return sessionStorage.getItem('sensa.locale'); } catch { return null; } };
  const save = locale => { try { sessionStorage.setItem('sensa.locale', locale === 'en' ? 'en-US' : locale); } catch { /* Private storage may be unavailable. / 隐私模式可能禁用存储。 */ } };
  const url = new URL(location.href);
  if (url.searchParams.has('lang')) {
    url.searchParams.delete('lang');
    history.replaceState(null, '', url);
  }
  const home = document.body.hasAttribute('data-home');
  let locale = normalize(read())
    || [...(navigator.languages || []), navigator.language].map(normalize).find(Boolean) || 'en';
  let updateScreenshots = () => {};
  const apply = next => {
    locale = next;
    document.documentElement.lang = next === 'en' ? 'en-US' : next;
    document.title = next === 'en' ? 'Sensa — Make your signals work together' : 'Sensa — 把数值变成联动';
    document.querySelectorAll('[data-en]').forEach(x => { x.hidden = next !== 'en'; });
    document.querySelectorAll('[data-zh]').forEach(x => { x.hidden = next !== 'zh-CN'; });
    document.querySelectorAll('[data-doc]').forEach(x => {
      const fragment = next === 'en' ? x.dataset.fragmentEn : x.dataset.fragmentZh;
      x.href = next + '/' + x.dataset.doc + '.html' + (fragment ? '#' + encodeURIComponent(fragment) : '');
    });
    document.querySelectorAll('[data-label-en]').forEach(x => { x.setAttribute('aria-label', next === 'en' ? x.dataset.labelEn : x.dataset.labelZh); });
    document.querySelectorAll('[data-diagram]').forEach(x => { x.href = 'parameter-geometry.html'; });
    document.getElementById('language').textContent = next === 'en' ? '简体中文' : 'English';
    const available = document.body.dataset.vpm === 'true';
    document.getElementById('vcc').hidden = !available;
    document.getElementById('copy-vpm').hidden = !available;
    if (available) document.getElementById('vpm-status').textContent = next === 'en' ? 'Stable packages are available through VCC.' : '可通过 VCC 安装正式版 Unity 组件包。';
    updateScreenshots();
  };
  if (home) {
    const galleryData = document.getElementById('screenshot-data');
    if (galleryData) {
      const scenes = JSON.parse(galleryData.textContent);
      let scene = scenes[0], viewport = matchMedia('(max-width: 760px)').matches ? 'mobile' : 'desktop';
      const image = document.getElementById('screenshot-image');
      const sceneButtons = [...document.querySelectorAll('[data-screenshot-scene]')];
      const viewButtons = [...document.querySelectorAll('[data-screenshot-view]')];
      updateScreenshots = () => {
        const picture = scene.images[viewport][locale];
        const title = locale === 'en' ? scene.en : scene.zh;
        const screen = locale === 'en' ? (viewport === 'desktop' ? 'Desktop' : 'Narrow') : (viewport === 'desktop' ? '桌面' : '窄屏');
        const language = picture.language === 'en-US' ? 'English' : '简体中文';
        image.src = picture.url; image.width = picture.width; image.height = picture.height;
        image.alt = `${title} · ${screen} · ${language}`;
        document.getElementById('screenshot-caption').textContent = image.alt;
        document.getElementById('screenshot-original').href = picture.url;
        sceneButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.screenshotScene === scene.id)));
        viewButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.screenshotView === viewport)));
      };
      sceneButtons.forEach(button => button.addEventListener('click', () => {
        scene = scenes.find(item => item.id === button.dataset.screenshotScene); updateScreenshots();
      }));
      viewButtons.forEach(button => button.addEventListener('click', () => {
        viewport = button.dataset.screenshotView; updateScreenshots();
      }));
    }
    apply(locale);
    document.getElementById('language').addEventListener('click', () => {
      apply(locale === 'en' ? 'zh-CN' : 'en'); save(locale);
    });
    const vpm = new URL('vpm.json', location.href).href;
    document.getElementById('vcc').href = 'vcc://vpm/addRepo?url=' + encodeURIComponent(vpm);
    document.getElementById('copy-vpm').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(vpm); document.getElementById('vpm-status').textContent = locale === 'en' ? 'VPM URL copied.' : 'VPM 地址已复制。'; }
      catch { document.getElementById('vpm-status').textContent = vpm; }
    });
  } else {
    // The language of this guide becomes the tab's language for the next page.
    // 当前文档的语言沿用于本标签页接下来打开的页面。
    locale = normalize(document.documentElement.lang) || locale;
    save(locale);
    document.querySelectorAll('[data-guide-filter]').forEach(input => {
      const navigation = input.closest('.navigation');
      const links = [...navigation.querySelectorAll('[data-guide-link]')];
      input.addEventListener('input', () => {
        const query = input.value.trim().toLocaleLowerCase();
        links.forEach(link => { link.hidden = !link.textContent.toLocaleLowerCase().includes(query); });
        navigation.querySelectorAll('.nav-group').forEach(group => {
          group.hidden = ![...group.querySelectorAll('[data-guide-link]')].some(link => !link.hidden);
        });
        navigation.querySelector('.guide-empty').hidden = links.some(link => !link.hidden);
      });
    });
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
    const narrowNavigation = matchMedia('(max-width: 760px)');
    const updateNavigation = () => document.querySelectorAll('.navigation').forEach(navigation => {
      if (narrowNavigation.matches) navigation.removeAttribute('open');
      else navigation.setAttribute('open', '');
    });
    updateNavigation();
    narrowNavigation.addEventListener?.('change', updateNavigation);
  }
})();
