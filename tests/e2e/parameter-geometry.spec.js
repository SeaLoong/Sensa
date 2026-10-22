import { test, expect } from '@playwright/test';
import { test as hostedTest, mode, oscWorkspace, text } from './fixtures.js';

// Only offline guide cases share software WebGL; app fixtures keep their own browser pool.
// 仅离线图解用例共用软件WebGL，真实应用fixture仍保持独立浏览器配置。
const threeTest = test.extend({
  launchOptions: [{ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }, { scope: 'worker', option: true }],
});

const guideFile = new URL('../../docs/parameter-geometry.html', import.meta.url);
const goldenScenes = ['socket-modern', 'socket-legacy', 'plug-touch', 'contact-sdk', 'sensa-sps', 'shader'];
const scenarioIds = ['socket-modern', 'socket-legacy', 'plug-depth', 'socket-touch', 'plug-touch',
  'socket-frot', 'plug-frot', 'zone', 'contact-sdk', 'sensa-sps', 'shader'];

const anchorColors = ['#0052d9', '#07806a', '#8b46c6', '#c63e58'];
async function addressPattern(page, scenario) {
  const prefix = scenario === 'contact-sdk' ? 'Sensa/Contact' : scenario === 'sensa-sps' ? 'Sensa/SPS' : scenario === 'shader' ? 'Sensa/Shader'
    : scenario === 'zone' ? 'VFH/Zone/Touch' : scenario.startsWith('plug-') ? 'OGB/Pen' : 'OGB/Orf';
  await expect(page.locator('#path-prefix')).toHaveText(prefix + '/*');
  await expect(page.locator('#path-assembly')).toContainText('*');
  const rows = page.locator('#values tr');
  for (let index = 0; index < await rows.count(); index++) {
    const row = rows.nth(index), name = await row.getAttribute('data-name');
    const button = row.getByRole('button', { name, exact: true });
    await expect(button).toHaveAttribute('title', '/avatar/parameters/' + prefix + '/'
      + (scenario === 'shader' ? '42' : 'Example') + '/' + name);
    await expect(button).toHaveAttribute('aria-describedby', /(?:^|\s)path-assembly(?:\s|$)/);
  }
}

const parameter = (page, name) => page.locator('#values tr').filter({
  has: page.getByRole('button', { name, exact: true }),
});
async function chooseScene(page, scenario, projection = 'xz') {
  await page.locator('#scene').selectOption(scenario);
  await expect(page.locator('#scene')).toHaveValue(scenario);
  await page.locator('#reset').click();
  await page.locator('#signal-simulation').evaluate(node => { node.open = false; });
  // Existing 2D contracts stay explicit when spatial scenes default to 3D.
  // 空间场景默认三维后，既有二维契约仍明确选择自身投影。
  await page.locator('#projection').selectOption(projection);
}
async function setRange(page, name, value) {
  const control = page.locator('#control-' + name);
  if (['sample', 'ageMs', 'frame', 'valid'].includes(name)) await page.locator('#signal-simulation').evaluate(node => { node.open = true; });
  await expect(control).toBeVisible();
  // Set a precise geometry fixture through the native input event.
  // 通过原生输入事件设置精确几何；真实键盘交互另有独立断言。
  await control.evaluate((element, next) => {
    element.value = String(next);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await expect(control).toHaveValue(String(value));
}
async function cellNumber(page, name, column = 'raw') {
  const cell = parameter(page, name).locator('[data-column="' + column + '"]');
  await expect(cell).toBeVisible();
  const attribute = await cell.getAttribute('data-value');
  expect(attribute, 'Numeric attribute exists / 数值属性存在').not.toBeNull();
  expect(attribute, 'Numeric readout is present / 存在数值读数').not.toBe('');
  const value = Number(attribute);
  expect(Number.isFinite(value)).toBe(true);
  const visible = Number((await cell.textContent()).trim());
  expect(Number.isFinite(visible), 'Visible number is finite / 可见读数为有限数').toBe(true);
  expect(Math.abs(value - visible)).toBeLessThanOrEqual(.0006);
  return value;
}
async function nearCell(page, name, expected, column = 'raw') {
  expect(Math.abs(await cellNumber(page, name, column) - expected)).toBeLessThanOrEqual(1e-8);
}
async function noCoordinate(page, name) {
  const cell = parameter(page, name).locator('[data-column="effective"]');
  await expect(cell).toHaveAttribute('data-value', '');
  await expect(cell).toHaveText('—');
}
async function finiteDrawing(page) {
  const invalid = await page.locator('#diagram, #bit-grid').evaluateAll(roots => roots.flatMap(root =>
    [...root.querySelectorAll('*')].flatMap(element => [...element.attributes]
      .filter(attribute => /^(?:d|cx|cy|r|rx|ry|x|y|x1|x2|y1|y2|width|height|transform|points)$/.test(attribute.name)
        && /NaN|Infinity|undefined/.test(attribute.value))
      .map(attribute => element.tagName + ':' + attribute.name + '=' + attribute.value))));
  expect(invalid, 'SVG geometry stays finite / SVG 几何保持有限').toEqual([]);
  await expect(page.locator('#values')).not.toContainText(/NaN|Infinity|undefined/);
  expect(await page.locator('#diagram *').count()).toBeLessThan(2000);
  const screenFonts = () => page.locator('#diagram').evaluate(diagram => {
    const viewport = diagram.getBoundingClientRect();
    return [...diagram.querySelectorAll('text')].flatMap(element => {
      const style = getComputedStyle(element), box = element.getBoundingClientRect(), matrix = element.getScreenCTM();
      if (!element.textContent.trim() || style.display === 'none' || style.visibility !== 'visible'
        || Number(style.opacity) === 0 || box.width <= 0 || box.height <= 0
        || box.right <= viewport.left || box.left >= viewport.right || box.bottom <= viewport.top || box.top >= viewport.bottom) return [];
      const axis = element.classList.contains('grid-axis-label');
      const fontSize = Number.parseFloat(style.fontSize), scale = matrix ? Math.hypot(matrix.c, matrix.d) : NaN;
      return [{ text: element.textContent, kind: axis ? 'axis' : 'label',
        fontSize, scale, cssFontSize: fontSize * scale, height: box.height, minimum: axis ? 8.9 : 10.9 }];
    });
  });
  // Font-size inside the viewBox is not its readable size on a narrow screen.
  // viewBox 内字号不等于窄屏上实际可读字号；只读真实样式和 DOM 屏幕变换。
  await expect.poll(async () => {
    const samples = await screenFonts();
    const failures = samples.filter(sample => !Number.isFinite(sample.cssFontSize)
      || sample.cssFontSize < sample.minimum || !Number.isFinite(sample.height) || sample.height <= 0);
    if (samples.filter(sample => sample.kind === 'axis').length < 2) failures.push({ missing: 'two visible SVG axis labels' });
    return failures;
  }, { message: 'Visible SVG labels remain about 11 CSS px, axes 9 px / 可见SVG普通标签约11CSS像素、轴标签9像素' }).toEqual([]);
  return screenFonts();
}
async function documentFits(page) {
  const evidence = await page.evaluate(() => {
    const controls = [...document.querySelectorAll('[data-control]')].flatMap(holder => {
      const input = holder.querySelector('input[type="range"]');
      if (!input) return [];
      const box = holder.getBoundingClientRect(), range = input.getBoundingClientRect();
      const style = getComputedStyle(input);
      if (box.width <= 0 || box.height <= 0 || range.width <= 0 || range.height <= 0
        || style.display === 'none' || style.visibility !== 'visible') return [];
      return [{ name: holder.dataset.control, top: box.top, bottom: range.bottom }];
    }).sort((a, b) => a.top - b.top);
    const rows = [];
    for (const control of controls) {
      let row = rows.find(candidate => Math.abs(candidate.top - control.top) <= 1);
      if (!row) { row = { top: control.top, controls: [] }; rows.push(row); }
      row.controls.push(control);
    }
    for (const row of rows) {
      const bottoms = row.controls.map(control => control.bottom);
      row.bottomSpread = Math.max(...bottoms) - Math.min(...bottoms);
    }
    const svg = document.querySelector('#diagram').getBoundingClientRect();
    return { viewport: document.documentElement.clientWidth,
      document: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      svg: { left: svg.left, right: svg.right }, rows };
  });
  expect(evidence.document, 'No document horizontal overflow / 文档无横向溢出').toBeLessThanOrEqual(evidence.viewport + 1);
  expect(evidence.svg.left).toBeGreaterThanOrEqual(-1);
  expect(evidence.svg.right).toBeLessThanOrEqual(evidence.viewport + 1);
  // Group by actual row tops, independent of the chosen column count or CSS declarations.
  // 按实际顶沿识别同排，不读取 CSS 声明，也不固定列数或列宽。
  for (const row of evidence.rows.filter(row => row.controls.length >= 2)) {
    expect(row.bottomSpread, 'Same-row range bottoms align / 同排滑杆底沿对齐: '
      + row.controls.map(control => control.name).join(', ')).toBeLessThanOrEqual(1);
  }
  return evidence;
}


threeTest('the offline guide negotiates language and persists a manual choice without resetting the diagram / 离线图解协商语言并保存选择且不重置几何',
  { tag: ['@i18n', '@config'] }, async ({ page, browser }, info) => {
    const cases = [
      { name: 'URL Chinese variant', requested: 'ZH_hant_tw', saved: 'en-US', languages: ['en-US'], expected: 'zh-CN' },
      { name: 'URL English variant', requested: 'EN_gb', saved: 'zh-CN', languages: ['zh-CN'], expected: 'en-US', switchAndReload: true },
      { name: 'saved Chinese variant', saved: 'zh_HK', languages: ['en-US'], expected: 'zh-CN' },
      { name: 'unsupported URL preserves choice', requested: 'fr-FR', saved: 'zh-CN', languages: ['en-US'], expected: 'zh-CN' },
      { name: 'ordered later Chinese', languages: ['fr-FR', 'zh_Hant_TW', 'en-US'], expected: 'zh-CN' },
      { name: 'ordered English first', languages: ['fr-FR', 'EN_gb', 'zh-CN'], expected: 'en-US' },
      { name: 'empty list uses language', languages: [], language: 'zh_TW', expected: 'zh-CN' },
      { name: 'unsupported environment', languages: ['fr-FR', 'de-DE'], language: 'fr-FR', expected: 'en-US' },
      { name: 'denied storage', denied: true, languages: ['fr-FR', 'zh-HK'], expected: 'zh-CN' },
    ];
    for (const scenario of cases) await threeTest.step(scenario.name, async () => {
      // File-page preferences must not leak from a previous scenario. Keep reload/navigation in this context.
      // 隔离上一场景的文件页偏好；同场景的刷新与导航仍使用此上下文。
      const context = await browser.newContext({ viewport: page.viewportSize(), locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
        colorScheme: 'light', reducedMotion: 'reduce' });
      const child = await context.newPage(), errors = [], network = [], snapshots = [];
      const capture = async phase => snapshots.push({ phase, ...await child.evaluate(() => ({
        url: location.href, locale: document.documentElement.lang, selected: document.getElementById('locale')?.value,
        languages: [...navigator.languages], language: navigator.language,
        saved: (() => { try { return localStorage.getItem('sensa.locale'); } catch { return 'storage-denied'; } })(),
      })) });
      child.on('pageerror', error => errors.push(error.message));
      child.on('request', request => { if (/^(?:https?|wss?):/.test(request.url())) network.push(request.url()); });
      await child.addInitScript(({ languages, language, saved, denied }) => {
        Object.defineProperty(navigator, 'languages', { configurable: true, value: languages });
        Object.defineProperty(navigator, 'language', { configurable: true, value: language || 'en-US' });
        if (denied) Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Storage blocked', 'SecurityError'); } });
        else if (window.name !== 'locale-fixture-ready') {
          if (saved === undefined) localStorage.removeItem('sensa.locale'); else localStorage.setItem('sensa.locale', saved);
          window.name = 'locale-fixture-ready';
        }
      }, scenario);
      try {
        const url = new URL(guideFile); if (scenario.requested) url.searchParams.set('lang', scenario.requested);
        await child.goto(url.href);
        await expect(child.locator('html')).toHaveAttribute('lang', scenario.expected);
        await expect(child.locator('#locale')).toHaveValue(scenario.expected);
        await expect(child.locator('h1')).toHaveText(scenario.expected === 'en-US'
          ? 'Move the target to see where detection works' : '移动目标，了解何时能够检测');
        await capture('initial');
        if (scenario.switchAndReload) {
          await chooseScene(child, 'socket-modern', 'iso'); await setRange(child, 'z', .41);
          await parameter(child, 'PenOthersNewTip').getByRole('button', { name: 'PenOthersNewTip', exact: true }).click();
          await child.locator('#show-dimensions').uncheck();
          await child.locator('#locale').selectOption('zh-CN');
          await expect(child.locator('html')).toHaveAttribute('lang', 'zh-CN');
          await expect(child.locator('#scene')).toHaveValue('socket-modern'); await expect(child.locator('#projection')).toHaveValue('iso');
          await expect(child.locator('#control-z')).toHaveValue('0.41'); await expect(child.locator('#show-dimensions')).not.toBeChecked();
          await expect(parameter(child, 'PenOthersNewTip').getByRole('button', { name: 'PenOthersNewTip', exact: true })).toHaveAttribute('aria-pressed', 'true');
          await nearCell(child, 'PenOthersNewRoot', .6);
          expect(new URL(child.url()).searchParams.get('lang')).toBe('zh-CN');
          expect(await child.evaluate(() => localStorage.getItem('sensa.locale'))).toBe('zh-CN');
          await capture('switched');
          await child.reload(); await capture('reloaded');
          await expect(child.locator('html')).toHaveAttribute('lang', 'zh-CN');
          await child.goto(guideFile.href); await capture('without-url-override');
          await expect(child.locator('html')).toHaveAttribute('lang', 'zh-CN');
        }
        if (scenario.denied) {
          await child.locator('#locale').selectOption('en-US');
          await expect(child.locator('h1')).toHaveText('Move the target to see where detection works');
        }
        expect(errors).toEqual([]); expect(network).toEqual([]);
      } finally {
        try {
          await info.attach('offline-locale-' + scenario.name.replaceAll(' ', '-') + '.json', {
            body: JSON.stringify({ scenario: scenario.name, viewport: page.viewportSize(), snapshots, errors, network }, null, 2),
            contentType: 'application/json',
          });
        } finally { await context.close(); }
      }
    });
  });

threeTest('offline parameter geometry renders, responds and preserves bilingual state / 离线参数几何图解、交互与双语状态',
  { tag: ['@visual', '@i18n', '@config'] }, async ({ page }, info) => {
    const remoteRequests = [], sockets = [], errors = [];
    page.on('request', request => { if (/^(?:https?|wss?):/.test(request.url())) remoteRequests.push(request.url()); });
    page.on('websocket', socket => sockets.push(socket.url()));
    page.on('pageerror', error => errors.push(error.message));
    const fileUrl = new URL(guideFile);
    fileUrl.searchParams.set('lang', 'zh-CN');
    await page.goto(fileUrl.href);
    await expect(page.locator('#scene')).toBeVisible();
    await expect(page.locator('#scene option')).toHaveCount(11);
    expect(await page.locator('#scene option').evaluateAll(options => options.map(option => option.value))).toEqual(scenarioIds);
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');

    // Independent distances: R=1, root r=.01, length-sphere r=.2, centre distance=.5.
    // 独立预期：接收球1、根球.01、长度球.2、中心距.5。
    await chooseScene(page, 'socket-modern');
    await expect(page.locator('#scene-title')).toHaveText('SPS2 · PenOthersNewRoot / PenOthersNewTip');
    expect(await page.locator('#values tr').evaluateAll(rows => rows.map(row => row.dataset.name)))
      .toEqual(['PenOthersNewRoot', 'PenOthersNewTip']);
    await expect(page.locator('#parameter-meaning')).toContainText('Socket');
    await setRange(page, 'z', .5);
    await nearCell(page, 'PenOthersNewRoot', .51);
    await nearCell(page, 'PenOthersNewTip', .7);
    const circleRadius = async id => Number(await page.locator('[data-shape-id="' + id + '"] circle.shape').first().getAttribute('r'));
    const rootRadius = await circleRadius('sender-root');
    expect(rootRadius).toBeGreaterThan(0);
    expect(await circleRadius('receiver-root') / rootRadius).toBeCloseTo(100, 8);
    expect(await circleRadius('sender-length') / rootRadius).toBeCloseTo(20, 8);
    expect(await circleRadius('receiver-length')).toBeCloseTo(await circleRadius('receiver-root'), 8);

    // Selecting a parameter and changing language must retain geometry and highlight.
    // 参数选择和语言切换保留几何与高亮，不重置为默认值。
    await parameter(page, 'PenOthersNewTip').getByRole('button', { name: 'PenOthersNewTip', exact: true }).click();
    await expect(page.locator('#parameter-meaning')).toContainText('长度球');
    await page.locator('#projection').selectOption('iso');
    await page.locator('#show-dimensions').uncheck();
    await page.locator('#locale').selectOption('en-US');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
    await expect(page.locator('#scene-title')).toHaveText('SPS2 · PenOthersNewRoot / PenOthersNewTip');
    await expect(page.locator('#parameter-meaning')).toContainText('length sphere');
    await expect(page.locator('#control-z')).toHaveValue('0.5');
    await expect(page.locator('#scene')).toHaveValue('socket-modern');
    await expect(page.locator('#projection')).toHaveValue('iso');
    await expect(page.locator('#show-dimensions')).not.toBeChecked();
    await expect(parameter(page, 'PenOthersNewTip').getByRole('button', { name: 'PenOthersNewTip', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-shape-id="sender-length"] circle.shape')).toHaveClass(/active-shape/);
    await nearCell(page, 'PenOthersNewRoot', .51);
    await expect(page.locator('#reference-link')).toHaveAttribute('href', 'osc-parameters.en.md');
    await page.locator('#locale').selectOption('zh-CN');
    await expect(page.locator('#control-z')).toHaveValue('0.5');
    await expect(page.locator('#reference-link')).toHaveAttribute('href', 'osc-parameters.md');

    // Independently check orthographic geometry, including Y, before testing its inverse.
    // 先以已知正交矩阵独立验证含 Y 的投影，再验证真实拖动的逆变换。
    await setRange(page, 'x', .1); await setRange(page, 'y', .4);
    const isoDistance = Math.hypot(.1, .4, .5);
    await nearCell(page, 'PenOthersNewRoot', 1 - (isoDistance - .01));
    await nearCell(page, 'PenOthersNewTip', 1 - (isoDistance - .2));
    const isoMoving = page.locator('#moving-root');
    await isoMoving.scrollIntoViewIfNeeded();
    const isoGeometry = await page.locator('#diagram').evaluate(diagram => {
      const receiver = diagram.querySelector('[data-shape-id="receiver-root"] circle.shape');
      const sender = diagram.querySelector('[data-shape-id="sender-root"] circle.shape');
      const movingCircle = diagram.querySelector('#moving-root circle');
      const matrix = diagram.getScreenCTM();
      const circle = element => ({ cx: Number(element.getAttribute('cx')),
        cy: Number(element.getAttribute('cy')), r: Number(element.getAttribute('r')) });
      return { receiver: circle(receiver), sender: circle(sender), marker: circle(movingCircle),
        matrix: { a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d, e: matrix.e, f: matrix.f } };
    });
    const isoScale = isoGeometry.receiver.r; // The known receiver radius is exactly 1.
    expect(isoScale).toBeGreaterThan(0);
    expect(isoGeometry.sender.r / isoScale).toBeCloseTo(.01, 8);
    const isoExpected = {
      x: isoGeometry.receiver.cx + isoScale * (.5 - .1) / Math.sqrt(2),
      y: isoGeometry.receiver.cy + isoScale * ((.1 + .5) / Math.sqrt(6) - .4 * Math.sqrt(2 / 3)),
    };
    expect(isoGeometry.sender.cx).toBeCloseTo(isoExpected.x, 6);
    expect(isoGeometry.sender.cy).toBeCloseTo(isoExpected.y, 6);
    expect(isoGeometry.marker.cx).toBeCloseTo(isoExpected.x, 6);
    expect(isoGeometry.marker.cy).toBeCloseTo(isoExpected.y, 6);
    const matrix = isoGeometry.matrix;
    const screenExpected = {
      x: matrix.a * isoExpected.x + matrix.c * isoExpected.y + matrix.e,
      y: matrix.b * isoExpected.x + matrix.d * isoExpected.y + matrix.f,
    };
    const isoMarkerBox = await isoMoving.locator('circle').first().boundingBox();
    expect(isoMarkerBox).not.toBeNull();
    const isoStart = { x: isoMarkerBox.x + isoMarkerBox.width / 2, y: isoMarkerBox.y + isoMarkerBox.height / 2 };
    expect(Math.abs(isoStart.x - screenExpected.x)).toBeLessThan(.1);
    expect(Math.abs(isoStart.y - screenExpected.y)).toBeLessThan(.1);
    await expect(page.locator('#control-x')).toHaveAttribute('step', '0.01');
    await expect(page.locator('#control-z')).toHaveAttribute('step', '0.01');
    const isoWorldAt = screen => {
      const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
      expect(Math.abs(determinant)).toBeGreaterThan(.000001);
      const svgX = (matrix.d * (screen.x - matrix.e) - matrix.c * (screen.y - matrix.f)) / determinant;
      const svgY = (-matrix.b * (screen.x - matrix.e) + matrix.a * (screen.y - matrix.f)) / determinant;
      const u = (svgX - isoGeometry.receiver.cx) / isoScale;
      const v = (svgY - isoGeometry.receiver.cy) / isoScale + .4 * Math.sqrt(2 / 3);
      const snap = (value, min, max) => Math.max(min, Math.min(max, Math.round(value / .01) * .01));
      return { x: snap((Math.sqrt(6) * v - Math.sqrt(2) * u) / 2, -.6, .6), y: .4,
        z: snap((Math.sqrt(6) * v + Math.sqrt(2) * u) / 2, -.4, 1.2) };
    };
    const isoTargets = [{ x: Math.round(isoStart.x) + 10, y: Math.round(isoStart.y) - 6 },
      { x: Math.round(isoStart.x) + 20, y: Math.round(isoStart.y) - 10 }];
    const isoDragEvidence = [];
    await page.mouse.move(isoStart.x, isoStart.y); await page.mouse.down();
    for (const target of isoTargets) {
      const expected = isoWorldAt(target);
      await page.mouse.move(target.x, target.y, { steps: 4 });
      await expect.poll(async () => {
        const actual = await isoMoving.evaluate(element => ({
          x: Number(element.dataset.x), y: Number(element.dataset.y), z: Number(element.dataset.z),
        }));
        return Math.max(Math.abs(actual.x - expected.x), Math.abs(actual.y - expected.y), Math.abs(actual.z - expected.z));
      }, { message: 'Isometric drag follows CTM, fixed Y and .01 snap / 立体拖动符合CTM、固定Y与.01步长' }).toBeLessThan(1e-8);
      const actual = await isoMoving.evaluate(element => ({
        x: Number(element.dataset.x), y: Number(element.dataset.y), z: Number(element.dataset.z),
      }));
      isoDragEvidence.push({ target, expected, actual });
      await nearCell(page, 'PenOthersNewRoot', 1 - (Math.hypot(actual.x, actual.y, actual.z) - .01));
    }
    await page.mouse.up();
    await info.attach('parameter-geometry-isometric-pointer.json', {
      body: JSON.stringify({ geometry: isoGeometry, expectedMarker: isoExpected, screenExpected, drag: isoDragEvidence }, null, 2),
      contentType: 'application/json',
    });
    // Restore defaults before the XZ checks and representative captures.
    // 后续 XZ 断言与代表截图前恢复默认几何。
    await chooseScene(page, 'socket-modern');
    await page.locator('#projection').selectOption('xz');
    await page.locator('#show-dimensions').check();

    await page.locator('#show-receivers').uncheck();
    await expect(page.locator('[data-shape-id="receiver-root"]')).toBeHidden();
    await page.locator('#show-receivers').check();
    await expect(page.locator('[data-shape-id="receiver-root"]')).toBeVisible();

    const slider = page.locator('#control-z');
    await slider.focus(); await slider.press('Home');
    await expect(slider).toHaveValue('-0.4');
    await slider.press('ArrowRight');
    await expect(slider).toHaveValue('-0.39');
    const moving = page.locator('#moving-root');
    await moving.focus(); await expect(moving).toBeFocused();
    const beforeZ = Number(await moving.getAttribute('data-z'));
    const beforeY = Number(await moving.getAttribute('data-y'));
    await moving.press('ArrowRight'); await expect(moving).toBeFocused();
    await moving.press('ArrowRight'); await expect(moving).toBeFocused();
    expect(Number(await moving.getAttribute('data-z')) - beforeZ).toBeCloseTo(.02, 8);
    expect(Number(await moving.getAttribute('data-y'))).toBe(beforeY);

    // Real pointer events must survive redraw during one drag, with no Y change.
    // 连续真实指针拖动须跨重绘继续生效，且不能改变 Y。
    await chooseScene(page, 'socket-modern');
    const pointState = () => moving.evaluate(element => ({
      x: Number(element.dataset.x), y: Number(element.dataset.y), z: Number(element.dataset.z),
    }));
    const beforeDrag = await pointState();
    await moving.scrollIntoViewIfNeeded();
    const marker = await moving.locator('circle').first().boundingBox();
    expect(marker).not.toBeNull();
    const center = { x: marker.x + marker.width / 2, y: marker.y + marker.height / 2 };
    await page.mouse.move(center.x, center.y); await page.mouse.down();
    await page.mouse.move(center.x + 12, center.y + 6, { steps: 4 });
    await expect.poll(async () => {
      const current = await pointState(); return Math.hypot(current.x - beforeDrag.x, current.z - beforeDrag.z);
    }).toBeGreaterThan(.0001);
    const middleDrag = await pointState();
    await page.mouse.move(center.x + 24, center.y + 10, { steps: 4 });
    await expect.poll(async () => {
      const current = await pointState(); return Math.hypot(current.x - middleDrag.x, current.z - middleDrag.z);
    }).toBeGreaterThan(.0001);
    await page.mouse.up();
    const afterDrag = await pointState();
    expect(afterDrag.y).toBe(beforeDrag.y);
    const dragDistance = Math.hypot(afterDrag.x, afterDrag.y, afterDrag.z);
    await nearCell(page, 'PenOthersNewRoot', Math.max(0, Math.min(1, 1 - Math.max(0, dragDistance - .01))));
    await info.attach('parameter-geometry-pointer.json', {
      body: JSON.stringify({ before: beforeDrag, middle: middleDrag, after: afterDrag }, null, 2),
      contentType: 'application/json',
    });

    await chooseScene(page, 'socket-legacy');
    await expect(page.locator('#scene-title')).toHaveText('SPS1 · PenOthers / PenOthersClose');
    expect(await page.locator('#values tr').evaluateAll(rows => rows.map(row => row.dataset.name)))
      .toEqual(['PenOthers', 'PenOthersClose']);
    await expect(page.locator('#parameter-meaning')).toContainText('深度');
    await parameter(page, 'PenOthersClose').getByRole('button', { name: 'PenOthersClose', exact: true }).click();
    await expect(page.locator('#parameter-meaning')).toContainText('接触');
    await parameter(page, 'PenOthers').getByRole('button', { name: 'PenOthers', exact: true }).click();
    await nearCell(page, 'PenOthers', 2 / 3);
    await nearCell(page, 'PenOthersClose', 1);
    await setRange(page, 'x', .28); await setRange(page, 'z', -.15);
    expect(await cellNumber(page, 'PenOthers')).toBeGreaterThan(0);
    await nearCell(page, 'PenOthersClose', 0);
    await nearCell(page, 'PenOthers', 0, 'effective');

    await chooseScene(page, 'plug-touch');
    await setRange(page, 'L', .4); await setRange(page, 'W', .02);
    await setRange(page, 'senderRadius', .01); await setRange(page, 'x', .15); await setRange(page, 'z', -.2);
    expect(await cellNumber(page, 'TouchOthers')).toBeGreaterThan(0);
    await nearCell(page, 'TouchOthersClose', 0);
    await nearCell(page, 'TouchOthers', 0, 'effective');
    const capsule = page.locator('[data-shape-id="receiver-close"]');
    await expect(capsule).toHaveAttribute('data-radius', '0.04');
    await expect(capsule).toHaveAttribute('data-height', '0.44');
    const capsuleBox = await capsule.locator('path.shape').evaluate(path => {
      const box = path.getBBox(); return { width: box.width, height: box.height };
    });
    // SVG getBBox uses browser float precision; distinguish full H=.44 from axis length .36.
    // SVG 包围盒存在浮点舍入；仍须区分总高 .44 与轴段 .36。
    expect(Math.max(capsuleBox.width, capsuleBox.height) / Math.min(capsuleBox.width, capsuleBox.height)).toBeCloseTo(5.5, 4);

    await chooseScene(page, 'sensa-sps');
    await expect(page.locator('#values tr')).toHaveCount(5);
    await expect(page.locator('#diagram [data-coverage-kind="contact-intersection"]')).toBeVisible();
    const anchors = [[-.35, .65, -.35], [.35, .65, .35], [.35, 1.35, -.35], [-.35, 1.35, .35]];
    for (let i = 0; i < anchors.length; i++) {
      const [x, y, z] = anchors[i];
      await nearCell(page, 'P' + i, 1 - (Math.hypot(.02 - x, 1 - y, .15 - z) - .001) / 2);
    }
    for (const [index, color] of anchorColors.entries()) {
      const rgb = 'rgb(' + color.slice(1).match(/../g).map(value => parseInt(value, 16)).join(', ') + ')';
      const row = parameter(page, 'P' + index), group = page.locator('#diagram [data-shape-id="receiver-P' + index + '"]');
      await expect(row).toHaveAttribute('data-anchor-index', String(index));
      await expect(row).toHaveAttribute('data-anchor-color', color);
      await expect(row.locator('.anchor-swatch')).toHaveCSS('background-color', rgb);
      await expect(group).toHaveAttribute('data-anchor-color', color);
      await expect(group.locator('circle.shape')).toHaveCSS('stroke', rgb);
      await expect(page.locator('#diagram .anchor-label[data-anchor-index="' + index + '"]')).toHaveCSS('fill', rgb);
    }
    await nearCell(page, 'Sample', 1 / 32);
    await expect(page.locator('#validity')).toHaveAttribute('data-valid', 'true');
    await setRange(page, 'sample', 0);
    await nearCell(page, 'Sample', 0);
    await expect(page.locator('#validity')).toHaveAttribute('data-valid', 'false');
    await noCoordinate(page, 'P0');
    await setRange(page, 'sample', 1);
    expect(await cellNumber(page, 'P0', 'effective')).toBeGreaterThan(0);
    await setRange(page, 'ageMs', 1050);
    await noCoordinate(page, 'P0');

    await chooseScene(page, 'shader');
    await expect(page.locator('#values tr')).toHaveCount(5);
    expect(await page.locator('#values tr').evaluateAll(rows => rows.map(row => row.dataset.name)))
      .toEqual(['Frame', 'Valid', 'X', 'Y', 'Z']);
    await expect(page.locator('#diagram [data-shape-id^="receiver-"]')).toHaveCount(0);
    await expect(page.locator('#diagram [data-shape-id^="sender-"]')).toHaveCount(0);
    await nearCell(page, 'Valid', 1);
    await expect(page.locator('#validity')).toHaveAttribute('data-valid', 'true');
    await expect(page.locator('#bit-grid rect')).toHaveCount(240);
    await expect(page.locator('#bit-grid rect[data-edge="true"]')).toHaveCount(112);
    await setRange(page, 'x', -2); await setRange(page, 'y', -1); await setRange(page, 'z', -2);
    await setRange(page, 'frame', 0);
    const bitCells = await page.locator('#bit-grid rect[data-edge="false"]').evaluateAll(cells => cells.map(cell => ({
      byte: Number(cell.dataset.byte), bit: Number(cell.dataset.bit), value: Number(cell.dataset.value),
      x: Number(cell.getAttribute('x')), y: Number(cell.getAttribute('y')), fill: cell.getAttribute('fill'),
    })));
    // Independent CRC-16 reference packet for the minimum XYZ corner, frame 0, ID 42.
    // 独立 CRC-16 参考包：XYZ 最小角、Frame0、ID42，不调用页面模型自证。
    const bytes = [83, 78, 1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 42, 0, 194, 133];
    for (const cell of bitCells) {
      const bit = bytes[cell.byte] >> cell.bit & 1;
      expect(cell.value).toBe(bit);
      expect(cell.fill).toBe(bit ? '#fff' : '#182131');
      expect(cell.x).toBe((cell.byte + 2) * 16);
      expect(cell.y).toBe((9 - cell.bit) * 16);
    }
    await setRange(page, 'frame', 65535);
    await nearCell(page, 'Frame', 65535);
    await page.locator('#control-valid').uncheck();
    await nearCell(page, 'Valid', 0);
    await expect(page.locator('#validity')).toHaveAttribute('data-valid', 'false');
    await noCoordinate(page, 'X');
    await page.locator('#control-valid').check();
    await setRange(page, 'ageMs', 550);
    await nearCell(page, 'Valid', 0);
    await noCoordinate(page, 'X');

    // Representative views are CI-only goldens; ordinary CI may only compare them.
    // 代表画面仅在 CI 生成；普通 CI 只能比较已审阅基线。
    for (const locale of ['zh-CN', 'en-US']) {
      await page.locator('#locale').selectOption(locale);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      for (const scenario of goldenScenes) {
        await chooseScene(page, scenario);
        if (scenario === 'sensa-sps') await expect(page.locator('#scene-title')).toHaveText(
          locale === 'zh-CN' ? 'SPS 四点定位' : 'SPS four-anchor tracking');
        await page.locator('#projection').selectOption('xz');
        await finiteDrawing(page); await documentFits(page);
        await page.evaluate(() => document.fonts.ready);
        await page.mouse.move(0, 0);
        await expect(page).toHaveScreenshot('parameter-geometry-' + scenario + '-' + locale + '.png', { fullPage: true });
      }
    }

    // Independent 3D-layout evidence; these attachments are not screenshot baselines.
    // 独立立体布局证据；仅作为报告附件，不新增截图基线。
    await page.locator('#locale').selectOption('en-US');
    for (const scenario of ['sensa-sps', 'shader']) {
      await chooseScene(page, scenario);
      await page.locator('#projection').selectOption('iso');
      const fonts = await finiteDrawing(page);
      const layout = await documentFits(page);
      await page.evaluate(() => document.fonts.ready);
      await page.mouse.move(0, 0);
      await info.attach('parameter-geometry-' + scenario + '-isometric-en-US.png', {
        body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
      });
      await info.attach('parameter-geometry-' + scenario + '-isometric-en-US.json', {
        body: JSON.stringify({ locale: 'en-US', scenario, projection: 'iso', fonts, layout }, null, 2),
        contentType: 'application/json',
      });
    }
    await page.locator('#projection').selectOption('xz');

    // 320 CSS px is reflow coverage, not a physical mobile or browser zoom claim.
    // 320 CSS像素仅验证重排，不代表真机或实际浏览器缩放。
    await page.setViewportSize({ width: 320, height: 844 });
    // Check resize itself before a scene change can cause another render.
    // 先检查 resize 自身，避免后续切场景重绘掩盖字号未更新。
    const resizedFonts = await finiteDrawing(page);
    await info.attach('parameter-geometry-resized-fonts.json', {
      body: JSON.stringify(resizedFonts, null, 2), contentType: 'application/json',
    });
    const reflow = [];
    for (const locale of ['zh-CN', 'en-US']) {
      await page.locator('#locale').selectOption(locale);
      for (const scenario of scenarioIds) {
        await chooseScene(page, scenario);
        const fonts = await finiteDrawing(page);
        reflow.push({ locale, scenario, ...await documentFits(page), fonts });
      }
    }
    await info.attach('parameter-geometry-reflow.json', { body: JSON.stringify(reflow, null, 2), contentType: 'application/json' });
    expect(remoteRequests, 'Offline guide makes no HTTP requests / 离线图解不发HTTP请求').toEqual([]);
    expect(sockets, 'Offline guide opens no WebSockets / 离线图解不连WebSocket').toEqual([]);
    expect(errors, 'Offline guide has no JavaScript errors / 离线图解无JavaScript错误').toEqual([]);
  });

// These probes read actual WebGL pixels and Three objects, not a model validity helper.
// 探针读取真实 WebGL 像素和 Three 对象，不借模型的“正确”标志自证。
const threeSnapshot = page => page.evaluate(() => window.SensaGeometryView.snapshot().three);
const threeLifecycle = page => page.evaluate(() => window.SensaParameterGeometry3D.snapshot().lifecycle);
async function uiGeometry(page) {
  return page.evaluate(() => ({
    xyz: ['x', 'y', 'z'].map(key => document.getElementById('control-' + key).value),
    values: [...document.querySelectorAll('#values tr')].map(row => ({
      name: row.dataset.name, raw: row.querySelector('[data-column=raw]').dataset.value,
      effective: row.querySelector('[data-column=effective]').dataset.value,
    })),
  }));
}
const cameraVector = camera => [...camera.position, ...camera.quaternion, ...camera.target, ...camera.projectionMatrix, camera.zoom];
function maximumDifference(a, b) {
  expect(a).toHaveLength(b.length);
  return Math.max(...a.map((value, index) => Math.abs(value - b[index])));
}
async function waitCameraChange(page, before) {
  await expect.poll(async () => maximumDifference(cameraVector((await threeSnapshot(page)).camera), cameraVector(before)))
    .toBeGreaterThan(1e-6);
  return (await threeSnapshot(page)).camera;
}
async function canvasPixels(page) {
  const evidence = await page.locator('#three-scene canvas').evaluate(canvas => {
    const gl = canvas.getContext('webgl2');
    if (!gl || gl.isContextLost()) throw new Error('A real, live WebGL2 context is required / 需要真实有效的WebGL2上下文');
    const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const colors = new Set(), stride = Math.max(1, Math.floor(width * height / 6000));
    let sampled = 0, painted = 0, nonBackground = 0, hash = 2166136261;
    for (let index = 0; index < width * height; index += stride) {
      const offset = index * 4, rgba = [...pixels.subarray(offset, offset + 4)];
      colors.add(rgba.join(','));
      if (rgba[3] > 0) painted++;
      if (Math.abs(rgba[0] - pixels[0]) + Math.abs(rgba[1] - pixels[1]) + Math.abs(rgba[2] - pixels[2]) > 15) nonBackground++;
      for (const value of rgba) hash = Math.imul(hash ^ value, 16777619) >>> 0;
      sampled++;
    }
    // A coarse independent image signature supports reset reproducibility without a second golden.
    // 粗分块图像签名独立验证复位重现，不额外添加基线。
    const signature = [];
    for (let by = 0; by < 12; by++) for (let bx = 0; bx < 12; bx++) {
      const sums = [0, 0, 0]; let count = 0;
      for (let y = Math.floor(by * height / 12); y < Math.floor((by + 1) * height / 12); y += 3)
        for (let x = Math.floor(bx * width / 12); x < Math.floor((bx + 1) * width / 12); x += 3) {
          const offset = (y * width + x) * 4;
          for (let channel = 0; channel < 3; channel++) sums[channel] += pixels[offset + channel];
          count++;
        }
      signature.push(...sums.map(sum => sum / count));
    }
    return { width, height, error: gl.getError(), preserveDrawingBuffer: gl.getContextAttributes().preserveDrawingBuffer,
      sampled, painted, nonBackground, colors: colors.size, hash, signature };
  });
  expect(evidence.width).toBeGreaterThan(100); expect(evidence.height).toBeGreaterThan(100);
  expect(evidence.error, 'Pixel read has no GL error / 像素读取无GL错误').toBe(0);
  expect(evidence.preserveDrawingBuffer).toBe(true);
  expect(evidence.painted).toBeGreaterThan(30);
  expect(evidence.nonBackground, 'Canvas contains rendered geometry / 画布有实际绘制内容').toBeGreaterThan(30);
  return evidence;
}
function expectWorldPosition(object, expected) {
  expect(object).toBeTruthy();
  for (const [key, value] of Object.entries(expected)) expect(object.worldPosition[key]).toBeCloseTo(value, 8);
  const matrix = object.matrixWorld;
  expect(matrix).toHaveLength(16);
  for (const [index, value] of [[12, expected.x], [13, expected.y], [14, expected.z], [15, 1]])
    expect(matrix[index]).toBeCloseTo(value, 8);
}
function opaqueRgb(value) {
  expect(value).toMatch(/^rgba?\(/);
  const components = value.match(/[0-9.]+/g).map(Number);
  expect(components.length).toBeGreaterThanOrEqual(3);
  expect(components[3] ?? 1, 'Contrast sample has an opaque color / 对比度样本颜色必须不透明').toBe(1);
  return components.slice(0, 3);
}
function contrastRatio(foreground, background) {
  const luminance = rgb => rgb.map(component => component / 255).map(component =>
    component <= .04045 ? component / 12.92 : ((component + .055) / 1.055) ** 2.4)
    .reduce((sum, component, index) => sum + component * [.2126, .7152, .0722][index], 0);
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}
const objectById = (snapshot, id) => {
  const object = snapshot.objects.find(item => item.id === id);
  expect(object, 'Actual Three object exists / 实际Three对象存在: ' + id).toBeTruthy(); return object;
};
function expectSphere(snapshot, id, radius, center) {
  const object = objectById(snapshot, id);
  expect(object.geometry.type).toBe('SphereGeometry');
  expect(object.geometry.parameters.radius).toBeCloseTo(radius, 10);
  expectWorldPosition(object, center);
  return object;
}
function expectCapsule(snapshot, id, radius, wholeHeight, center, axis = { x: 0, y: 0, z: -1 }) {
  const object = objectById(snapshot, id), height = Math.max(wholeHeight, radius * 2);
  expect(object.geometry.type).toBe('CapsuleGeometry');
  expect(object.geometry.parameters.radius).toBeCloseTo(radius, 10);
  // Three's height parameter is the cylinder segment, while Contact H includes both caps.
  // Three的height是直轴段，Contact的H包含两端帽。
  expect(object.geometry.parameters.height).toBeCloseTo(height - 2 * radius, 10);
  expect(object.geometry.bounds.max.y - object.geometry.bounds.min.y).toBeCloseTo(height, 5);
  expectWorldPosition(object, center);
  if (height > 2 * radius + 1e-12) {
    for (const [i, key] of ['x', 'y', 'z'].entries()) expect(object.matrixWorld[4 + i]).toBeCloseTo(axis[key], 8);
  } else {
    // A zero-length capsule is a sphere: orientation carries no physical information.
    // 直轴段为零即球，朝向没有物理含义；三个方向仍须保持真实直径。
    for (const key of ['x', 'y', 'z']) expect(object.geometry.bounds.max[key] - object.geometry.bounds.min[key]).toBeCloseTo(radius * 2, 5);
  }
  return object;
}
function expectReferenceMesh(snapshot, id, kind, root, axis, length, radius) {
  const object = snapshot.illustrations.find(item => item.id === id);
  expect(object, 'Actual reference mesh exists / 实际示意网格存在: ' + id).toBeTruthy();
  expect(object.geometry.type).toBe('LatheGeometry');
  expect(object.geometry.vertices).toBeGreaterThan(100);
  expectWorldPosition(object, root);
  expect(object.geometry.positions).toHaveLength(object.geometry.vertices * 3);
  expect(object.geometry.positions.every(Number.isFinite)).toBe(true);
  const radial = object.geometry.positions.filter((value, index) => index % 3 === 0)
    .map((x, index) => Math.hypot(x, object.geometry.positions[index * 3 + 2]));
  expect(Math.max(...radial)).toBeCloseTo(radius, 5);
  const points = object.geometry.parameters.points;
  expect(points.length).toBeGreaterThanOrEqual(6);
  if (kind === 'plug') {
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points.at(-1).x).toBe(0); expect(points.at(-1).y).toBeCloseTo(length, 10);
    expect(Math.max(...points.map(point => point.x))).toBeCloseTo(radius, 10);
  } else {
    expect(points[0]).toEqual(points.at(-1));
    expect(points.every(point => point.x > 0)).toBe(true);
  }
  // Apply the actual object's matrix to its lathe axis: no model outline is used here.
  // 直接变换真实旋转体轴线，不借用页面模型的轮廓结果。
  const tip = transform4(object.matrixWorld, [0, length, 0, 1]);
  for (const [i, key] of ['x', 'y', 'z'].entries()) expect(tip[i]).toBeCloseTo(root[key] + axis[key] * length, 8);
  return object;
}
function expectSceneGeometry(snapshot, scenario) {
  const zero = { x: 0, y: 0, z: 0 };
  if (scenario === 'socket-modern') {
    expectSphere(snapshot, 'receiver-root', 1, zero); expectSphere(snapshot, 'receiver-length', 1, zero);
    expectSphere(snapshot, 'sender-root', .01, { x: 0, y: 0, z: .35 });
    expectSphere(snapshot, 'sender-length', .2, { x: 0, y: 0, z: .35 });
  } else if (scenario === 'socket-legacy' || scenario === 'socket-touch') {
    expectSphere(snapshot, 'receiver-proximity', .15, { x: 0, y: 0, z: -.15 });
    expectCapsule(snapshot, 'receiver-close', .06, .15, { x: 0, y: 0, z: -.075 }, { x: 0, y: 0, z: 1 });
    expectSphere(snapshot, scenario === 'socket-legacy' ? 'sender-length' : 'sender-body',
      scenario === 'socket-legacy' ? .2 : .025, { x: 0, y: 0, z: scenario === 'socket-legacy' ? .1 : -.1 });
  } else if (scenario === 'plug-depth') {
    expectSphere(snapshot, 'receiver-depth', .2, { x: 0, y: 0, z: .15 });
    expectSphere(snapshot, 'sender-socket-root', .001, zero);
  } else if (scenario === 'plug-touch' || scenario === 'plug-frot') {
    const touch = scenario === 'plug-touch';
    expectSphere(snapshot, 'receiver-proximity', touch ? .23 : .2, zero);
    expectCapsule(snapshot, 'receiver-close', touch ? .06 : .11, touch ? .26 : .2, { x: 0, y: 0, z: -.1 });
    if (touch) expectSphere(snapshot, 'sender-body', .025, { x: 0, y: 0, z: -.1 });
    else expectCapsule(snapshot, 'sender-envelope', .03, .2, { x: .04, y: 0, z: -.1 });
  } else if (scenario === 'socket-frot') {
    expectSphere(snapshot, 'receiver-frot', .1, { x: 0, y: 0, z: .05 });
    expectSphere(snapshot, 'sender-socket-root', .001, { x: 0, y: 0, z: .08 });
  } else if (scenario === 'zone') {
    expectSphere(snapshot, 'receiver-zone', .1, zero);
    expectSphere(snapshot, 'sender-body', .025, { x: .08, y: 0, z: 0 });
  } else if (scenario === 'contact-sdk') {
    expectSphere(snapshot, 'receiver-contact', 2, zero);
    expectSphere(snapshot, 'sender-contact', .001, { x: .02, y: 1, z: .15 });
    expect(snapshot.objects.filter(object => object.role === 'receiver')).toHaveLength(1);
    expect(snapshot.coverage.visible).toBe(true);
    expect(snapshot.coverage.material.color).toBe('#07806a');
  } else if (scenario === 'sensa-sps') expectSpsObjects(snapshot);
  else {
    expect(snapshot.objects.filter(object => object.role === 'receiver' || object.role === 'sender')).toHaveLength(0);
    const box = objectById(snapshot, 'encoding-cube');
    expect(box.geometry.type).toBe('EdgesGeometry');
    expect(box.geometry.vertices).toBeGreaterThanOrEqual(24);
    for (const axis of ['x', 'y', 'z']) expect(box.geometry.bounds.max[axis] - box.geometry.bounds.min[axis]).toBeCloseTo(4, 8);
    expectWorldPosition(box, { x: 0, y: 1, z: 0 });
  }
  const socket = ['socket', 'socket', zero, { x: 0, y: 0, z: 1 }, .15, .054];
  const plug = (id, z, x = 0) => [id, 'plug', { x, y: 0, z }, { x: 0, y: 0, z: -1 }, .2, .03];
  const references = {
    'socket-modern': [socket, plug('plug', .35)], 'socket-legacy': [socket, plug('plug', .1)],
    'socket-touch': [socket], 'socket-frot': [socket,
      ['socket-other', 'socket', { x: 0, y: 0, z: .08 }, { x: 0, y: 0, z: -1 }, .15, .054]],
    'plug-depth': [socket, plug('plug', .15)], 'plug-touch': [plug('plug', 0)],
    'plug-frot': [plug('plug', 0), plug('sender', 0, .04)], zone: [], 'contact-sdk': [], 'sensa-sps': [], shader: [],
  }[scenario];
  expect(snapshot.illustrations).toHaveLength(references.length);
  for (const reference of references) expectReferenceMesh(snapshot, ...reference);
}
function expectSpsObjects(snapshot, point = { x: .02, y: 1, z: .15 }) {
  const anchors = [[-.35, .65, -.35], [.35, .65, .35], [.35, 1.35, -.35], [-.35, 1.35, .35]];
  expect(snapshot.objects.filter(object => object.role === 'receiver')).toHaveLength(4);
  expect(snapshot.coverage.id).toBe('detection-region');
  expect(snapshot.coverage.visible).toBe(true);
  expect(snapshot.coverage.material.color).toBe('#07806a');
  anchors.forEach(([x, y, z], index) => {
    const object = snapshot.objects.find(item => item.id === 'receiver-P' + index);
    expect(object.geometry.type).toBe('SphereGeometry');
    expect(object.geometry.parameters.radius).toBe(2);
    expect(object.material.color).toBe(anchorColors[index]);
    const marker = snapshot.markers.find(item => item.id === 'anchor-P' + index);
    expect(marker.material.color).toBe(anchorColors[index]);
    expect(object.geometry.vertices).toBeGreaterThan(1000);
    expect(object.scale).toEqual([1, 1, 1]);
    expectWorldPosition(object, { x, y, z });
    for (const diagonal of [0, 5, 10]) expect(object.matrixWorld[diagonal]).toBeCloseTo(1, 8);
  });
  const sender = snapshot.objects.find(object => object.id === 'sender-marker');
  expect(sender.geometry.type).toBe('SphereGeometry'); expect(sender.geometry.parameters.radius).toBe(.001);
  expectWorldPosition(sender, point);
  expectWorldPosition(snapshot.markers.find(marker => marker.id === 'moving-root'), point);
}
// Column-major homogeneous transforms; no Three.js projection or framing helper is used.
// 列主序齐次变换；不借用 Three.js 投影函数或实现端的拟合 helper。
const transform4 = (matrix, point) => [0, 1, 2, 3].map(row =>
  point.reduce((sum, value, column) => sum + matrix[column * 4 + row] * value, 0));
function inverse4(matrix) {
  const rows = [0, 1, 2, 3].map(row => [
    ...[0, 1, 2, 3].map(column => matrix[column * 4 + row]),
    ...[0, 1, 2, 3].map(column => Number(column === row)),
  ]);
  for (let column = 0; column < 4; column++) {
    const pivot = [column, ...Array.from({ length: 3 - column }, (_, i) => column + i + 1)]
      .reduce((best, row) => Math.abs(rows[row][column]) > Math.abs(rows[best][column]) ? row : best);
    if (Math.abs(rows[pivot][column]) < 1e-12) throw new Error('Camera matrix is singular / 相机矩阵不可逆');
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    rows[column] = rows[column].map(value => value / divisor);
    for (let row = 0; row < 4; row++) {
      if (row === column) continue;
      const factor = rows[row][column];
      rows[row] = rows[row].map((value, i) => value - factor * rows[column][i]);
    }
  }
  return Array.from({ length: 16 }, (_, i) => rows[i % 4][4 + Math.floor(i / 4)]);
}
function projectWorld(snapshot, point, canvas) {
  const world = [point.x, point.y, point.z, 1];
  const clip = transform4(snapshot.camera.projectionMatrix,
    transform4(inverse4(snapshot.camera.matrixWorld), world));
  expect(clip[3]).toBeGreaterThan(0);
  return { x: canvas.x + (clip[0] / clip[3] + 1) * canvas.width / 2,
    y: canvas.y + (1 - clip[1] / clip[3]) * canvas.height / 2 };
}
function planeIntersection(snapshot, screen, canvas, point, plane) {
  const ndc = [(screen.x - canvas.x) / canvas.width * 2 - 1,
    1 - (screen.y - canvas.y) / canvas.height * 2];
  const inverseProjection = inverse4(snapshot.camera.projectionMatrix);
  const unproject = depth => {
    const projected = transform4(inverseProjection, [...ndc, depth, 1]);
    const world = transform4(snapshot.camera.matrixWorld, projected);
    return world.slice(0, 3).map(value => value / world[3]);
  };
  const near = unproject(-1), far = unproject(1);
  const locked = ['x', 'y', 'z'].find(axis => !plane.includes(axis));
  const index = ['x', 'y', 'z'].indexOf(locked), denominator = far[index] - near[index];
  expect(Math.abs(denominator), 'Ray is not parallel to the drag plane / 射线不平行于拖动平面').toBeGreaterThan(1e-8);
  const distance = (point[locked] - near[index]) / denominator;
  return Object.fromEntries(['x', 'y', 'z'].map((axis, i) => [axis, near[i] + (far[i] - near[i]) * distance]));
}
async function dragTarget(page, plane, wanted) {
  await page.locator('#drag-plane').selectOption(plane);
  const canvas = page.locator('#three-scene canvas'); await canvas.scrollIntoViewIfNeeded();
  const rectangle = await canvas.boundingBox(), before = await threeSnapshot(page);
  const start = before.markers.find(marker => marker.id === 'moving-root').worldPosition;
  const from = projectWorld(before, start, rectangle), to = projectWorld(before, wanted, rectangle);
  const raw = planeIntersection(before, to, rectangle, start, plane);
  const ranges = await page.locator('[data-control]').evaluateAll(holders => Object.fromEntries(holders
    .filter(holder => ['x', 'y', 'z'].includes(holder.dataset.control)).map(holder => {
      const input = holder.querySelector('input'); return [holder.dataset.control,
        { min: Number(input.min), max: Number(input.max), step: Number(input.step) }];
    })));
  const expected = Object.fromEntries(['x', 'y', 'z'].map(axis => {
    const range = ranges[axis];
    const value = plane.includes(axis) ? Math.max(range.min, Math.min(range.max,
      range.min + Math.round((raw[axis] - range.min) / range.step) * range.step)) : start[axis];
    return [axis, Number(value.toFixed(10))];
  }));
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  expect((await threeSnapshot(page)).drag.active).toBe(true);
  await page.mouse.move(to.x, to.y, { steps: 4 }); await page.mouse.up();
  const after = await threeSnapshot(page);
  expect(after.drag.active).toBe(false);
  expectWorldPosition(after.markers.find(marker => marker.id === 'moving-root'), expected);
  expect((await uiGeometry(page)).xyz.map(Number)).toEqual(['x', 'y', 'z'].map(axis => expected[axis]));
  expect(maximumDifference(cameraVector(after.camera), cameraVector(before.camera))).toBeLessThan(1e-8);
  expectSpsObjects(after, expected);
  for (const [index, anchor] of [[0, [-.35, .65, -.35]], [1, [.35, .65, .35]], [2, [.35, 1.35, -.35]], [3, [-.35, 1.35, .35]]]) {
    const proximity = 1 - (Math.hypot(expected.x - anchor[0], expected.y - anchor[1], expected.z - anchor[2]) - .001) / 2;
    await nearCell(page, 'P' + index, Math.max(0, Math.min(1, proximity)));
  }
  return { plane, from, to, raw, expected, actual: after.markers.find(marker => marker.id === 'moving-root'),
    cameraBefore: before.camera, cameraAfter: after.camera };
}
function frameCornersNdc(snapshot) {
  const edge = snapshot.objects.find(object => object.role === 'reference' && object.geometry?.type === 'EdgesGeometry');
  if (!edge) throw new Error('Rendered frame edges are missing / 缺少实际渲染边框');
  const view = inverse4(snapshot.camera.matrixWorld), bounds = edge.geometry.bounds;
  return Array.from({ length: 8 }, (_, bits) => {
    const local = ['x', 'y', 'z'].map((axis, i) => bounds[bits & (1 << i) ? 'max' : 'min'][axis]);
    const world = transform4(edge.matrixWorld, [...local, 1]);
    const clip = transform4(snapshot.camera.projectionMatrix, transform4(view, world));
    return { local, world, clip, ndc: { x: clip[0] / clip[3], y: clip[1] / clip[3], z: clip[2] / clip[3] } };
  });
}
function expectFrameFits(snapshot) {
  const corners = frameCornersNdc(snapshot);
  for (const corner of corners) {
    expect(corner.clip[3]).toBeGreaterThan(0);
    expect(Object.values(corner.ndc).every(Number.isFinite)).toBe(true);
    expect(Math.abs(corner.ndc.x)).toBeLessThanOrEqual(.9);
    expect(Math.abs(corner.ndc.y)).toBeLessThanOrEqual(.9);
    expect(corner.ndc.z).toBeGreaterThanOrEqual(-1);
    expect(corner.ndc.z).toBeLessThanOrEqual(1);
  }
  return corners;
}
function referenceLabelClearance(snapshot, layout) {
  // Project the real Lathe bounds using the actual world and camera matrices.
  // 用真实旋转体包围盒及世界／相机矩阵投影，不读取实现端的避障结论。
  const canvas = { x: 0, y: 0, width: layout.canvas.width, height: layout.canvas.height };
  const meshes = snapshot.illustrations.filter(object => object.visible && object.geometry.type === 'LatheGeometry').map(object => {
    const bounds = object.geometry.bounds;
    const corners = Array.from({ length: 8 }, (_, bits) => {
      const local = ['x', 'y', 'z'].map((axis, index) => bounds[bits & (1 << index) ? 'max' : 'min'][axis]);
      const world = transform4(object.matrixWorld, [...local, 1]);
      const screen = projectWorld(snapshot, { x: world[0] / world[3], y: world[1] / world[3], z: world[2] / world[3] }, canvas);
      expect(Number.isFinite(screen.x) && Number.isFinite(screen.y)).toBe(true);
      return { local, world, screen };
    });
    return { id: object.id, corners, rect: { left: Math.min(...corners.map(corner => corner.screen.x)),
      right: Math.max(...corners.map(corner => corner.screen.x)), top: Math.min(...corners.map(corner => corner.screen.y)),
      bottom: Math.max(...corners.map(corner => corner.screen.y)) } };
  });
  expect(meshes.length).toBeGreaterThan(0);
  const labels = layout.labels.map(label => ({ id: label.id,
    left: label.left + layout.viewportBox.x - layout.canvas.x, right: label.right + layout.viewportBox.x - layout.canvas.x,
    top: label.top + layout.viewportBox.y - layout.canvas.y, bottom: label.bottom + layout.viewportBox.y - layout.canvas.y }));
  const intersections = meshes.flatMap(mesh => labels.map(label => {
    const width = Math.max(0, Math.min(mesh.rect.right, label.right) - Math.max(mesh.rect.left, label.left));
    const height = Math.max(0, Math.min(mesh.rect.bottom, label.bottom) - Math.max(mesh.rect.top, label.top));
    expect(Math.min(width, height), 'Label leaves the reference mesh visible / 标签不遮挡示意网格: '
      + mesh.id + ' × ' + label.id + ' (' + width.toFixed(3) + ' × ' + height.toFixed(3) + ' CSS px)').toBeLessThanOrEqual(1);
    return { mesh: mesh.id, label: label.id, width, height };
  }));
  return { meshes, labels, intersections };
}
async function referenceLeaderEvidence(page, snapshot, layout, scenario) {
  const lines = await page.locator('#three-scene line[data-leader-for]').evaluateAll(nodes => nodes.map(line => {
    const style = getComputedStyle(line), matrix = line.getScreenCTM();
    const project = (x, y) => ({ x: matrix.a * x + matrix.c * y + matrix.e, y: matrix.b * x + matrix.d * y + matrix.f });
    const id = line.dataset.leaderFor;
    const label = [...document.querySelectorAll('#three-scene [data-label-id]')].find(node => node.dataset.labelId === id);
    const box = label.getBoundingClientRect();
    const dot = [...line.ownerSVGElement.querySelectorAll('circle[data-leader-anchor-for]')].find(node => node.dataset.leaderAnchorFor === id);
    let dotEvidence = null;
    if (dot) {
      const transform = dot.getScreenCTM(), styles = getComputedStyle(dot), x = dot.cx.baseVal.value, y = dot.cy.baseVal.value;
      dotEvidence = { center: { x: transform.a * x + transform.c * y + transform.e, y: transform.b * x + transform.d * y + transform.f },
        attributes: Object.fromEntries(['cx', 'cy', 'r'].map(name => [name, dot.getAttribute(name)])), radius: dot.r.baseVal.value,
        fill: styles.fill, pointerEvents: styles.pointerEvents, visibility: styles.visibility, display: styles.display };
    }
    return { id, dot: dotEvidence, attributes: Object.fromEntries(['x1', 'y1', 'x2', 'y2'].map(name => [name, line.getAttribute(name)])),
      matrix: [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f],
      start: project(line.x1.baseVal.value, line.y1.baseVal.value), end: project(line.x2.baseVal.value, line.y2.baseVal.value),
      label: { left: box.left, right: box.right, top: box.top, bottom: box.bottom },
      stroke: style.stroke, strokeWidth: Number.parseFloat(style.strokeWidth), strokeOpacity: Number(style.strokeOpacity),
      opacity: Number(style.opacity), visibility: style.visibility, display: style.display, pointerEvents: style.pointerEvents,
      svgPointerEvents: getComputedStyle(line.ownerSVGElement).pointerEvents };
  }));
  if (scenario === 'socket-modern') {
    expect(lines.filter(line => line.id === 'illustration-plug-tip'), 'A displaced modern Plug Tip has a real leader / 现代Plug偏移的Tip标签必须有真实引线').toHaveLength(1);
  }
  for (const line of lines) {
    let point;
    if (line.id === 'moving-root') point = snapshot.markers.find(marker => marker.id === 'moving-root').worldPosition;
    else {
      const match = /^illustration-(.+)-(root|tip)$/.exec(line.id);
      expect(match, 'Leader names an actual reference / 引线指向实际参考对象').not.toBeNull();
      const object = snapshot.illustrations.find(item => item.id === match[1]);
      expect(object).toBeTruthy();
      const localY = match[2] === 'tip' ? object.geometry.parameters.points.at(-1).y : 0;
      if (match[2] === 'tip') expect(object.kind).toBe('plug');
      const world = transform4(object.matrixWorld, [0, localY, 0, 1]);
      point = { x: world[0] / world[3], y: world[1] / world[3], z: world[2] / world[3] };
    }
    // The expected start comes from actual geometry, not the label layout or a leader helper.
    // 期望起点来自真实几何，不复用标签布局或实现端的引线helper。
    const expectedStart = projectWorld(snapshot, point, layout.canvas);
    const expectedEnd = { x: Math.max(line.label.left, Math.min(line.label.right, expectedStart.x)),
      y: Math.max(line.label.top, Math.min(line.label.bottom, expectedStart.y)) };
    expect(Math.hypot(line.start.x - expectedStart.x, line.start.y - expectedStart.y), 'Leader starts at the actual reference / 引线始于真实参考点: ' + line.id).toBeLessThanOrEqual(1);
    // Allow a 1 CSS px gap plus offsetWidth rounding (<=.5), SVG scaling (about .125) and DOM 1/64 px.
    // 允许1CSS像素间隙，加offsetWidth取整(≤.5)、SVG比例(约.125)及DOM的1/64像素量化。
    // CI evidence includes a 44.6875 px Socket label rounded to offsetWidth=45: its correct end is about 1.33 px away.
    // CI实证Socket标签44.6875像素取整为offsetWidth=45，正确线端距真实边界约1.33像素。
    const edgeGap = { x: line.end.x - expectedEnd.x, y: line.end.y - expectedEnd.y };
    const direction = { x: expectedStart.x - expectedEnd.x, y: expectedStart.y - expectedEnd.y };
    const distanceToEdge = Math.hypot(direction.x, direction.y);
    expect(distanceToEdge).toBeGreaterThan(1);
    const terminalError = Math.hypot(edgeGap.x, edgeGap.y);
    const along = (edgeGap.x * direction.x + edgeGap.y * direction.y) / distanceToEdge;
    const cross = Math.abs(edgeGap.x * direction.y - edgeGap.y * direction.x) / distanceToEdge;
    expect(terminalError, 'Leader ends on its label nearest edge / 引线止于标签最近边: ' + line.id).toBeLessThanOrEqual(2);
    expect(Math.abs(along - 1), 'Endpoint stays one pixel toward its reference / 末端仍朝参考点方向留约一像素').toBeLessThanOrEqual(.75);
    expect(cross, 'Endpoint stays on the reference-to-label line / 末端仍在参考点到标签连线方向').toBeLessThanOrEqual(.75);
    if (line.id !== 'moving-root') {
      expect(line.dot, 'Illustrated reference has a visible anchor dot / 示意参考点有可见圆点').not.toBeNull();
      expect(Math.hypot(line.dot.center.x - expectedStart.x, line.dot.center.y - expectedStart.y)).toBeLessThanOrEqual(1);
      expect(line.dot.radius).toBeGreaterThan(0); expect(line.dot.fill).not.toBe('none');
      expect(line.dot.pointerEvents).toBe('none'); expect(line.dot.visibility).toBe('visible'); expect(line.dot.display).not.toBe('none');
    }
    expect(Math.hypot(line.end.x - line.start.x, line.end.y - line.start.y)).toBeGreaterThan(1);
    expect(line.stroke).not.toBe('none'); expect(line.stroke).not.toBe('transparent');
    expect(line.strokeWidth).toBeGreaterThan(0); expect(line.strokeOpacity * line.opacity).toBeGreaterThan(0);
    expect(line.visibility).toBe('visible'); expect(line.display).not.toBe('none');
    expect(line.pointerEvents).toBe('none'); expect(line.svgPointerEvents).toBe('none');
    Object.assign(line, { referencePoint: point, expectedStart, expectedEnd, terminalError, along, cross });
  }
  return lines;
}
async function readyOrbit(page, scenario) {
  await chooseScene(page, scenario, 'orbit');
  await expect(page.locator('#projection')).toHaveValue('orbit');
  await expect(page.locator('#three-scene')).toBeVisible();
  await expect(page.locator('#three-scene')).toHaveAttribute('data-render-state', 'ready');
  await expect(page.locator('#three-scene canvas')).toHaveCount(1);
  await expect(page.locator('#diagram')).toBeHidden();
  await expect(page.locator('#three-fallback')).toBeHidden();
  await expect.poll(async () => (await threeSnapshot(page))?.renderer.render.calls ?? 0).toBeGreaterThan(0);
}
async function orbitLayout(page) {
  const layout = await documentFits(page);
  const labels = await page.locator('#three-scene [data-label-id]').evaluateAll(nodes => nodes.flatMap(node => {
    const box = node.getBoundingClientRect(), style = getComputedStyle(node);
    if (node.hidden || style.display === 'none' || style.visibility !== 'visible' || box.width <= 0 || box.height <= 0) return [];
    const host = node.closest('.three-viewport').getBoundingClientRect();
    return [{ id: node.dataset.labelId, text: node.textContent, font: Number.parseFloat(style.fontSize),
      left: box.left - host.left, right: box.right - host.left, top: box.top - host.top,
      bottom: box.bottom - host.top, width: host.width, height: host.height }];
  }));
  expect(labels.length).toBeGreaterThanOrEqual(4);
  for (const label of labels) {
    expect(label.font).toBeGreaterThanOrEqual(label.id.startsWith('axis-') ? 8.9 : 10.9);
    expect(label.left).toBeGreaterThanOrEqual(-1); expect(label.right).toBeLessThanOrEqual(label.width + 1);
    expect(label.top).toBeGreaterThanOrEqual(-1); expect(label.bottom).toBeLessThanOrEqual(label.height + 1);
  }
  const box = await page.locator('#three-scene canvas').boundingBox();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(-1); expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
  const viewportBox = await page.locator('#three-scene .three-viewport').boundingBox();
  expect(viewportBox).not.toBeNull();
  return { ...layout, labels, canvas: box, viewportBox };
}

threeTest.describe('offline Three.js rendering / 离线Three.js渲染', () => {
  threeTest('real WebGL geometry, camera controls and offline orbit views / 真实WebGL几何、相机控制与离线旋转视图',
    { tag: ['@visual', '@i18n', '@config'] }, async ({ page }, info) => {
      const network = [], sockets = [], errors = [];
      page.on('request', request => { if (/^(?:https?|wss?):/.test(request.url())) network.push(request.url()); });
      page.on('websocket', socket => sockets.push(socket.url()));
      page.on('pageerror', error => errors.push(error.message));
      const url = new URL(guideFile); url.searchParams.set('lang', 'zh-CN');
      await page.goto(url.href);
      await readyOrbit(page, 'sensa-sps');
      const anchorContrast = [];
      for (const [index, color] of anchorColors.entries()) {
        const row = parameter(page, 'P' + index);
        await row.getByRole('button', { name: 'P' + index, exact: true }).click();
        const label = page.locator('#three-scene [data-label-id="anchor-P' + index + '"]');
        await expect(label).toHaveClass(/(?:^|\s)three-label--active(?:\s|$)/);
        const styles = await label.evaluate(node => {
          const style = getComputedStyle(node);
          return { foreground: style.color, background: style.backgroundColor, opacity: Number(style.opacity) };
        });
        expect(styles.opacity).toBe(1);
        const foreground = opaqueRgb(styles.foreground), background = opaqueRgb(styles.background);
        expect(foreground).toEqual(color.slice(1).match(/../g).map(value => parseInt(value, 16)));
        const contrast = contrastRatio(foreground, background);
        expect(contrast, 'Active anchor text contrast / 已选锚点文字对比度: P' + index).toBeGreaterThanOrEqual(4.5);
        await expect(row).toHaveAttribute('data-anchor-color', color);
        expect(opaqueRgb(await row.locator('.anchor-swatch').evaluate(node => getComputedStyle(node).backgroundColor))).toEqual(foreground);
        expectSpsObjects(await threeSnapshot(page));
        anchorContrast.push({ name: 'P' + index, color, ...styles, contrast });
      }
      await parameter(page, 'P0').getByRole('button', { name: 'P0', exact: true }).click();
      const initial = await threeSnapshot(page), initialUi = await uiGeometry(page);
      expectSpsObjects(initial);
      expect(initial.renderer.contextLost).toBe(false);
      expect(initial.lifecycle.live).toBe(1);
      const originalPixels = await canvasPixels(page);
      const canvas = page.locator('#three-scene canvas');
      await canvas.scrollIntoViewIfNeeded();
      const area = await canvas.boundingBox();
      const markerScreen = projectWorld(initial, initial.markers.find(marker => marker.id === 'moving-root').worldPosition, area);
      const orbitStart = [[.2, .2], [.2, .7], [.7, .2], [.7, .7]].map(([x, y]) =>
        ({ x: area.x + area.width * x, y: area.y + area.height * y })).sort((a, b) =>
        Math.hypot(b.x - markerScreen.x, b.y - markerScreen.y) - Math.hypot(a.x - markerScreen.x, a.y - markerScreen.y))[0];
      expect(Math.hypot(orbitStart.x - markerScreen.x, orbitStart.y - markerScreen.y)).toBeGreaterThan(40);
      await page.mouse.move(orbitStart.x, orbitStart.y);
      await page.mouse.down();
      await page.mouse.move(orbitStart.x + 22, orbitStart.y + 13, { steps: 4 });
      await page.mouse.move(orbitStart.x + 40, orbitStart.y + 24, { steps: 4 });
      await page.mouse.up();
      const draggedCamera = await waitCameraChange(page, initial.camera);
      expect((await canvasPixels(page)).hash).not.toBe(originalPixels.hash);
      expect(await uiGeometry(page)).toEqual(initialUi);
      expectSpsObjects(await threeSnapshot(page));

      await canvas.focus(); await canvas.press('ArrowRight');
      const keyedCamera = await waitCameraChange(page, draggedCamera);
      await expect(canvas).toBeFocused();
      expect(await uiGeometry(page)).toEqual(initialUi);
      const distance = camera => Math.hypot(...camera.position.map((value, index) => value - camera.target[index]));
      await page.mouse.move(area.x + area.width * .5, area.y + area.height * .5);
      await page.mouse.wheel(0, -120);
      const wheeledCamera = await waitCameraChange(page, keyedCamera);
      expect(distance(wheeledCamera)).toBeLessThan(distance(keyedCamera));
      const zoomButton = page.locator('[data-camera-action="zoom-in"]');
      await zoomButton.focus(); await zoomButton.press('Enter');
      const buttonCamera = await waitCameraChange(page, wheeledCamera);
      expect(distance(buttonCamera)).toBeLessThan(distance(wheeledCamera));
      expect(await uiGeometry(page)).toEqual(initialUi);

      await page.locator('#locale').selectOption('en-US');
      await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
      const localized = await threeSnapshot(page);
      expect(maximumDifference(cameraVector(localized.camera), cameraVector(buttonCamera))).toBeLessThan(1e-8);
      expect(await uiGeometry(page)).toEqual(initialUi);
      await expect(page.locator('[data-camera-action="left"]')).toHaveAttribute('aria-label', 'Rotate left');
      await page.locator('[data-camera-action="reset"]').click();
      const reset = await threeSnapshot(page);
      expectFrameFits(reset);
      expect(maximumDifference(cameraVector(reset.camera), cameraVector(initial.camera))).toBeLessThan(1e-8);
      expect(await uiGeometry(page)).toEqual(initialUi);
      const resetPixels = await canvasPixels(page);
      expect(maximumDifference(resetPixels.signature, originalPixels.signature)).toBeLessThan(1);

      const dragEvidence = [];
      dragEvidence.push(await dragTarget(page, 'xz', { x: .193, y: 1, z: .287 }));
      const afterXz = (await threeSnapshot(page)).markers.find(marker => marker.id === 'moving-root').worldPosition;
      dragEvidence.push(await dragTarget(page, 'xy', { x: afterXz.x + .137, y: afterXz.y + .113, z: afterXz.z }));
      // The guide permits positions beyond the ±2 m measurement bounds; clamp at its actual slider limit.
      // 图解允许展示 ±2 m 测量边界外的位置；拖动须在滑块的实际上限处截断。
      await expect(page.locator('#control-x')).toHaveAttribute('max', '2.3');
      await setRange(page, 'x', 2.29);
      const beforeClamp = (await threeSnapshot(page)).markers.find(marker => marker.id === 'moving-root').worldPosition;
      dragEvidence.push(await dragTarget(page, 'xy', { ...beforeClamp, x: 2.38, y: beforeClamp.y + .077 }));
      expect(dragEvidence.at(-1).expected.x).toBe(2.3);

      // Escape cancels a captured target gesture without resuming it on the next move.
      // Escape取消已捕获的目标拖动，后续移动不能继续写坐标。
      const cancelSnapshot = await threeSnapshot(page), cancelUi = await uiGeometry(page);
      await canvas.scrollIntoViewIfNeeded();
      const cancelBox = await canvas.boundingBox();
      const cancelPoint = projectWorld(cancelSnapshot, cancelSnapshot.markers.find(marker => marker.id === 'moving-root').worldPosition, cancelBox);
      await canvas.focus(); await page.mouse.move(cancelPoint.x, cancelPoint.y); await page.mouse.down();
      expect((await threeSnapshot(page)).drag.active).toBe(true);
      await canvas.press('Escape');
      expect((await threeSnapshot(page)).drag.active).toBe(false);
      await page.mouse.move(cancelPoint.x + 18, cancelPoint.y + 9); await page.mouse.up();
      expect(await uiGeometry(page)).toEqual(cancelUi);
      expect(maximumDifference(cameraVector((await threeSnapshot(page)).camera), cameraVector(cancelSnapshot.camera))).toBeLessThan(1e-8);

      await page.mouse.move(cancelPoint.x, cancelPoint.y); await page.mouse.down();
      expect((await threeSnapshot(page)).drag.active).toBe(true);
      await page.locator('#scene').selectOption('socket-modern');
      await expect(page.locator('#projection')).toHaveValue('orbit');
      expect((await threeSnapshot(page)).drag.active).toBe(false);
      await page.mouse.move(cancelPoint.x + 18, cancelPoint.y + 9); await page.mouse.up();
      expectWorldPosition((await threeSnapshot(page)).markers.find(marker => marker.id === 'moving-root'), { x: 0, y: 0, z: .35 });
      await readyOrbit(page, 'sensa-sps');

      await setRange(page, 'x', .2); await setRange(page, 'y', 1.2); await setRange(page, 'z', -.1);
      const moved = await threeSnapshot(page);
      expectSpsObjects(moved, { x: .2, y: 1.2, z: -.1 });
      expect(maximumDifference(cameraVector(moved.camera), cameraVector(reset.camera))).toBeLessThan(1e-8);
      for (const [index, anchor] of [[0, [-.35, .65, -.35]], [1, [.35, .65, .35]], [2, [.35, 1.35, -.35]], [3, [-.35, 1.35, .35]]])
        await nearCell(page, 'P' + index, 1 - (Math.hypot(.2 - anchor[0], 1.2 - anchor[1], -.1 - anchor[2]) - .001) / 2);

      const shownPixels = await canvasPixels(page);
      await page.locator('#show-receivers').uncheck();
      expect((await threeSnapshot(page)).objects.filter(object => object.role === 'receiver').every(object => !object.visible)).toBe(true);
      expect((await canvasPixels(page)).hash).not.toBe(shownPixels.hash);
      await page.locator('#show-receivers').check();
      await page.locator('#show-senders').uncheck();
      expect((await threeSnapshot(page)).objects.find(object => object.id === 'sender-marker').visible).toBe(false);
      await page.locator('#show-senders').check();

      const cycleEvidence = [];
      for (let cycle = 0; cycle < 3; cycle++) {
        await readyOrbit(page, 'shader');
        const shader = await threeSnapshot(page);
        expect(shader.objects.filter(object => object.role === 'receiver' || object.role === 'sender')).toHaveLength(0);
        const box = shader.objects.find(object => object.id === 'encoding-cube');
        expect(box.geometry.type).toBe('EdgesGeometry');
        expect(box.geometry.vertices).toBeGreaterThanOrEqual(24);
        for (const axis of ['x', 'y', 'z'])
          expect(box.geometry.bounds.max[axis] - box.geometry.bounds.min[axis]).toBeCloseTo(4, 8);
        expectWorldPosition(box, { x: 0, y: 1, z: 0 });
        await canvasPixels(page);
        await readyOrbit(page, 'sensa-sps');
        const current = await threeSnapshot(page);
        expect(current.renderer.instanceId).toBe(initial.renderer.instanceId);
        expect(current.lifecycle.live).toBe(1);
        expect(current.renderer.memory.geometries).toBe(initial.renderer.memory.geometries);
        expect(await page.locator('#three-scene canvas').count()).toBe(1);
        cycleEvidence.push({ lifecycle: current.lifecycle, memory: current.renderer.memory });
      }
      await page.locator('#projection').selectOption('xz');
      await expect(page.locator('#three-scene canvas')).toHaveCount(0);
      expect((await threeLifecycle(page)).live).toBe(0);
      const disposed = await threeLifecycle(page);
      expect(disposed.created).toBe(disposed.disposed);
      await page.locator('#projection').selectOption('orbit');
      const recreated = await threeSnapshot(page);
      expect(recreated.renderer.instanceId).not.toBe(initial.renderer.instanceId);
      expect(recreated.lifecycle.live).toBe(1);

      await readyOrbit(page, 'shader');
      await setRange(page, 'x', .25); await setRange(page, 'y', 1.25); await setRange(page, 'z', -.25);
      const shader = await threeSnapshot(page);
      const decoded = { x: 36863 / 65535 * 4 - 2, y: 1 + 36863 / 65535 * 4 - 2, z: 28672 / 65535 * 4 - 2 };
      expectWorldPosition(shader.markers.find(marker => marker.id === 'moving-root'), { x: .25, y: 1.25, z: -.25 });
      expectWorldPosition(shader.markers.find(marker => marker.id === 'decoded-root'), decoded);
      for (const axis of ['X', 'Y', 'Z']) await nearCell(page, axis, decoded[axis.toLowerCase()]);

      const sceneEvidence = [];
      for (const scenario of scenarioIds) {
        await page.locator('#projection').selectOption('xz');
        await page.locator('#scene').selectOption(scenario);
        await expect(page.locator('#projection'), 'Every scene defaults to real 3D / 每个场景默认真实三维').toHaveValue('orbit');
        await readyOrbit(page, scenario);
        const snapshot = await threeSnapshot(page);
        expectSceneGeometry(snapshot, scenario);
        expect(snapshot.lifecycle.live).toBe(1);
        await expect(page.locator('#three-scene canvas')).toHaveCount(1);
        await addressPattern(page, scenario);
        sceneEvidence.push({ scenario, three: snapshot, pixels: await canvasPixels(page) });
      }
      await readyOrbit(page, 'socket-modern');
      await setRange(page, 'L', .4); await setRange(page, 'yaw', 90);
      const resizedModern = await threeSnapshot(page);
      expectSphere(resizedModern, 'sender-length', .4, { x: 0, y: 0, z: .35 });
      await nearCell(page, 'PenOthersNewRoot', .66); await nearCell(page, 'PenOthersNewTip', 1);
      expectReferenceMesh(resizedModern, 'plug', 'plug', { x: 0, y: 0, z: .35 }, { x: -1, y: 0, z: 0 }, .4, .03);
      await readyOrbit(page, 'plug-touch');
      await setRange(page, 'L', .4); await setRange(page, 'W', .02);
      const resizedPlug = await threeSnapshot(page);
      expectSphere(resizedPlug, 'receiver-proximity', .42, { x: 0, y: 0, z: 0 });
      expectCapsule(resizedPlug, 'receiver-close', .04, .44, { x: 0, y: 0, z: -.2 });
      expectReferenceMesh(resizedPlug, 'plug', 'plug', { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, .4, .02);
      await readyOrbit(page, 'socket-legacy'); await setRange(page, 'D', .25);
      const resizedSocket = await threeSnapshot(page);
      expectSphere(resizedSocket, 'receiver-proximity', .25, { x: 0, y: 0, z: -.25 });
      expectCapsule(resizedSocket, 'receiver-close', .1, .25, { x: 0, y: 0, z: -.125 }, { x: 0, y: 0, z: 1 });
      expectReferenceMesh(resizedSocket, 'socket', 'socket', { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, .22, .054);

      // Representative views reset geometry and explicitly show the default XZ drag plane.
      // 代表画面复位几何，并明确显示默认的XZ拖动平面。
      await page.locator('#drag-plane').selectOption('xz');
      const evidence = [];
      for (const locale of ['zh-CN', 'en-US']) {
        await page.locator('#locale').selectOption(locale);
        for (const scenario of goldenScenes) {
          await readyOrbit(page, scenario);
          const pixels = await canvasPixels(page), layout = await orbitLayout(page);
          await addressPattern(page, scenario);
          const frustum = ['sensa-sps', 'shader'].includes(scenario) ? expectFrameFits(await threeSnapshot(page)) : null;
          const referenceClearance = ['socket-modern', 'socket-legacy', 'plug-touch'].includes(scenario)
            ? referenceLabelClearance(await threeSnapshot(page), layout) : null;
          const referenceLeaders = referenceClearance
            ? await referenceLeaderEvidence(page, await threeSnapshot(page), layout, scenario) : null;
          await page.evaluate(() => document.fonts.ready); await page.mouse.move(0, 0);
          await expect(page).toHaveScreenshot('parameter-geometry-' + scenario + '-orbit-' + locale + '.png', { fullPage: true });
          evidence.push({ locale, scenario, layout, pixels, frustum, referenceClearance, referenceLeaders, three: await threeSnapshot(page) });
        }
      }
      await page.setViewportSize({ width: 320, height: 844 });
      // Observe resize before reset/scene changes can hide a framing defect.
      // 在复位或切场景前直接观察 resize，避免后续操作掩盖构图问题。
      await expect.poll(async () => {
        const aspect = await page.locator('#three-scene .three-viewport').evaluate(element => element.clientWidth / element.clientHeight);
        return Math.abs((await threeSnapshot(page)).camera.aspect - aspect);
      }).toBeLessThan(1e-8);
      await expect.poll(async () => Math.max(...frameCornersNdc(await threeSnapshot(page))
        .flatMap(corner => [Math.abs(corner.ndc.x), Math.abs(corner.ndc.y)])))
        .toBeLessThanOrEqual(.9);
      const resizedFrustum = expectFrameFits(await threeSnapshot(page));
      for (const locale of ['zh-CN', 'en-US']) {
        await page.locator('#locale').selectOption(locale);
        for (const scenario of scenarioIds) {
          await readyOrbit(page, scenario);
          evidence.push({ locale, scenario, reflow: true, layout: await orbitLayout(page), pixels: await canvasPixels(page),
            frustum: ['sensa-sps', 'shader'].includes(scenario) ? expectFrameFits(await threeSnapshot(page)) : null });
        }
      }
      await info.attach('parameter-geometry-webgl.json', { body: JSON.stringify({ initial, initialPixels: originalPixels,
        camera: { pointer: draggedCamera, keyboard: keyedCamera, wheel: wheeledCamera, button: buttonCamera, reset: reset.camera },
        cycles: cycleEvidence, drag: dragEvidence, anchorContrast, scenes: sceneEvidence,
        dimensions: { modern: resizedModern, plug: resizedPlug, socket: resizedSocket },
        resizedFrustum, views: evidence }, null, 2), contentType: 'application/json' });
      expect(network).toEqual([]); expect(sockets).toEqual([]); expect(errors).toEqual([]);
    });

  threeTest('unavailable and lost WebGL contexts retain localized SVG and controls / WebGL不可用或丢失后保留本地化SVG与控制',
    { tag: ['@config', '@i18n'] }, async ({ page }, info) => {
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const url = new URL(guideFile); url.searchParams.set('lang', 'en-US');
      await page.goto(url.href); await readyOrbit(page, 'sensa-sps');
      await page.locator('#three-scene canvas').evaluate(canvas => {
        const extension = canvas.getContext('webgl2').getExtension('WEBGL_lose_context');
        if (!extension) throw new Error('Controlled context-loss extension is required / 需要可控上下文丢失扩展');
        extension.loseContext();
      });
      await expect(page.locator('#projection')).toHaveValue('iso');
      await expect(page.locator('#three-fallback')).toBeVisible();
      await expect(page.locator('#three-scene')).toHaveAttribute('data-render-state', 'fallback');
      await expect(page.locator('#three-fallback')).toHaveText('3D is unavailable here. Using orthographic SVG; values and XYZ sliders still work.');
      await expect(page.locator('#diagram')).toBeVisible();
      await expect(page.locator('#three-scene canvas')).toHaveCount(0);
      expect((await threeLifecycle(page)).live).toBe(0);
      await setRange(page, 'z', .25);
      await nearCell(page, 'P0', 1 - (Math.hypot(.02 + .35, 1 - .65, .25 + .35) - .001) / 2);
      await finiteDrawing(page); await documentFits(page);
      const lost = await threeLifecycle(page);

      const unavailable = await page.context().newPage();
      unavailable.on('pageerror', error => errors.push(error.message));
      try {
        await unavailable.addInitScript(() => {
          const original = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function (type, ...args) {
            return type === 'webgl2' ? null : original.call(this, type, ...args);
          };
        });
        await unavailable.goto(url.href);
        await unavailable.locator('#scene').selectOption('shader');
        await expect(unavailable.locator('#projection')).toHaveValue('iso');
        await expect(unavailable.locator('#three-fallback')).toHaveText('3D is unavailable here. Using orthographic SVG; values and XYZ sliders still work.');
        await expect(unavailable.locator('#three-fallback')).toBeVisible();
        await expect(unavailable.locator('#three-scene')).toHaveAttribute('data-render-state', 'fallback');
        await expect(unavailable.locator('#three-scene canvas')).toHaveCount(0);
        await expect(unavailable.locator('#diagram')).toBeVisible();
        await setRange(unavailable, 'x', .25); await nearCell(unavailable, 'X', 36863 / 65535 * 4 - 2);
        await unavailable.locator('#locale').selectOption('zh-CN');
        await expect(unavailable.locator('#three-fallback')).toHaveText('本机 3D 不可用，已切换立体 SVG；读数与 XYZ 滑条仍可使用。');
        await expect(unavailable.locator('#control-x')).toHaveValue('0.25');
        // OPTION's own state matters; toBeDisabled follows the enclosing label to SELECT.
        // 检查 OPTION 自身；toBeDisabled 会沿外层 label 重定向到仍应可用的 SELECT。
        const orbitOption = unavailable.locator('#projection option[value="orbit"]');
        await expect(orbitOption).toHaveJSProperty('disabled', true);
        await expect(orbitOption).toHaveAttribute('disabled', '');
        await expect(unavailable.locator('#projection')).toBeEnabled();
        await unavailable.locator('#projection').selectOption('xz');
        await expect(unavailable.locator('#projection')).toHaveValue('xz');
        await nearCell(unavailable, 'X', 36863 / 65535 * 4 - 2);
        await unavailable.locator('#projection').selectOption('iso');
        await expect(unavailable.locator('#projection')).toHaveValue('iso');
        await nearCell(unavailable, 'X', 36863 / 65535 * 4 - 2);
        await finiteDrawing(unavailable); await documentFits(unavailable);
        await info.attach('parameter-geometry-webgl-fallback.json', { body: JSON.stringify({
          lost, unavailable: await threeLifecycle(unavailable), locale: await unavailable.locator('html').getAttribute('lang'),
        }, null, 2), contentType: 'application/json' });
      } finally { await unavailable.close(); }
      expect(errors).toEqual([]);
    });
});

hostedTest('parameter details open the localized interactive guide without device activation / 参数详情打开本地图解而不启用设备',
  { tag: ['@osc', '@i18n', '@config'] }, async ({ page, rig }) => {
    await mode(page, 'OSC');
    const path = 'OGB/Orf/GeometryGuide/PenOthersNewRoot';
    await rig.send([[path, .51]]);
    await oscWorkspace(page, '参数');
    await expect(page.getByRole('button', { name: path, exact: true })).toBeVisible();
    const before = rig.commands.filter(command => command.method !== 'GET').length;
    for (const locale of ['zh-CN', 'en-US']) {
      await page.getByLabel('Language / 语言', { exact: true }).selectOption(locale);
      await page.getByRole('button', { name: path, exact: true }).click();
      const dialog = page.getByRole('dialog', { name: await text(page, '参数含义'), exact: true });
      const link = dialog.getByRole('link', { name: await text(page, '交互参数图解'), exact: true });
      await expect(link).toHaveAttribute('href', '/docs/parameter-geometry.html?lang=' + locale);
      await expect(link).toHaveAttribute('target', '_blank');
      const popupPromise = page.context().waitForEvent('page');
      await link.click();
      const popup = await popupPromise;
      try {
        await popup.waitForLoadState('domcontentloaded');
        await expect(popup).toHaveURL(new URL('/docs/parameter-geometry.html?lang=' + locale, rig.baseUrl).href);
        await expect(popup.locator('html')).toHaveAttribute('lang', locale);
        await nearCell(popup, 'PenOthersNewRoot', .66);
        await nearCell(popup, 'PenOthersNewTip', .85);
        await expect(popup.locator('#reference-link')).toHaveAttribute('href',
          'https://github.com/SeaLoong/Sensa/blob/main/docs/osc-parameters' + (locale === 'en-US' ? '.en' : '') + '.md');
      } finally { await popup.close(); }
      await dialog.locator('.modal__actions').getByRole('button', { name: await text(page, '关闭'), exact: true }).click();
    }
    expect((await rig.overview()).runtime.inputActive).toBe(false);
    expect(rig.wire.udp).toEqual([]);
    expect(rig.commands.filter(command => command.method !== 'GET')).toHaveLength(before);
  });

threeTest('SDK Contact diagrams expose native metre vectors, independent velocity and contact loss / SDK Contact 图解展示原生米制向量、独立速度及接触离开',
  { tag: ['@osc', '@config', '@i18n'] }, async ({ page }, info) => {
    const url = new URL(guideFile); url.searchParams.set('lang', 'zh-CN');
    await page.goto(url.href); await chooseScene(page, 'contact-sdk');
    await expect(page.locator('#scene-title')).toHaveText('Contact 直接定位（SDK Beta）');
    await addressPattern(page, 'contact-sdk');
    const names = ['Proximity', 'Proximity_ProximitySpeed', 'Proximity_SenderLocalPositionX',
      'Proximity_SenderLocalPositionY', 'Proximity_SenderLocalPositionZ', 'Proximity_SenderType',
      'Proximity_SenderVelocityMagnitude', 'Proximity_SenderVelocityX', 'Proximity_SenderVelocityY',
      'Proximity_SenderVelocityZ', 'Radius', 'Sample'];
    expect(await page.locator('#values tr').evaluateAll(rows => rows.map(row => row.dataset.name))).toEqual(names);
    await setRange(page, 'x', -.25); await setRange(page, 'y', 1); await setRange(page, 'z', .15);
    await setRange(page, 'vx', .3); await setRange(page, 'vy', .4); await setRange(page, 'vz', 0);
    await nearCell(page, 'Proximity_SenderLocalPositionX', -.25);
    await nearCell(page, 'Proximity_SenderVelocityMagnitude', .5);
    await nearCell(page, 'Proximity_SenderType', 1);
    await parameter(page, 'Proximity_SenderLocalPositionX').getByRole('button').click();
    await expect(page.locator('#parameter-meaning')).toContainText('米');
    await parameter(page, 'Proximity_SenderVelocityMagnitude').getByRole('button').click();
    await expect(page.locator('#parameter-meaning')).toContainText('m/s');
    await page.locator('#locale').selectOption('en-US');
    await expect(page.locator('#scene-title')).toHaveText('Contact direct tracking (SDK Beta)');
    await expect(page.locator('#parameter-meaning')).toContainText('m/s');
    await setRange(page, 'x', 0); await setRange(page, 'y', 0); await setRange(page, 'z', 0);
    await setRange(page, 'vx', 0); await setRange(page, 'vy', 0);
    await nearCell(page, 'Proximity_SenderType', 1);
    await nearCell(page, 'Proximity_SenderVelocityMagnitude', 0);
    await expect(page.locator('#validity')).toHaveAttribute('data-valid', 'true');
    await setRange(page, 'x', 2); await setRange(page, 'y', 1);
    await nearCell(page, 'Proximity', 0); await nearCell(page, 'Proximity_SenderType', 0);
    await expect(page.locator('#validity')).toHaveAttribute('data-valid', 'false');
    await nearCell(page, 'Proximity_SenderLocalPositionX', 0);
    await setRange(page, 'x', 0); await setRange(page, 'y', 1);
    await setRange(page, 'ageMs', 1100);
    await nearCell(page, 'Proximity_SenderType', 1);
    await expect(page.locator('#validity')).toHaveAttribute('data-valid', 'false');
    await finiteDrawing(page); await documentFits(page);
    await info.attach('contact-guide-simulation.json', { body: JSON.stringify({
      fixtureOnly: true, sdkClientExecution: false, fields: names, zeroOriginValid: true,
      zeroVelocityValid: true, lossType: 0, positionUnits: 'm', velocityUnits: 'm/s',
      frozenActivityMs: 1100, independentPositionVelocity: true,
    }), contentType: 'application/json' });
  });
