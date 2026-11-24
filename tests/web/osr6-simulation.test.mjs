import test from 'node:test';
import assert from 'node:assert/strict';
import { getOscMappingPresets } from '../../src/web/configuration.js';
import { centeredCounts, simulationInputs, createMappingSimulation, targetCounts } from '../../src/web/osr6-simulation.js';
import { platformPoint, receiverPose } from '../../src/web/osr6-scene.js';

test('all six targets change the 3D pose independently around a centered platform', () => {
  const neutral = platformPoint([0,0,0], centeredCounts);
  const at = (axis, point) => platformPoint(point, { ...centeredCounts, [axis]: 850 });
  assert.ok(at('L0',[0,0,0])[1] > neutral[1]);
  assert.ok(at('L1',[0,0,0])[2] < neutral[2]);
  assert.ok(at('L2',[0,0,0])[0] < neutral[0]);
  for (const axis of ['R0','R1','R2']) assert.ok(at(axis,[0,0,0]).every((value,i) => Math.abs(value-neutral[i]) < 1e-10));
  assert.ok(at('R0',[1,0,0])[2] > neutral[2]);
  assert.ok(at('R1',[1,0,0])[1] > neutral[1]);
  assert.ok(at('R2',[0,0,1])[1] < neutral[1]);
  assert.deepEqual(targetCounts({l0: 1, L2: 0}), {...centeredCounts, L0:999, L2:0});
});

test('the six servo cranks and links retain length; twist only drives the receiver insert', () => {
  const neutral = receiverPose(centeredCounts);
  const distance = (a,b) => Math.hypot(...a.map((v,i)=>v-b[i]));
  const cases = Object.keys(centeredCounts).flatMap(axis => [0,999].map(value => ({...centeredCounts,[axis]:value})));
  for (const counts of cases) assert.equal(receiverPose(counts).limited,false);
  for (let mask=0;mask<64;mask++) cases.push(Object.fromEntries(Object.keys(centeredCounts).map((axis,i)=>[axis, mask & (1<<i) ? 999 : 0])));
  let reachedLimit = false;
  for (const counts of cases) {
    const pose = receiverPose(counts);
    reachedLimit ||= pose.limited;
    assert.equal(pose.links.length,6);
    for (let i=0;i<6;i++) {
      const {pivot,elbow,socket}=pose.links[i], rest=neutral.links[i];
      assert.deepEqual(pivot,rest.pivot);
      assert.ok(Math.abs(distance(pivot,elbow)-distance(rest.pivot,rest.elbow)) < 1e-8);
      assert.ok(Math.abs(distance(elbow,socket)-distance(rest.elbow,rest.socket)) < 1e-8);
    }
  }
  assert.ok(reachedLimit);
  const twisted = {...centeredCounts,R0:999};
  assert.deepEqual(receiverPose(twisted).links,neutral.links);
  assert.notDeepEqual(platformPoint([.5,0,0],twisted),platformPoint([.5,0,0],centeredCounts));
});

test('isolated preview uses the Contact preset gate, real rate limit and independent depth', async () => {
  const rows = getOscMappingPresets({}).find(preset => preset.id === 'native-contact-axial').mappings;
  const plan = simulationInputs(rows), [depth, sway, gate] = plan.inputs;
  let now = 1000;
  const preview = createMappingSimulation(plan, () => now);
  const read = async () => { preview.sample(); await Promise.resolve(); return preview.sample(); };
  assert.equal((await read()).counts.L2, 500);
  preview.set(sway.path,.04); preview.set(depth.path,.16);
  now += 200;
  const moving = await read();
  assert.equal(moving.counts.L2,520);
  assert.ok(Math.abs(moving.counts.L0-800) <= 1);
  preview.set(gate.path,0); now += 600;
  assert.deepEqual(await read(),{counts:moving.counts,blocked:true});
  preview.dispose();
  const reused = simulationInputs([rows[0],{...rows[0],role:'Sway'}]);
  assert.equal(reused.inputs.length,1);
  assert.equal(reused.mappings[0].oscPath,reused.mappings[1].oscPath);
});
