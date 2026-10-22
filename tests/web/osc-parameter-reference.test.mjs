import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import '../../docs/assets/osc-parameter-reference.js';
import '../../docs/assets/parameter-geometry-model.js';

const { lookup } = globalThis.SensaOscParameterReference;
const geometry = globalThis.SensaParameterGeometry;
const native = name => 'Sensa/Contact/Root/' + name;
const required = ['name', 'title', 'summary', 'definition', 'definitionLabel', 'range', 'unit', 'valueType', 'usage'];

test('every illustrated parameter has complete bilingual explanations with attributed sources', () => {
  for (const scenario of geometry.scenarios) {
    for (const party of ['Self', 'Others']) {
      const result = geometry.evaluate({ ...geometry.defaultsFor(scenario), scenario, party });
      for (const value of result.values) for (const locale of ['zh-CN', 'en', 'en-US']) {
        const reference = lookup(value.path, locale);
        assert.ok(reference, value.path + ': ' + locale);
        assert.equal(reference.name, value.name);
        for (const key of required) assert.equal(typeof reference[key], 'string', value.path + ': ' + key);
        for (const key of required) assert.ok(reference[key].length > 0, value.path + ': ' + key);
        assert.ok(reference.sources.length > 0);
        for (const source of reference.sources) {
          assert.ok(source.label && source.kind);
          assert.equal(new URL(source.url).protocol, 'https:');
        }
      }
    }
  }
});

test('lookup recognizes full OSC addresses while custom names and unverified fields stay publisher-defined', () => {
  const path = native('Proximity_SenderLocalPositionZ');
  assert.deepEqual(lookup('/avatar/parameters/' + path, 'en'), lookup(path, 'en-US'));
  for (const unknown of [null, 1, {}, '', 'X', 'Custom/X', 'Custom/VelocityX', 'Custom/Proximity_SenderType',
    'Sensa/Contact/Root/Unknown', 'Sensa/Contact/Root/Proximity_CollisionTag_Custom',
    'Sensa/Shader/42/CRC', 'Sensa/SPS/Root/P4', 'Sensa/SPS/*/P0',
    'Sensa/Point/v1/Root/Self/Root/A4', 'Sensa/Handle/v1/Root/Self/Tip/A0',
    'OGB/Pen/Root/PenOthersNewRoot', 'OGB/Orf/Root/PenSelfClose',
    'OGB/Orf/Root/FrotOthersClose', 'OGB/Pen/Root/FrotSelf',
    'Sensa/Body/Aux0/Vibrate_Normal', 'x'.repeat(2049)]) {
    assert.equal(lookup(unknown), null, String(unknown));
  }
});

test('SDK advanced reports cite the verified Beta and separate position, relative velocity and proximity rate', () => {
  for (const axis of ['X', 'Y', 'Z']) {
    const position = lookup(native('Proximity_SenderLocalPosition' + axis), 'en');
    assert.equal(position.unit, 'm');
    assert.match(position.definition, /shape midpoint/);
    assert.match(position.definition, /physical metres/);
    assert.match(position.definition, /Receiver axes/);
    assert.ok(position.sources.some(source => source.kind === 'official-sdk'
      && source.url === 'https://github.com/vrchat/packages/releases/tag/3.10.6-beta.2'));
    const velocity = lookup(native('Proximity_SenderVelocity' + axis), 'en');
    assert.equal(velocity.unit, 'm/s');
    assert.match(velocity.definition, /contact point/);
    assert.match(velocity.definition, /angular motion/);
  }
  const speed = lookup(native('Proximity_SenderVelocityMagnitude'), 'en');
  assert.equal(speed.unit, 'm/s');
  assert.match(speed.range, /0 at rest/);
  assert.match(speed.definition, /magnitude/);
  const proximityRate = lookup(native('Proximity_ProximitySpeed'), 'en');
  assert.equal(proximityRate.unit, '1/s');
  assert.match(proximityRate.definition, /change in Proximity/);
  assert.match(proximityRate.summary, /positive for increasing and negative for decreasing/);
});

test('Sensa-added Radius and Sample retain their own provenance instead of claiming native SDK names', () => {
  for (const name of ['Radius', 'Sample']) {
    const value = lookup(native(name), 'en');
    assert.equal(value.definitionLabel, 'Sensa protocol definition');
    assert.ok(value.sources.some(source => source.kind === 'sensa-protocol'));
    assert.ok(!value.sources.some(source => source.kind === 'official-sdk'));
  }
  assert.equal(lookup(native('Radius'), 'en').unit, 'm');
  assert.match(lookup(native('Sample'), 'en').definition, /last changed/);
  assert.match(lookup(native('Proximity_SenderType'), 'en').range, /0 none; 1 self; 2 another avatar; 3 world/);
  assert.match(lookup(native('Proximity'), 'en').definition, /greatest strictly positive proximity/);
});

test('SPS NewTip explains the root-centered length sphere and Close explains the generated Float region gate', () => {
  const root = lookup('OGB/Orf/Body/PenOthersNewRoot', 'en');
  const tip = lookup('OGB/Orf/Body/PenOthersNewTip', 'en');
  assert.match(root.definition, /0\.01 m/);
  assert.match(tip.summary, /sphere centered at the Plug root/);
  assert.match(tip.summary, /radius equal to Plug length/);
  assert.match(tip.usage, /Pair NewRoot and NewTip/);
  assert.equal(tip.definitionLabel, 'VRCFury generated definition');
  for (const path of ['OGB/Orf/Body/PenOthersClose', 'OGB/Orf/Body/TouchOthersClose', 'OGB/Pen/Body/FrotOthersClose']) {
    const close = lookup(path, 'en');
    assert.equal(close.valueType, 'Float');
    assert.match(close.definition, /Constant capsule/);
    assert.match(close.definition, /Float parameter/);
    assert.ok(close.sources.some(source => source.url.includes('HapticContactsService.cs#L41-L66')));
  }
  const historical = lookup('OGB/Orf/Body/PenSelf', 'en');
  assert.match(historical.definition, /directly reads the historical/);
  assert.doesNotMatch(historical.usage, /Close/);
});

test('player velocity and uncertain built-in units keep the official meaning without inferred units', () => {
  const player = lookup('VelocityZ', 'en'), contact = lookup(native('Proximity_SenderVelocityZ'), 'en');
  assert.equal(player.unit, 'm/s');
  assert.match(player.definition, /player movement/);
  assert.match(contact.definition, /Sender velocity relative to Receiver/);
  assert.equal(lookup('AngularY', 'en').unit, 'Not specified in the official documentation');
  assert.match(lookup('Viseme', 'en').range, /0–14/);
  assert.match(lookup('Viseme', 'en').range, /0–100/);
  assert.match(lookup('EyeHeightAsPercent', 'en').range, /default/);
  assert.equal(lookup('EyeHeightAsMeters', 'en').unit, 'm');
});

test('raycast distances keep Hit validity and the selected DoNothing miss behavior explicit', () => {
  const hit = lookup('Sensa/Body/Aux0/Vibrate_Hit', 'en');
  const distance = lookup('Sensa/Body/Aux0/Vibrate_Distance', 'en');
  const ratio = lookup('Sensa/Body/Aux0/Vibrate_Ratio', 'en');
  assert.equal(hit.valueType, 'Bool');
  assert.equal(distance.unit, 'm');
  assert.match(distance.definition, /retains the latest reading on a miss/);
  assert.match(distance.usage, /companion Hit/);
  assert.match(ratio.definition, /divides hit distance by maximum distance/);
  assert.equal(hit.sources[0].url, 'https://creators.vrchat.com/avatars/avatar-components/raycast/#raycast-parameters');
});

test('Shader coordinates retain local units while its integer counter and validity flag use Float OSC transport', () => {
  const x = lookup('Sensa/Shader/42/X', 'en'), y = lookup('Sensa/Shader/42/Y', 'en');
  assert.equal(x.unit, 'Avatar-root local units');
  assert.equal(x.range, '−2–2');
  assert.equal(y.range, '−1–3');
  assert.match(lookup('Sensa/Shader/42/Frame', 'en').valueType, /^Float/);
  assert.match(lookup('Sensa/Shader/42/Valid', 'en').valueType, /^Float/);
  assert.match(lookup('Sensa/Shader/42/Valid', 'en').definition, /Frame, X, Y, Z, Valid order/);
  assert.equal(lookup('VFH/Version/10', 'en').valueType, 'Bool');
  assert.match(lookup('OGB/Orf/Body/Version/9', 'en').valueType, /type follows the publisher/);
});

test('Sensa document source links resolve to real bilingual repository files and references remain independent', () => {
  const seen = new Set();
  for (const scenario of geometry.scenarios) {
    for (const value of geometry.evaluate({ ...geometry.defaultsFor(scenario), scenario }).values) {
      for (const language of ['en', 'zh-CN']) for (const source of lookup(value.path, language).sources) {
        const marker = 'https://github.com/SeaLoong/Sensa/blob/main/';
        if (!source.url.startsWith(marker) || seen.has(source.url)) continue;
        seen.add(source.url);
        const file = source.url.slice(marker.length).split('#')[0];
        assert.ok(existsSync(fileURLToPath(new URL('../../' + file, import.meta.url))), source.url);
      }
    }
  }
  assert.ok(seen.size >= 8);
  const first = lookup(native('Radius'), 'en');
  first.sources[0].label = 'Edited label';
  first.summary = 'Edited summary';
  const next = lookup(native('Radius'), 'en');
  assert.notEqual(next.sources[0].label, first.sources[0].label);
  assert.notEqual(next.summary, first.summary);
});
