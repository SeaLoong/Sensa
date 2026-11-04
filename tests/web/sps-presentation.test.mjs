import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../../', import.meta.url));
const compiled = await build({
  absWorkingDir: root,
  stdin: { contents: "export { SignalMappingRow } from './src/web/configuration-views.jsx'; export { getOscMappingPresets, makeSignalDraft } from './src/web/configuration.js'; export { parameterMeaning } from './src/web/osc-preview.js'; export { setLocale } from './src/web/i18n.js';", resolveDir: root },
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic',
  plugins: [{ name: 'shared-test-react', setup(builder) {
    builder.onResolve({ filter: /^react(?:\/.*)?$/ }, args => ({ path: pathToFileURL(require.resolve(args.path)).href, external: true }));
  } }],
});
const { SignalMappingRow, getOscMappingPresets, makeSignalDraft, parameterMeaning, setLocale } =
  await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));

for (const locale of ['zh-CN', 'en-US']) {
  test('SPS3 compatible mapping labels preserve existing source modes and saved preset paths in ' + locale, () => {
    setLocale(locale);
    const preset = getOscMappingPresets({}).find(value => value.id === 'ogb-depth');
    assert.ok(preset.description.startsWith(locale === 'zh-CN' ? '自动识别' : 'Detects SPS1'));
    assert.match(preset.description, /SPS3/);
    assert.match(preset.description, /_public/);
    assert.match(preset.description, /Include Public SPS Channel/);
    assert.doesNotMatch(preset.description, /_nothips/);
    assert.equal(preset.mappings.length, 1);
    const [mapping] = preset.mappings;
    assert.equal(mapping.sourceMode, 'OgbDepth');
    assert.equal(mapping.oscPath, 'OGB/Orf/**/PenOthersNewRoot;OGB/Orf/**/PenOthers;OGB/Pen/**/PenOthers');
    const html = renderToStaticMarkup(React.createElement(SignalMappingRow, {
      draft: makeSignalDraft(mapping), pathOptions: [], onChange() {}, onRemove() {},
    }));
    assert.ok(html.includes(locale === 'zh-CN' ? '>SPS1/SPS2/SPS3 自动识别</option>' : '>Detect SPS1/SPS2/SPS3</option>'));
    assert.ok(html.includes('>SPS2/SPS3 · PenOthersNewRoot / PenOthersNewTip</option>'));
    assert.match(html, /value="OgbDepth" selected=""/);
    assert.match(html, /value="SpsSocketDepth"/);
    assert.doesNotMatch(html, /value="Sps3/);
  });

  test('SPS3 parameter help distinguishes compatible OSC readings, Contact tags and capability versions in ' + locale, () => {
    setLocale(locale);
    for (const party of ['Self', 'Others']) {
      const rootHelp = parameterMeaning('OGB/Orf/Body/Pen' + party + 'NewRoot');
      assert.ok(rootHelp.startsWith('SPS2/SPS3 · Pen' + party + 'NewRoot'));
      assert.match(rootHelp, locale === 'zh-CN' ? /测量根部表面/ : /measures proximity/);
      assert.match(rootHelp, /_public/);
      assert.match(rootHelp, /_nothips/);
      assert.ok(parameterMeaning('OGB/Orf/Body/Pen' + party + 'NewTip').startsWith('SPS2/SPS3 · Pen' + party + 'NewTip'));
    }
    const version = parameterMeaning('VFH/Version/10');
    assert.match(version, /SPS2/);
    assert.match(version, /SPS3/);
    assert.match(version, locale === 'zh-CN' ? /不能.*区分/ : /does not identify/);
    for (const tag of ['SPS/Plug/_public', 'SPS/Socket/custom', 'SPS/SocketPath/custom'])
      assert.match(parameterMeaning(tag), locale === 'zh-CN' ? /自定义参数/ : /Custom parameters/);
  });
}
