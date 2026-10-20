import { test, expect } from '@playwright/test';
import { test as hostedTest, mode, oscWorkspace, text } from './fixtures.js';

const guideFile = new URL('../../docs/parameter-geometry.html', import.meta.url);
const goldenScenes = ['socket-modern', 'socket-legacy', 'plug-touch', 'sensa-sps', 'shader'];
const scenarioIds = ['socket-modern', 'socket-legacy', 'plug-depth', 'socket-touch', 'plug-touch',
  'socket-frot', 'plug-frot', 'zone', 'sensa-sps', 'shader'];

const parameter = (page, name) => page.locator('#values tr').filter({
  has: page.getByRole('button', { name, exact: true }),
});
async function chooseScene(page, scenario, projection = 'xz') {
  await page.locator('#scene').selectOption(scenario);
  await expect(page.locator('#scene')).toHaveValue(scenario);
  await page.locator('#reset').click();
  // Existing 2D contracts stay explicit when spatial scenes default to 3D.
  // 空间场景默认三维后，既有二维契约仍明确选择自身投影。
  await page.locator('#projection').selectOption(projection);
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
function expectSpsObjects(snapshot, point = { x: .02, y: 1, z: .15 }) {
  const anchors = [[-.5, .5, -.5], [.5, .5, .5], [.5, 1.5, -.5], [-.5, 1.5, .5]];
  expect(snapshot.objects.filter(object => object.role === 'receiver')).toHaveLength(4);
  anchors.forEach(([x, y, z], index) => {
    const object = snapshot.objects.find(item => item.id === 'receiver-P' + index);
    expect(object.geometry.type).toBe('SphereGeometry');
    expect(object.geometry.parameters.radius).toBe(2.5);
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
  return { ...layout, labels, canvas: box };
}

// A separate worker fixture pool preserves Playwright's built-in page/trace/video lifecycle.
// 独立 worker fixture pool 保留内置 page／trace／video 生命周期，旧测试不继承软件 WebGL 参数。
const threeTest = test.extend({
  launchOptions: [{ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }, { scope: 'worker', option: true }],
});

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
      const initial = await threeSnapshot(page), initialUi = await uiGeometry(page);
      expectSpsObjects(initial);
      expect(initial.renderer.contextLost).toBe(false);
      expect(initial.lifecycle.live).toBe(1);
      const originalPixels = await canvasPixels(page);
      const canvas = page.locator('#three-scene canvas');
      await canvas.scrollIntoViewIfNeeded();
      const area = await canvas.boundingBox();
      await page.mouse.move(area.x + area.width * .55, area.y + area.height * .45);
      await page.mouse.down();
      await page.mouse.move(area.x + area.width * .55 + 22, area.y + area.height * .45 + 13, { steps: 4 });
      await page.mouse.move(area.x + area.width * .55 + 40, area.y + area.height * .45 + 24, { steps: 4 });
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
      expect(maximumDifference(cameraVector(reset.camera), cameraVector(initial.camera))).toBeLessThan(1e-8);
      expect(await uiGeometry(page)).toEqual(initialUi);
      const resetPixels = await canvasPixels(page);
      expect(maximumDifference(resetPixels.signature, originalPixels.signature)).toBeLessThan(1);

      await setRange(page, 'x', .2); await setRange(page, 'y', 1.2); await setRange(page, 'z', -.1);
      const moved = await threeSnapshot(page);
      expectSpsObjects(moved, { x: .2, y: 1.2, z: -.1 });
      expect(maximumDifference(cameraVector(moved.camera), cameraVector(reset.camera))).toBeLessThan(1e-8);
      for (const [index, anchor] of [[0, [-.5, .5, -.5]], [1, [.5, .5, .5]], [2, [.5, 1.5, -.5]], [3, [-.5, 1.5, .5]]])
        await nearCell(page, 'P' + index, 1 - (Math.hypot(.2 - anchor[0], 1.2 - anchor[1], -.1 - anchor[2]) - .001) / 2.5);

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
          expect(box.geometry.bounds.max[axis] - box.geometry.bounds.min[axis]).toBeCloseTo(3, 8);
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
      const decoded = { x: 38229 / 65535 * 3 - 1.5, y: 1 + 38229 / 65535 * 3 - 1.5, z: 27306 / 65535 * 3 - 1.5 };
      expectWorldPosition(shader.markers.find(marker => marker.id === 'moving-root'), { x: .25, y: 1.25, z: -.25 });
      expectWorldPosition(shader.markers.find(marker => marker.id === 'decoded-root'), decoded);
      for (const axis of ['X', 'Y', 'Z']) await nearCell(page, axis, decoded[axis.toLowerCase()]);

      const evidence = [];
      for (const locale of ['zh-CN', 'en-US']) {
        await page.locator('#locale').selectOption(locale);
        for (const scenario of ['sensa-sps', 'shader']) {
          await readyOrbit(page, scenario);
          const pixels = await canvasPixels(page), layout = await orbitLayout(page);
          await page.evaluate(() => document.fonts.ready); await page.mouse.move(0, 0);
          await expect(page).toHaveScreenshot('parameter-geometry-' + scenario + '-orbit-' + locale + '.png', { fullPage: true });
          evidence.push({ locale, scenario, layout, pixels, three: await threeSnapshot(page) });
        }
      }
      await page.setViewportSize({ width: 320, height: 844 });
      for (const locale of ['zh-CN', 'en-US']) {
        await page.locator('#locale').selectOption(locale);
        for (const scenario of ['sensa-sps', 'shader']) {
          await readyOrbit(page, scenario);
          evidence.push({ locale, scenario, reflow: true, layout: await orbitLayout(page), pixels: await canvasPixels(page) });
        }
      }
      await info.attach('parameter-geometry-webgl.json', { body: JSON.stringify({ initial, initialPixels: originalPixels,
        camera: { pointer: draggedCamera, keyboard: keyedCamera, wheel: wheeledCamera, button: buttonCamera, reset: reset.camera },
        cycles: cycleEvidence, views: evidence }, null, 2), contentType: 'application/json' });
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
      await nearCell(page, 'P0', 1 - (Math.hypot(.02 + .5, 1 - .5, .25 + .5) - .001) / 2.5);
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
        await setRange(unavailable, 'x', .25); await nearCell(unavailable, 'X', 38229 / 65535 * 3 - 1.5);
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
        await nearCell(unavailable, 'X', 38229 / 65535 * 3 - 1.5);
        await unavailable.locator('#projection').selectOption('iso');
        await expect(unavailable.locator('#projection')).toHaveValue('iso');
        await nearCell(unavailable, 'X', 38229 / 65535 * 3 - 1.5);
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
