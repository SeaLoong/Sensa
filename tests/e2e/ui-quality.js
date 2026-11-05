import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const safeName = value => String(value).replace(/[^a-z0-9-]+/gi, '-');
const cell = value => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
const sources = [
  'https://playwright.dev/docs/accessibility-testing',
  'https://github.com/dequelabs/axe-core/blob/develop/doc/API.md',
  'https://www.w3.org/WAI/WCAG22/Understanding/reflow.html',
  'https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html',
];
function requireCi() {
  if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('Browser quality audits are CI-only / 浏览器质量检查仅在 CI 执行');
}
function ruleLines(rule) {
  return [
    '- **' + cell(rule.id) + '** (' + cell(rule.impact || 'review') + '): ' + cell(rule.help),
    '  - ' + rule.helpUrl,
    ...rule.nodes.flatMap(node => [
      '  - Target / 目标: ' + cell(JSON.stringify(node.target)),
      '  - Evidence / 证据: ' + cell(node.failureSummary || node.any?.map(check => check.message).join('; ') || 'See raw JSON / 见原始 JSON'),
    ]),
  ];
}

async function attachIncompleteEvidence(page, info, state, incomplete) {
  requireCi();
  const prefix = 'incomplete-' + safeName(state);
  const evidence = { timing: 'after-analyze-non-atomic', sampledAt: new Date().toISOString(),
    viewport: page.viewportSize(), url: page.url(), nodes: [], errors: [] };
  for (const rule of incomplete) {
    for (const node of rule.nodes) {
      const entry = { rule: rule.id, target: node.target };
      evidence.nodes.push(entry);
      try {
        if (!Array.isArray(node.target) || node.target.length !== 1 || typeof node.target[0] !== 'string')
          throw new Error('Cannot resolve compound, frame or shadow target / 无法定位复合、frame 或 shadow 目标');
        const matches = await page.locator(node.target[0]).evaluateAll(elements => elements.map(element => {
          const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
          let scroll = element.closest('.table-scroll, .log-list, .modal__body, dialog[open], .workspace-scroll');
          if (!scroll) {
            let ancestor = element.parentElement;
            while (ancestor) {
              const overflow = getComputedStyle(ancestor);
              if (/auto|scroll/.test(overflow.overflowX + overflow.overflowY)) { scroll = ancestor; break; }
              ancestor = ancestor.parentElement;
            }
          }
          const scrollStyle = scroll ? getComputedStyle(scroll) : null;
          const workspace = element.closest('.workspace-scroll'), workspaceBox = workspace?.getBoundingClientRect();
          return {
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
              top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left },
            computed: { color: style.color, backgroundColor: style.backgroundColor, fontFamily: style.fontFamily,
              fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight,
              opacity: style.opacity, visibility: style.visibility, position: style.position, zIndex: style.zIndex },
            scrollRegion: scroll ? {
              tag: scroll.tagName.toLowerCase(), id: scroll.id,
              label: scroll.getAttribute('aria-label') || scroll.getAttribute('aria-labelledby'),
              scrollLeft: scroll.scrollLeft, scrollTop: scroll.scrollTop,
              clientWidth: scroll.clientWidth, clientHeight: scroll.clientHeight,
              scrollWidth: scroll.scrollWidth, scrollHeight: scroll.scrollHeight,
              overflowX: scrollStyle.overflowX, overflowY: scrollStyle.overflowY,
            } : null,
            workspaceScroll: workspace ? { top: workspaceBox.top, bottom: workspaceBox.bottom, left: workspaceBox.left,
              right: workspaceBox.right, scrollTop: workspace.scrollTop, scrollLeft: workspace.scrollLeft,
              clientWidth: workspace.clientWidth, clientHeight: workspace.clientHeight,
              scrollWidth: workspace.scrollWidth, scrollHeight: workspace.scrollHeight } : null,
            documentScroll: { x: scrollX, y: scrollY }, viewport: { width: innerWidth, height: innerHeight },
          };
        }));
        if (!matches.length) throw new Error('Target is absent after analysis / 分析后已找不到目标');
        entry.matches = matches;
      } catch (error) { entry.error = error?.message || String(error); }
    }
  }
  const references = { timing: evidence.timing, errors: evidence.errors };
  try {
    const screenshot = await page.screenshot({ fullPage: false });
    references.screenshotAttachment = prefix + '-viewport.png';
    evidence.screenshotTakenAt = new Date().toISOString();
    await info.attach(references.screenshotAttachment, { body: screenshot, contentType: 'image/png' });
  } catch (error) { evidence.errors.push({ operation: 'viewport-screenshot', message: error?.message || String(error) }); }
  try {
    references.detailsAttachment = prefix + '-nodes.json';
    await info.attach(references.detailsAttachment, { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
  } catch (error) { evidence.errors.push({ operation: 'node-evidence-attachment', message: error?.message || String(error) }); }
  references.unresolvedTargets = evidence.nodes.filter(node => node.error).map(node => ({ rule: node.rule, target: node.target, error: node.error }));
  return references;
}

// Each state keeps the complete axe result, including incomplete node/check evidence.
// 每个状态保留完整 axe 结果，包括 incomplete 的节点与检查证据。
export function createUiQualityReport(page, info, { kind, plannedStates = [], plannedChecks = [] }) {
  requireCi();
  const report = {
    schema: 'sensa.automated-ui-floor.v1',
    scope: 'automated-accessibility-and-behavior-floor',
    commit: process.env.GITHUB_SHA || null,
    runId: process.env.GITHUB_RUN_ID || null,
    project: info.project.name,
    test: info.title,
    kind,
    retry: info.retry,
    createdAt: new Date().toISOString(),
    rules: { tags: WCAG_TAGS, disabledRules: [], excludedSelectors: [] },
    plannedStates,
    plannedChecks,
    states: [],
    checks: [],
    fatalErrors: [],
    testErrors: [],
    limitations: [
      'This floor does not score visual beauty or communication. VisAWI constructs, grouping, hierarchy, typography, rhythm and color require human visual review. / 本底线不评美观或视觉传达；VisAWI 构念、分组层级、字体节奏与颜色体系需要人工视觉审阅。',
      'Automated WCAG-related checks are not a conformance certificate. / 自动 WCAG 相关检查不构成合规认证。',
      'Incomplete results require manual review; zero violations is not a manual pass. / incomplete 需人工审阅；零已检测违规不等于人工验收通过。',
      'Keyboard and 320 CSS px checks sample current browser behavior, not every assistive technology or actual browser zoom. / 键盘和 320 CSS px 检查仅抽测当前浏览器，不覆盖全部辅助技术或真实浏览器缩放。',
      'Target sizes sample basic component hit areas; WCAG exceptions and all content still need review. / 命中尺寸仅抽检基础组件，WCAG 例外与其余内容仍需人工判断。',
    ],
    sources,
  };
  const onPageError = error => report.fatalErrors.push({ source: 'pageerror', name: error.name, message: error.message, stack: error.stack || null });
  page.on('pageerror', onPageError);
  const context = async () => ({
    locale: await page.locator('html').getAttribute('lang'),
    viewport: page.viewportSize(),
    url: page.url(),
  });
  return {
    fail(error) {
      report.fatalErrors.push({ name: error?.name || 'Error', message: error?.message || String(error), stack: error?.stack || null });
    },
    async audit(state) {
      requireCi();
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      const entry = {
        state, ...await context(),
        status: results.violations.length ? 'violations-detected' : results.incomplete.length ? 'needs-manual-review' : 'no-detected-violations',
        engine: results.testEngine,
        violations: results.violations,
        incomplete: results.incomplete,
        results,
      };
      report.states.push(entry);
      if (results.incomplete.length) {
        try { entry.reviewEvidence = await attachIncompleteEvidence(page, info, state, results.incomplete); }
        catch (error) { entry.reviewEvidence = { timing: 'after-analyze-non-atomic', errors: [{ operation: 'review-evidence', message: error?.message || String(error) }] }; }
      }
      expect.soft(results.violations, state + ': automatically detected WCAG violations / 自动检测到的 WCAG 违规').toEqual([]);
      return entry;
    },
    async check(name, inspect) {
      requireCi();
      const entry = { id: name.split(' / ')[0], name, ...await context() };
      try {
        entry.evidence = await inspect();
        entry.status = 'passed';
      } catch (error) {
        entry.status = 'failed';
        entry.error = { name: error?.name || 'Error', message: error?.message || String(error) };
        if (error?.geometryEvidence) entry.evidence = error.geometryEvidence;
        throw error;
      } finally { report.checks.push(entry); }
    },
    async write() {
      requireCi();
      const locale = await page.locator('html').getAttribute('lang').catch(() => 'unknown');
      const filename = [info.project.name, locale, kind, 'retry' + info.retry].map(safeName).join('-');
      const directory = path.resolve('artifacts/e2e/ui-quality');
      await mkdir(directory, { recursive: true });
      report.missingStates = plannedStates.filter(state => !report.states.some(entry => entry.state === state));
      report.missingChecks = plannedChecks.filter(id => !report.checks.some(entry => entry.id === id));
      report.testErrors = info.errors.map(error => ({ message: error.message || String(error), stack: error.stack || null }));
      report.status = report.fatalErrors.length || report.testErrors.length || report.missingStates.length || report.missingChecks.length
        || report.states.some(state => state.violations.length) || report.checks.some(check => check.status === 'failed')
        ? 'failed' : report.states.some(state => state.incomplete.length) ? 'needs-manual-review' : 'no-detected-floor-failures';
      const lines = [
        '# Automated accessibility and behavior floor / 自动可检的无障碍与行为底线', '',
        '- Status / 状态: **' + report.status + '**',
        '- Project / 项目: ' + report.project,
        '- Locale / 语言: ' + locale,
        '- Commit / 提交: ' + (report.commit || 'unknown'),
        '- Tags / 规则标签: ' + WCAG_TAGS.join(', '),
        '- Disabled rules / 禁用规则: none / 无',
        '- Excluded selectors / 排除节点: none / 无', '',
        ...report.limitations.map(note => '- ' + note), '',
        '## Scanned states / 已扫描状态', '',
        '| State / 状态 | Locale / 语言 | Viewport / 视口 | Result / 结果 | Violations / 违规 | Incomplete / 待审阅 |',
        '| --- | --- | --- | --- | --- | --- |',
        ...report.states.map(state => '| ' + [state.state, state.locale, JSON.stringify(state.viewport), state.status, state.violations.length, state.incomplete.length].map(cell).join(' | ') + ' |'),
        '', '- Missing planned states / 未执行计划状态: ' + (report.missingStates.join(', ') || 'none / 无'),
        '- Missing planned checks / 未执行计划检查: ' + (report.missingChecks.join(', ') || 'none / 无'), '',
        '## Execution errors / 执行异常', '',
        ...report.fatalErrors.map(error => '- **' + cell(error.name) + '** ' + cell(error.message)),
        ...report.testErrors.map(error => '- Playwright: ' + cell(error.message)), '',
        '## Behavioral checks / 行为检查', '',
        ...report.checks.map(check => '- **' + check.status + '** ' + cell(check.name) + (check.error ? ': ' + cell(check.error.message) : '')), '',
        '## Rule evidence requiring action or review / 需处理或人工审阅的规则证据', '',
        ...report.states.flatMap(state => [
          '### ' + state.state, '',
          '- URL: ' + state.url,
          '- Engine / 引擎: ' + JSON.stringify(state.engine),
          '- Review evidence / 审阅证据: ' + JSON.stringify(state.reviewEvidence || null),
          '- Incomplete evidence is sampled after analyze and is not an atomic snapshot. / incomplete 现场证据在 analyze 后采样，并非原子快照。', '',
          'Violations / 违规:', ...state.violations.flatMap(ruleLines), '',
          'Incomplete / 待审阅:', ...state.incomplete.flatMap(ruleLines), '',
        ]),
        '## Sources / 依据', '', ...sources.map(source => '- ' + source), '',
        'Complete node HTML, check data, passes and inapplicable results are retained in the JSON attachment. / 完整节点 HTML、检查数据、通过项及不适用项保留在 JSON 附件。',
      ];
      const json = JSON.stringify(report, null, 2) + '\n', markdown = lines.join('\n') + '\n';
      const jsonPath = path.join(directory, filename + '.json'), markdownPath = path.join(directory, filename + '.md');
      await writeFile(jsonPath, json);
      await writeFile(markdownPath, markdown);
      await info.attach(filename + '.json', { path: jsonPath, contentType: 'application/json' });
      await info.attach(filename + '.md', { path: markdownPath, contentType: 'text/markdown' });
      // Persist evidence before failing missing coverage; a partial run cannot be called successful.
      // 先保存证据，再令缺失覆盖失败；不能把不完整执行报告为通过。
      page.off('pageerror', onPageError);
      expect.soft(report.missingStates, 'Every planned audit ran / 全部计划扫描已执行').toEqual([]);
      expect.soft(report.missingChecks, 'Every planned behavior check ran / 全部计划行为检查已执行').toEqual([]);
      expect.soft(report.fatalErrors, 'No unreported execution failure / 无遗漏执行异常').toEqual([]);
      return report;
    },
  };
}

export async function inspectReflow(page) {
  requireCi();
  const evidence = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const port = document.querySelector('.workspace-scroll'), header = document.querySelector('.app-header');
    const portBox = port?.getBoundingClientRect(), headerBox = header?.getBoundingClientRect();
    const workspace = port ? { top: portBox.top, bottom: portBox.bottom, width: port.clientWidth, height: port.clientHeight,
      scrollWidth: port.scrollWidth, scrollHeight: port.scrollHeight, scrollTop: port.scrollTop, scrollLeft: port.scrollLeft } : null;
    const documentHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    const scrollRegions = [...document.querySelectorAll('.table-scroll, .log-list, dialog[open], dialog[open] .modal__body, .workspace-scroll')].map(element => ({
      role: element.getAttribute('role') || element.tagName.toLowerCase(),
      kind: element.matches('.modal__body') ? 'dialog-body' : null,
      label: element.getAttribute('aria-label') || element.getAttribute('aria-labelledby'),
      clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
      clientHeight: element.clientHeight, scrollHeight: element.scrollHeight,
    }));
    return { width, scrollWidth, height: innerHeight, documentHeight, scrollRegions, workspace,
      headerBottom: headerBox?.bottom ?? null };
  });
  expect(evidence.width).toBe(320);
  expect(evidence.scrollWidth, 'Page reflows at 320 CSS px / 页面在 320 CSS px 重排').toBeLessThanOrEqual(321);
  expect(evidence.workspace, 'Main scrollport exists / 正文滚动区域存在').not.toBeNull();
  expect(evidence.workspace.height).toBeGreaterThan(0);
  expect(evidence.workspace.scrollWidth, 'Workspace reflows without horizontal scrolling / 正文无水平滚动').toBeLessThanOrEqual(evidence.workspace.width + 1);
  expect(evidence.documentHeight, 'Document does not scroll behind the header / 文档不在顶栏下滚动').toBeLessThanOrEqual(evidence.height + 1);
  expect(evidence.workspace.top).toBeGreaterThanOrEqual(evidence.headerBottom - 1);
  expect(evidence.workspace.bottom).toBeLessThanOrEqual(evidence.height + 1);
  for (const region of evidence.scrollRegions.filter(candidate => candidate.role === 'dialog'))
    expect(region.scrollWidth, 'Dialog reflows without horizontal scrolling / 对话框无水平滚动').toBeLessThanOrEqual(region.clientWidth + 1);
  for (const region of evidence.scrollRegions.filter(candidate => candidate.kind === 'dialog-body')) {
    expect(region.clientHeight, 'Dialog body retains a usable scrollport / 对话框正文有可用滚动区域').toBeGreaterThan(0);
    expect(region.scrollWidth, 'Dialog body reflows without horizontal scrolling / 对话框正文无水平滚动').toBeLessThanOrEqual(region.clientWidth + 1);
  }
  return evidence;
}

/** Check the visible dialog frame independently of the content's scroll position. */
export async function inspectModalFrame(dialog) {
  requireCi();
  const evidence = await dialog.evaluate(element => {
    const read = node => {
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return { top: box.top, right: box.right, bottom: box.bottom, left: box.left,
        width: box.width, height: box.height, clientWidth: node.clientWidth, clientHeight: node.clientHeight,
        scrollWidth: node.scrollWidth, scrollHeight: node.scrollHeight, scrollTop: node.scrollTop };
    };
    const body = element.querySelector('.modal__body'), focused = element.ownerDocument.activeElement;
    return { dialog: read(element), header: read(element.querySelector('.modal__header')),
      body: read(body), footer: read(element.querySelector('.modal__actions')),
      viewport: { width: innerWidth, height: innerHeight },
      focused: body?.contains(focused) ? read(focused) : null };
  });
  return geometricEvidence(evidence, () => {
    const { dialog: frame, header, body, footer, viewport } = evidence;
    for (const [name, box] of Object.entries({ frame, header, body, footer })) {
      expect(box, name + ' exists / 对话框区域存在').not.toBeNull();
      expect(box.width, name + ' has usable width / 对话框区域有可用宽度').toBeGreaterThan(0);
      expect(box.height, name + ' has usable height / 对话框区域有可用高度').toBeGreaterThan(0);
    }
    expect(frame.left).toBeGreaterThanOrEqual(-1);
    expect(frame.right).toBeLessThanOrEqual(viewport.width + 1);
    expect(frame.top).toBeGreaterThanOrEqual(-1);
    expect(frame.bottom).toBeLessThanOrEqual(viewport.height + 1);
    for (const box of [header, body, footer]) contained(box, frame, 1, 'Dialog frame contains its regions / 对话框完整容纳各区域');
    expect(header.bottom, 'Body starts below header / 正文位于标题栏下方').toBeLessThanOrEqual(body.top + 1);
    expect(body.bottom, 'Body ends above actions / 正文不被操作栏覆盖').toBeLessThanOrEqual(footer.top + 1);
    expect(frame.scrollTop, 'Only the dialog body scrolls / 只有正文滚动').toBe(0);
    expect(frame.scrollHeight, 'Dialog frame does not need vertical scrolling / 对话框外框无需垂直滚动').toBeLessThanOrEqual(frame.clientHeight + 1);
    expect(body.scrollWidth, 'Dialog body has no horizontal overflow / 对话框正文无水平溢出').toBeLessThanOrEqual(body.clientWidth + 1);
  });
}

export async function inspectBasicTargets(page, locator, component) {
  requireCi();
  const evidence = await locator.evaluateAll(elements => elements.filter(element => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && !element.disabled;
  }).map(element => {
    const rect = element.getBoundingClientRect();
    return {
      tag: element.tagName.toLowerCase(),
      text: (element.getAttribute('aria-label') || element.textContent || '').trim().slice(0, 120),
      width: rect.width, height: rect.height,
    };
  }));
  expect(evidence.length, component + ': at least one visible sample / 至少一个可见样本').toBeGreaterThan(0);
  const undersized = evidence.filter(target => target.width < 24 || target.height < 24);
  expect(undersized, component + ': sampled hit areas are at least 24 CSS px / 抽测命中区域至少 24 CSS px').toEqual([]);
  return { component, minimumCssPx: 24, samples: evidence };
}

// Geometric contracts describe shared edges and containment, not an aesthetic score or CSS recipe.
// 几何契约检查共享边缘与完整容纳，不是美观分数，也不限定 CSS 实现。
async function geometryGroups(locator, selectors) {
  requireCi();
  return locator.evaluateAll((elements, parts) => {
    const read = element => {
      const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
      const range = document.createRange(); range.selectNodeContents(element);
      const text = range.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
        width: rect.width, height: rect.height, fontSize: parseFloat(style.fontSize),
        textBottom: text.height ? text.bottom : rect.bottom,
        textBox: text.height ? { left: text.left, right: text.right, top: text.top, bottom: text.bottom }
          : { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
        clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
        visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' };
    };
    return elements.map(element => ({ box: read(element), parts: Object.fromEntries(
      Object.entries(parts).map(([key, selector]) => [key, [...element.querySelectorAll(selector)].map(read)])),
    })).filter(group => group.box.visible);
  }, selectors);
}
function only(group, part) {
  expect(group.parts[part], 'Exactly one visible ' + part + ' / 唯一可见部件').toHaveLength(1);
  const box = group.parts[part][0];
  expect(box.visible, part + ' is visible / 部件可见').toBe(true);
  return box;
}
function tolerance(boxes) {
  // Font-relative slack only absorbs browser subpixel and font metric rounding.
  // 字体相关容差仅吸收浏览器亚像素与字体度量舍入。
  return Math.max(1, Math.min(...boxes.map(box => box.fontSize || 12)) * .2);
}
function near(values, slack, message) {
  expect(Math.max(...values) - Math.min(...values), message).toBeLessThanOrEqual(slack);
}
function contained(child, parent, slack, message) {
  expect(child.left, message).toBeGreaterThanOrEqual(parent.left - slack);
  expect(child.right, message).toBeLessThanOrEqual(parent.right + slack);
  expect(child.top, message).toBeGreaterThanOrEqual(parent.top - slack);
  expect(child.bottom, message).toBeLessThanOrEqual(parent.bottom + slack);
}
function separate(a, b, slack, message) {
  const overlapsX = Math.min(a.right, b.right) - Math.max(a.left, b.left) > slack;
  const overlapsY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > slack;
  expect(overlapsX && overlapsY, message).toBe(false);
}
function geometricEvidence(evidence, verify) {
  try { verify(); } catch (error) { error.geometryEvidence = evidence; throw error; }
  return evidence;
}

export async function inspectManualAlignment(page, layout) {
  const groups = await geometryGroups(page.locator('.manual-primary > .value-field'), {
    label: '.value-field__heading label', number: '.value-field__heading input.number-input',
    slider: '.value-field__controls input[type=range]',
  });
  return geometricEvidence({ layout, groups }, () => {
    expect(groups, 'One primary stroke axis / 一个常用主轴').toHaveLength(1);
    const slack = tolerance(groups.map(group => group.box));
    for (const group of groups) {
      const label = only(group, 'label'), number = only(group, 'number'), slider = only(group, 'slider');
      for (const box of [label, number, slider]) contained(box, group.box, slack, 'Primary axis containment / 主轴控件完整容纳');
      near([(label.top + label.bottom) / 2, (number.top + number.bottom) / 2], slack, 'Title and numeric input share a heading row / 标题与数值输入位于同一标题行');
      separate(label, number, slack, 'Title and numeric input do not overlap / 标题与数值输入不重叠');
      expect(number.bottom, 'Input heading precedes the slider / 数值标题行在滑条上方').toBeLessThanOrEqual(slider.top + slack);
      near([slider.right, number.right], slack, 'Numeric input and full-width slider right edge / 数值输入与全宽滑条右沿');
    }
    if (layout === 'columns') {
      near(groups.map(group => group.box.width), slack, 'Primary axes use equal columns / 主轴等宽列');
      near(groups.map(group => only(group, 'number').bottom), slack, 'Primary numeric input lower edges / 主轴数值输入底沿');
      near(groups.map(group => only(group, 'label').textBottom), slack, 'Primary title baselines / 主轴标题基线');
      near(groups.map(group => only(group, 'slider').top), slack, 'Primary sliders share a row / 主轴滑条同排');
    } else {
      near(groups.map(group => only(group, 'number').right), slack, 'Stacked numeric input right edges / 堆叠输入右沿');
    }
  });
}

export async function inspectMoreAxesAlignment(page, layout) {
  const fields = page.getByTestId('manual-more-axes').locator('.manual-extra-axes > .value-field');
  const groups = await geometryGroups(fields, {
    label: '.value-field__heading label', number: '.value-field__heading input.number-input',
    slider: '.value-field__controls input[type=range]',
  });
  return geometricEvidence({ layout, groups }, () => {
    expect(groups, 'All eleven additional axes remain available / 其余十一个动作轴均可用').toHaveLength(11);
    const slack = tolerance(groups.map(group => group.box));
    for (const group of groups) {
      const label = only(group, 'label'), number = only(group, 'number'), slider = only(group, 'slider');
      for (const box of [label, number, slider]) contained(box, group.box, slack, 'Additional axis containment / 更多轴控件完整容纳');
      near([(label.top + label.bottom) / 2, (number.top + number.bottom) / 2], slack, 'Additional axis heading alignment / 更多轴标题与数值对齐');
      separate(label, number, slack, 'Additional axis title and number do not overlap / 更多轴标题与数值不重叠');
      expect(number.bottom).toBeLessThanOrEqual(slider.top + slack);
      near([slider.right, number.right], slack, 'Additional axis input and slider right edges / 更多轴数值与滑条右沿');
    }
    near(groups.map(group => group.box.width), slack, 'Additional axes use equal widths / 更多轴等宽');
    if (layout === 'columns') {
      for (let start = 0; start < groups.length; start += 3) {
        const row = groups.slice(start, start + 3);
        near(row.map(group => only(group, 'number').bottom), slack, 'Additional axis numbers share a row / 更多轴数值同排');
        near(row.map(group => only(group, 'label').textBottom), slack, 'Additional axis title baselines / 更多轴标题基线');
        near(row.map(group => only(group, 'slider').top), slack, 'Additional axis sliders share a row / 更多轴滑条同排');
      }
    } else near(groups.map(group => only(group, 'number').right), slack, 'Stacked additional axis input right edges / 窄屏更多轴数值右沿');
  });
}

export async function inspectOutputAlignment(page, layout) {
  const groups = await geometryGroups(page.locator('.output-card'), {
    identity: ':scope > .output-identity', target: ':scope > .output-telemetry',
    positions: ':scope > .output-telemetry > .output-position-panel', actions: ':scope > .output-actions',
  });
  return geometricEvidence({ layout, groups }, () => {
    expect(groups, 'Four isolated mock outputs / 四个隔离模拟输出').toHaveLength(4);
    const slack = tolerance(groups.map(group => group.box));
    for (const group of groups) {
      const identity = only(group, 'identity'), target = only(group, 'target'), actions = only(group, 'actions');
      const positions = only(group, 'positions');
      contained(positions, target, slack, 'Output positions stay inside their target column / 轴目标完整容纳于输出目标列');
      for (const box of [identity, target, actions]) contained(box, group.box, slack, 'Output row containment / 输出行完整容纳');
      separate(identity, target, slack, 'Identity and target do not overlap / 名称与目标不重叠');
      separate(target, actions, slack, 'Target and actions do not overlap / 目标与操作不重叠');
      separate(identity, actions, slack, 'Identity and actions do not overlap / 名称与操作不重叠');
      if (layout === 'columns') {
        expect(identity.right).toBeLessThanOrEqual(target.left + slack);
        expect(target.right).toBeLessThanOrEqual(actions.left + slack);
      } else {
        expect(identity.bottom).toBeLessThanOrEqual(target.top + slack);
        expect(target.bottom).toBeLessThanOrEqual(actions.top + slack);
      }
    }
    near(groups.map(group => group.box.left), slack, 'Output row left edges / 输出行左沿');
    near(groups.map(group => group.box.right), slack, 'Output row right edges / 输出行右沿');
    for (const part of ['identity', 'target', 'actions'])
      near(groups.map(group => only(group, part).left), slack, 'Shared output ' + part + ' column / 输出对应列');
  });
}

export async function inspectMappingAlignment(page) {
  const groups = await geometryGroups(page.locator('.mapping-row__main'), {
    path: '.mapping-row__path input, .mapping-row__path select', target: '.mapping-row__target select',
    reverse: ':scope > .toggle', remove: ':scope > button',
  });
  return geometricEvidence({ groups }, () => {
    expect(groups.length, 'At least two saved fixture mappings / 至少两条夹具映射').toBeGreaterThanOrEqual(2);
    for (const group of groups) {
      const source = only(group, 'path'), target = only(group, 'target');
      const reverse = only(group, 'reverse'), remove = only(group, 'remove');
      const slack = tolerance([source, target, reverse, remove]);
      for (const box of [source, target, reverse, remove]) contained(box, group.box, slack, 'Mapping control containment / 映射控件完整容纳');
      near([target.bottom, reverse.bottom, remove.bottom], slack, 'Target, reverse and remove lower edges / 目标、反向与移除底沿');
      separate(target, reverse, slack, 'Mapping target and reverse do not overlap / 映射目标与反向不重叠');
      separate(reverse, remove, slack, 'Mapping reverse and remove do not overlap / 映射反向与移除不重叠');
      separate(source, target, slack, 'Mapping path and target do not overlap / 映射路径与目标不重叠');
    }
  });
}

export async function inspectNarrowFormAlignment(scope) {
  const groups = await geometryGroups(scope.locator('.form-grid > .field'), {
    control: ':scope > input:not([type=checkbox]):not([type=range]), :scope > select, :scope > textarea',
  });
  const columns = await geometryGroups(scope.locator('.form-grid:not(.form-grid--endpoint):not(.form-grid--rate)'), {
    controls: ':scope > .field > input:not([type=checkbox]):not([type=range]), :scope > .field > select, :scope > .field > textarea',
  });
  const endpoints = await geometryGroups(scope.locator('.form-grid--endpoint, .form-grid--rate'), {
    controls: ':scope > .field > input:not([type=checkbox]):not([type=range]), :scope > .field > select',
    toggles: ':scope > .toggle',
  });
  const ranges = await geometryGroups(scope.locator('.range-field'), { labels: '.range-field__inputs > label', inputs: '.range-field__inputs > label > input', names: '.range-field__inputs > label > span' });
  return geometricEvidence({ groups, columns, endpoints, ranges }, () => {
    expect(groups.length, 'At least two comparable form controls / 至少两个可比较表单控件').toBeGreaterThanOrEqual(2);
    const controls = groups.map(group => only(group, 'control'));
    const slack = tolerance(controls);
    for (const group of groups) contained(only(group, 'control'), group.box, slack, 'Form field containment / 表单控件完整容纳');
    // Compare columns within their section: independently padded panels need not share an outer edge.
    // 在各自分组内比较列对齐；独立面板可以具有不同外边缘。
    for (const group of columns) {
      const fields = group.parts.controls.filter(box => box.visible);
      if (!fields.length) continue;
      near(fields.map(box => box.left), slack, 'Single-column form left edges / 单列表单左沿');
      near(fields.map(box => box.right), slack, 'Single-column form right edges / 单列表单右沿');
      for (const control of fields) contained(control, group.box, slack, 'Form column containment / 表单列完整容纳');
    }
    for (const group of endpoints) {
      const fields = group.parts.controls.filter(box => box.visible);
      const toggles = group.parts.toggles.filter(box => box.visible);
      let leading, short;
      if (toggles.length) {
        expect(toggles, 'Rate row contains one toggle / 频率行包含一个开关').toHaveLength(1);
        expect(fields, 'Rate row contains one short field / 频率行包含一个短值字段').toHaveLength(1);
        [leading] = toggles; [short] = fields;
        expect(leading.width, 'Polling toggle has a usable hit area / 轮询开关具有可用命中区域').toBeGreaterThanOrEqual(24);
        expect(leading.height, 'Polling toggle has a usable hit area / 轮询开关具有可用命中区域').toBeGreaterThanOrEqual(24);
      } else {
        expect(fields, 'Endpoint uses an address and a short value / 连接参数包含地址与短值').toHaveLength(2);
        [leading, short] = fields;
        expect(leading.width, 'Address receives at least the short field width / 地址至少获得短值字段宽度').toBeGreaterThanOrEqual(short.width - slack);
      }
      near([leading.bottom, short.bottom], slack, 'Endpoint controls share a row / 连接参数控件同排对齐');
      for (const control of [leading, short]) contained(control, group.box, slack, 'Endpoint control containment / 连接参数完整容纳');
      separate(leading, short, slack, 'Endpoint controls do not overlap / 连接参数控件不重叠');
      expect(short.width, 'Port/rate field remains readable / 端口或频率字段保持可读').toBeGreaterThanOrEqual(80);
      expect(short.width, 'Port/rate field stays compact / 端口或频率字段宽度紧凑').toBeLessThanOrEqual(128);
    }
    expect(ranges.length, 'At least two endpoint ranges / 至少两个端点范围').toBeGreaterThanOrEqual(2);
    for (const group of ranges) {
      expect(group.parts.labels).toHaveLength(2);
      expect(group.parts.inputs).toHaveLength(2);
      expect(group.parts.names).toHaveLength(2);
      near(group.parts.inputs.map(box => box.bottom), slack, 'Range endpoint input lower edges / 范围端点输入底沿');
      near(group.parts.inputs.map(box => box.width), slack, 'Range endpoint input widths / 范围端点输入等宽');
      for (let index = 0; index < 2; index++) {
        const name = group.parts.names[index], input = group.parts.inputs[index], label = group.parts.labels[index];
        expect(name.visible && input.visible).toBe(true);
        expect(name.bottom, 'Endpoint label is above its input / 端点标签在输入上方').toBeLessThanOrEqual(input.top + slack);
        contained(input, label, slack, 'Range endpoint containment / 范围端点完整容纳');
      }
    }
  });
}

export async function assertCalibrationAlignment(page, info) {
  const groups = await geometryGroups(page.locator('.calibration-grid > div'), {
    label: ':scope > strong', value: ':scope > output', action: ':scope > button',
  });
  const evidence = { groups };
  await info.attach('calibration-alignment.json', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
  return geometricEvidence(evidence, () => {
    expect(groups.length, 'Two calibration endpoints and preview / 两个校准端点与预览').toBeGreaterThanOrEqual(3);
    const endpoints = groups.slice(0, 2), slack = tolerance(endpoints.map(group => group.box));
    for (const group of endpoints) {
      const label = only(group, 'label'), value = only(group, 'value'), action = only(group, 'action');
      for (const box of [label, value, action]) contained(box, group.box, slack, 'Calibration endpoint containment / 校准端点完整容纳');
      separate(label, value, slack, 'Calibration label and value do not overlap / 校准标签数值不重叠');
      separate(value, action, slack, 'Calibration value and action do not overlap / 校准数值操作不重叠');
      contained(value.textBox, value, slack, 'Calibration text stays inside its value column / 校准文字完整容纳于数值列');
      expect(value.scrollWidth, 'Calibration text never overflows into its action / 校准文字不溢入操作列').toBeLessThanOrEqual(value.clientWidth + 1);
    }
    const horizontalSteps = Math.abs(endpoints[0].box.top - endpoints[1].box.top) <= slack;
    evidence.layout = horizontalSteps ? 'horizontal-steps' : 'stacked-rows';
    if (horizontalSteps) {
      near(endpoints.map(group => only(group, 'label').textBottom), slack, 'Calibration step label baselines / 校准步骤标签基线');
      near(endpoints.map(group => only(group, 'value').textBottom), slack, 'Calibration step value baselines / 校准步骤数值基线');
      near(endpoints.map(group => only(group, 'action').top), slack, 'Calibration step action rows / 校准步骤操作同排');
    } else {
      for (const part of ['label', 'value', 'action'])
        near(endpoints.map(group => only(group, part).left - group.box.left), slack, 'Fixed calibration ' + part + ' column / 固定校准列');
      const actionsBesideValues = endpoints.every(group => only(group, 'action').left >= only(group, 'value').right - slack);
      if (actionsBesideValues)
        near(endpoints.map(group => only(group, 'action').left - only(group, 'value').left), slack, 'Allocated value columns do not drift with digits / 数字长度不推挤数值列后的操作');
    }
  });
}

export async function inspectFocusIndicator(locator) {
  requireCi();
  const evidence = await locator.evaluate(element => {
    const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
    return { focused: document.activeElement === element, visibleFocus: element.matches(':focus-visible'),
      outlineStyle: style.outlineStyle, outlineWidth: parseFloat(style.outlineWidth), outlineColor: style.outlineColor,
      width: rect.width, height: rect.height, x: rect.x, y: rect.y };
  });
  expect(evidence.focused).toBe(true);
  expect(evidence.visibleFocus).toBe(true);
  expect(evidence.outlineStyle).not.toBe('none');
  expect(evidence.outlineWidth).toBeGreaterThanOrEqual(2);
  expect(evidence.width).toBeGreaterThan(0);
  expect(evidence.height).toBeGreaterThan(0);
  return evidence;
}
