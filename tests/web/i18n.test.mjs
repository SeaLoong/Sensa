import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { t, getLocale, setLocale, resolveLocale, subscribeLocale, diagnostic, docUrl } from '../../src/web/i18n.js';
import en from '../../src/web/i18n.en.json' with {type:'json'};
import presets from '../../src/web/data/osc-presets.json' with {type:'json'};
import { calibratedPointDraft } from '../../src/web/osc-preview.js';

test('language detection accepts supported saved values, browser preferences and fallback', () => {
  assert.equal(resolveLocale('zh-CN',['en-US']), 'zh-CN');
  assert.equal(resolveLocale('en-US',['zh-TW']), 'en-US');
  assert.equal(resolveLocale('bad',['zh-HK']), 'zh-CN');
  assert.equal(resolveLocale(null,['de-DE','en-GB']), 'en-US');
  assert.equal(resolveLocale(null,[]), 'en-US');
});
test('all application translation keys and built-in presets have nonempty English text', () => {
  for(const file of readdirSync('src/web').filter(f=>/\.(js|jsx)$/.test(f)&&!f.includes('bundle'))){
    for(const match of readFileSync('src/web/'+file,'utf8').matchAll(/\bt\(("(?:[^"\\]|\\.)*")/g)){
      const key=JSON.parse(match[1]);assert.ok(en[key],file+': '+key);
    }
  }
  for(const preset of presets)for(const field of ['name','description'])assert.ok(en[preset[field]],preset.id+': '+field);
  for(const [key,value] of Object.entries(en)){
    assert.ok(value.trim(),key);
    assert.doesNotMatch(value,/[\u3400-\u9fff]/u,key);
    const placeholders=s=>[...s.matchAll(/\{\d+\}/g)].map(m=>m[0]).sort();
    assert.deepEqual(placeholders(value),placeholders(key),key);
  }
});
test('switch updates subscribers, keeps unknown data literal and does not resubstitute values', () => {
  const original=getLocale();let calls=0;const stop=subscribeLocale(()=>calls++);
  try{
    setLocale('en-US'); assert.equal(t('停止输出'),'Stop outputs');
    assert.equal(t('{0} 已保存',['自定义 {1} <b>']), '自定义 {1} <b> saved');
    assert.equal(t('我的设备'),'我的设备');
    assert.equal(diagnostic('[Output] 已断开 我的设备'), '[Output] Disconnected 我的设备');
    assert.equal(diagnostic('Root: 采样不完整'),'Root: Incomplete samples');
    assert.equal(diagnostic('unknown firmware response'),'unknown firmware response');
    assert.match(docUrl('docs/guide.md'),/guide\.en\.md$/);
    assert.equal(calibratedPointDraft(null,'Z',null,null).error,'Select a local point and measurement axis');
    assert.equal(setLocale('invalid'),false);assert.equal(getLocale(),'en-US');
    setLocale('en-US'); assert.equal(calls,1);
    setLocale('zh-CN');assert.equal(t('停止输出'),'停止输出');assert.equal(calls,2);
    assert.match(docUrl('docs/guide.md'),/guide\.md$/);
  }finally{stop();setLocale(original);}
});
test('blocked storage does not break switching or lose in-memory choice', () => {
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('denied');}});
  try{assert.equal(setLocale('en-US'),true);assert.equal(getLocale(),'en-US');}
  finally{if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete globalThis.localStorage;setLocale('zh-CN');}
});
