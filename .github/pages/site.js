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
  const downloadPage = document.body.hasAttribute('data-download-page');
  let locale = normalize(read())
    || [...(navigator.languages || []), navigator.language].map(normalize).find(Boolean) || 'en';
  let updateScreenshots = () => {};
  let updateDownloads = () => {};
  const apply = next => {
    locale = next;
    document.documentElement.lang = next === 'en' ? 'en-US' : next;
    document.title = downloadPage ? (next === 'en' ? 'Download Sensa' : '下载 Sensa')
      : next === 'en' ? 'Sensa — Make your signals work together' : 'Sensa — 把数值变成联动';
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
    if (document.getElementById('vcc')) document.getElementById('vcc').hidden = !available;
    if (document.getElementById('copy-vpm')) document.getElementById('copy-vpm').hidden = !available;
    if (available) document.getElementById('vpm-status').textContent = next === 'en' ? 'Stable packages are available through VCC.' : '可通过 VCC 安装正式版 Unity 组件包。';
    updateScreenshots();
    updateDownloads();
  };
  const downloadLinks = [...document.querySelectorAll('[data-download]')];
  const downloadRoutes = new Map(downloadLinks.map(link => [link, link.href]));
  if (typeof SensaDownloads !== 'undefined' && (downloadPage || downloadLinks.length)) {
    const cacheKey = 'sensa.download.release.v1';
    const requested = new URL(location.href).searchParams.get('asset') || 'release';
    const status = document.getElementById('download-status');
    const retry = document.getElementById('download-retry');
    let cached = null;
    try { cached = SensaDownloads.selectRelease(JSON.parse(sessionStorage.getItem(cacheKey) || '[]')); } catch { /* Storage is optional. */ }
    const show = (state, selected, stale = false) => {
      for (const link of downloadLinks) {
        if (state === 'loading') continue;
        const target = SensaDownloads.downloadTarget(selected, link.dataset.download);
        if ((!status && stale) || (link.dataset.download === 'release' && !selected)) {
          // Keep a visible recovery route where this page cannot explain a stale result.
          link.href = downloadRoutes.get(link);
          link.removeAttribute('aria-disabled');
          link.removeAttribute('role');
          link.removeAttribute('title');
        } else if (target.url) {
          link.href = target.url;
          link.removeAttribute('aria-disabled');
          link.removeAttribute('role');
          link.removeAttribute('title');
        } else if (state !== 'loading') {
          link.removeAttribute('href');
          link.setAttribute('aria-disabled', 'true');
          link.setAttribute('role', 'link');
          link.title = locale === 'en' ? 'This download is currently unavailable.' : '这个下载暂不可用。';
        }
      }
      if (!status) return;
      const messages = {
        loading: ['Finding the latest download…', '正在查找最新下载…'],
        empty: ['No published download is available yet.', '暂时没有已发布的下载。'],
        missing: stale ? ['This file was not available in the last checked version, ' + selected?.tag + '. Try again to check the latest release.', '上次查询的版本 ' + selected?.tag + ' 未提供这个文件。请重试以查询最新版本。']
          : ['This file is not available in the latest release. Choose another format from that release or try again later.', '最新版本暂未提供这个文件。可在该版本中选择其他格式，或稍后重试。'],
        invalid: ['This download address is not valid.', '这个下载地址无效。'],
        error: ['Downloads could not be checked. Try again or browse release history.', '暂时无法查询下载。请重试，或查看历史版本。'],
        available: stale ? ['The latest release could not be checked. The last available version is ' + selected?.tag + '.', '暂时无法确认最新版本。上次可用版本是 ' + selected?.tag + '。'] : ['Opening your download…', '正在打开下载…'],
      };
      const target = SensaDownloads.downloadTarget(selected, requested);
      const effective = target.state === 'invalid' ? 'invalid' : state === 'loading' ? 'loading' : state === 'error' ? 'error' : target.state;
      const pair = messages[effective] || messages.loading;
      status.textContent = !downloadPage && effective === 'available'
        ? (locale === 'en' ? (stale ? 'Last available release: ' : 'Latest release: ') : (stale ? '上次可用版本：' : '最新版本：')) + selected.tag
        : pair[locale === 'en' ? 0 : 1];
      updateDownloads = () => show(state, selected, stale);
      if (retry) retry.hidden = effective === 'loading' || (effective === 'available' && !stale) || effective === 'invalid';
      const cachedLink = document.getElementById('download-cached');
      if (cachedLink) {
        cachedLink.hidden = !(stale && target.url);
        if (stale && target.url) {
          cachedLink.href = target.url;
          cachedLink.textContent = (locale === 'en' ? 'Open ' : '打开 ') + selected.tag;
        }
      }
      const releaseLink = document.getElementById('download-release');
      if (releaseLink) {
        releaseLink.hidden = !selected;
        if (selected) releaseLink.href = selected.url;
      }
      if (downloadPage && target.url && state !== 'loading' && !stale) location.replace(target.url);
    };
    const load = async () => {
      show('loading', cached);
      if (downloadPage && SensaDownloads.downloadTarget(null, requested).state === 'invalid') return show('invalid', null);
      if (typeof fetch !== 'function' || typeof AbortController !== 'function') return show(cached ? 'available' : 'error', cached, true);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch('https://api.github.com/repos/SeaLoong/Sensa/releases?per_page=100', {
          method: 'GET', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
          headers: { Accept: 'application/vnd.github+json' }, signal: controller.signal,
        });
        if (!response.ok) throw new Error('Download query failed');
        const releases = await response.json();
        if (!Array.isArray(releases)) throw new Error('Invalid download response');
        if (controller.signal.aborted) throw new Error('Download query timed out');
        const selected = SensaDownloads.selectRelease(releases);
        try { sessionStorage.setItem(cacheKey, JSON.stringify(selected ? [selected.cached] : [])); } catch { /* Storage is optional. */ }
        cached = selected;
        show(selected ? 'available' : 'empty', selected);
      } catch { show(cached ? 'available' : 'error', cached, true); }
      finally { clearTimeout(timeout); }
    };
    retry?.addEventListener('click', load);
    load();
  }
  if (downloadPage) {
    apply(locale);
    document.getElementById('language').addEventListener('click', () => {
      apply(locale === 'en' ? 'zh-CN' : 'en'); save(locale);
    });
    return;
  }
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
