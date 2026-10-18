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
          let scroll = element.closest('.table-scroll, .log-list, dialog[open]');
          if (!scroll) {
            let ancestor = element.parentElement;
            while (ancestor) {
              const overflow = getComputedStyle(ancestor);
              if (/auto|scroll/.test(overflow.overflowX + overflow.overflowY)) { scroll = ancestor; break; }
              ancestor = ancestor.parentElement;
            }
          }
          const scrollStyle = scroll ? getComputedStyle(scroll) : null;
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
    const scrollRegions = [...document.querySelectorAll('.table-scroll, .log-list, dialog[open]')].map(element => ({
      role: element.getAttribute('role') || element.tagName.toLowerCase(),
      label: element.getAttribute('aria-label') || element.getAttribute('aria-labelledby'),
      clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
      clientHeight: element.clientHeight, scrollHeight: element.scrollHeight,
    }));
    return { width, scrollWidth, height: innerHeight, scrollRegions };
  });
  expect(evidence.width).toBe(320);
  expect(evidence.scrollWidth, 'Page reflows at 320 CSS px / 页面在 320 CSS px 重排').toBeLessThanOrEqual(321);
  for (const region of evidence.scrollRegions.filter(region => region.role === 'dialog'))
    expect(region.scrollWidth, 'Dialog reflows without horizontal scrolling / 对话框无水平滚动').toBeLessThanOrEqual(region.clientWidth + 1);
  return evidence;
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
