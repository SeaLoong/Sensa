import { test, expect } from '@playwright/test';
import { test as hostedTest, mode, oscWorkspace, text } from './fixtures.js';

const guideFile = new URL('../../docs/parameter-geometry.html', import.meta.url);
const goldenScenes = ['socket-modern', 'socket-legacy', 'plug-touch', 'sensa-sps', 'shader'];
const scenarioIds = ['socket-modern', 'socket-legacy', 'plug-depth', 'socket-touch', 'plug-touch',
  'socket-frot', 'plug-frot', 'zone', 'sensa-sps', 'shader'];

const parameter = (page, name) => page.locator('#values tr').filter({
  has: page.getByRole('button', { name, exact: true }),
});
async function chooseScene(page, scenario) {
  await page.locator('#scene').selectOption(scenario);
  await expect(page.locator('#scene')).toHaveValue(scenario);
  await page.locator('#reset').click();
}
async function setRange(page, name, value) {
  const control = page.locator('#control-' + name);
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
  const evidence = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    svg: (() => { const box = document.querySelector('#diagram').getBoundingClientRect(); return { left: box.left, right: box.right }; })(),
  }));
  expect(evidence.document, 'No document horizontal overflow / 文档无横向溢出').toBeLessThanOrEqual(evidence.viewport + 1);
  expect(evidence.svg.left).toBeGreaterThanOrEqual(-1);
  expect(evidence.svg.right).toBeLessThanOrEqual(evidence.viewport + 1);
  return evidence;
}

test('offline parameter geometry renders, responds and preserves bilingual state / 离线参数几何图解、交互与双语状态',
  { tag: ['@visual', '@i18n', '@config'] }, async ({ page }, info) => {
    const remoteRequests = [], sockets = [], errors = [];
    page.on('request', request => { if (/^(?:https?|wss?):/.test(request.url())) remoteRequests.push(request.url()); });
    page.on('websocket', socket => sockets.push(socket.url()));
    page.on('pageerror', error => errors.push(error.message));
    const fileUrl = new URL(guideFile);
    fileUrl.searchParams.set('lang', 'zh-CN');
    await page.goto(fileUrl.href);
    await expect(page.locator('#scene')).toBeVisible();
    await expect(page.locator('#scene option')).toHaveCount(10);
    expect(await page.locator('#scene option').evaluateAll(options => options.map(option => option.value))).toEqual(scenarioIds);
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');

    // Independent distances: R=1, root r=.01, length-sphere r=.2, centre distance=.5.
    // 独立预期：接收球1、根球.01、长度球.2、中心距.5。
    await chooseScene(page, 'socket-modern');
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
    await page.locator('#projection').selectOption('iso');
    await page.locator('#show-dimensions').uncheck();
    await page.locator('#locale').selectOption('en-US');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
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
    const anchors = [[-.5, .5, -.5], [.5, .5, .5], [.5, 1.5, -.5], [-.5, 1.5, .5]];
    for (let i = 0; i < anchors.length; i++) {
      const [x, y, z] = anchors[i];
      await nearCell(page, 'P' + i, 1 - (Math.hypot(.02 - x, 1 - y, .15 - z) - .001) / 2.5);
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
    await expect(page.locator('#diagram [data-shape-id^="receiver-"]')).toHaveCount(0);
    await expect(page.locator('#diagram [data-shape-id^="sender-"]')).toHaveCount(0);
    await nearCell(page, 'Valid', 1);
    await expect(page.locator('#validity')).toHaveAttribute('data-valid', 'true');
    await expect(page.locator('#bit-grid rect')).toHaveCount(128);
    await setRange(page, 'x', -1.5); await setRange(page, 'y', -.5); await setRange(page, 'z', -1.5);
    await setRange(page, 'frame', 0);
    const bitCells = await page.locator('#bit-grid rect').evaluateAll(cells => cells.map(cell => ({
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
      expect(cell.x).toBe(cell.byte * 20);
      expect(cell.y).toBe((7 - cell.bit) * 20);
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
        await page.locator('#projection').selectOption('xz');
        await finiteDrawing(page); await documentFits(page);
        await page.evaluate(() => document.fonts.ready);
        await page.mouse.move(0, 0);
        await expect(page).toHaveScreenshot('parameter-geometry-' + scenario + '-' + locale + '.png', { fullPage: true });
      }
    }

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
