import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oscWorkflowHints } from '../../src/web/osc-workflow.js';

const quick = [{oscPath:'Sensa/QuickStart/Depth',role:'Depth'},{oscPath:'Sensa/QuickStart/Active',role:'GateEnable'}];
const point = {oscPath:'Sensa/Handle/v1/LabHandle/Self/**',sourceMode:'SensaPoint',role:'Depth'};
const active = {mappings:quick,runtime:{inputActive:true},mode:'osc',listening:true};

test('QuickStart to PB via append reports the old gate; replacing clears the warning', () => {
  const hints = oscWorkflowHints({...active,dirty:true,drafts:[...quick,point]});
  assert.ok(hints.some(h => h.key === 'mixed-tests' && h.text.includes('STOP')));
  assert.ok(hints.some(h => h.key === 'draft'));
  assert.ok(!oscWorkflowHints({...active,dirty:true,drafts:[point]}).some(h => h.key === 'mixed-tests'));
});

test('saving mappings explains why the previously active input has stopped', () => {
  const hints = oscWorkflowHints({...active,mappings:[point],runtime:{inputActive:false,gateClosed:true,poseBlocked:true}});
  assert.ok(hints.some(h => h.key === 'inactive' && h.text.includes('保存配置')));
  assert.ok(!hints.some(h => h.key === 'draft'));
  assert.ok(!hints.some(h => h.key === 'geometry' || h.key === 'gate'));
});

test('actual closed gates are named and page selection cannot claim OSC is running', () => {
  const hints = oscWorkflowHints({...active,mode:'manual',runtime:{inputActive:true,gateClosed:true}});
  assert.ok(hints.some(h => h.key === 'mode'));
  assert.ok(hints.some(h => h.key === 'gate' && h.text.includes('Sensa/QuickStart/Active')));
});

test('emergency and missing geometry remain visible even with OSC reception', () => {
  const hints = oscWorkflowHints({...active,runtime:{isEmergency:true,inputActive:true,poseBlocked:true}});
  assert.ok(hints.some(h => h.key === 'emergency'));
  assert.ok(hints.some(h => h.key === 'geometry'));
  assert.equal(oscWorkflowHints(active).length, 0);
});
