import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { ComputedSignalConfig,ComputedSignalSample,SignalMapping,MotionValues } from '../../src/core/runtime/model.ts';
import { ComputedSignalEvaluator } from '../../src/core/runtime/computed.ts';
import { SignalChannelProcessor,fuseSignals } from '../../src/core/runtime/motion.ts';
import { neutralValues } from '../../src/core/runtime/model.ts';
import { RuntimeScriptPlayer } from '../../src/core/runtime/script.ts';
import { normalizeConfiguration } from '../../src/core/runtime/configuration.ts';
interface Fixture {
  schema:number;sourceCommit:string;seed:number;binaryPdbPaired:boolean;gitSourceBytesVerified:boolean;exporterSha256:string;sourceFiles:{path:string;sha256:string;matchesPortablePdb:boolean}[];
  computed:{id:string;definition:ComputedSignalConfig;steps:{now:number;inputs:ComputedSignalSample[];expected:ComputedSignalSample}[]}[];
  channels:{mapping:SignalMapping;raw:number;expected:{normalized:number;curved:number;output:number}}[];
  mixtures:{inputs:{role:SignalMapping['role'];value:number;priority:number}[];expected:MotionValues}[];
  scripts:{script:string;steps:{action:string;value:number;expected:ReturnType<RuntimeScriptPlayer['getSnapshot']>}[]}[];
  configs:{input:unknown;expected:unknown}[];
}
const data=JSON.parse(await readFile(new URL('./fixtures/domain-parity.json',import.meta.url),'utf8')) as Fixture;
function close(actual:number|null,expected:number|null,label:string):void {
  if(actual===null||expected===null){assert.equal(actual,expected,label);return;}
  assert.ok(Math.abs(actual-expected)<=Math.max(.00001,Math.abs(expected)*.000005),`${label}: ${actual} != ${expected}`);
}
test('reference fixture records exact existing C# documents from the paired Portable PDB',()=>{
  assert.equal(data.schema,1);assert.equal(data.sourceCommit,'941febb7b760cab37000d3bf54e7ccf756201b22');assert.equal(data.seed,7302026);assert.equal(data.sourceFiles.length,24);
  assert.equal(data.binaryPdbPaired,true);assert.equal(data.gitSourceBytesVerified,true);assert.match(data.exporterSha256,/^[a-f0-9]{64}$/);
  assert.ok(data.sourceFiles.every(item=>item.matchesPortablePdb&&/^[a-f0-9]{64}$/.test(item.sha256)&&!item.path.startsWith('/')));
  assert.equal(data.computed.length,232);assert.equal(data.channels.length,784);assert.equal(data.mixtures.length,150);
});
for(const item of data.computed)test('C# computed timeline parity '+item.id,()=>{
  const evaluator=new ComputedSignalEvaluator([item.definition]);
  for(const step of item.steps){const result=evaluator.evaluate(step.now,input=>step.inputs[Number(input.oscPath.slice(1))]!)['Result'];assert.ok(result);
    assert.equal(result.valid,step.expected.valid,item.id+' @'+step.now);
    if(result.valid){close(result.value,step.expected.value,item.id+' @'+step.now);assert.equal(result.sourceKey,step.expected.sourceKey);assert.equal(result.timestampMs,step.expected.timestampMs);assert.equal(result.coordinateFrame,step.expected.coordinateFrame);assert.equal(result.originKey,step.expected.originKey);}
  }
});
for(const [index,item] of data.channels.entries())test('C# calibration/curve/range parity '+index,()=>{
  const actual=new SignalChannelProcessor(item.mapping).processSample(item.raw);for(const key of ['normalized','curved','output'] as const)close(actual[key],item.expected[key],key);
});
for(const [index,item] of data.mixtures.entries())test('C# role fusion priority and centered-axis parity '+index,()=>{
  const actual={...neutralValues(),...fuseSignals(item.inputs)};for(const axis of Object.keys(item.expected) as (keyof MotionValues)[])close(actual[axis],item.expected[axis],axis);
});
for(const [index,item] of data.scripts.entries())test('C# imported script/seek/loop/fractional clock parity '+index,()=>{
  let now=0;const player=new RuntimeScriptPlayer(()=>now);player.load('parity.funscript',item.script);
  for(const step of item.steps){if(step.action==='seek')player.seek(step.value);if(step.action==='configure')player.configure({loop:true,speed:.125,updateLoopRange:true,loopStartMs:300,loopEndMs:700});if(step.action==='play')player.play({restart:true});
    if(step.action==='advance'){const end=now+step.value;while(now+20<=end){now+=20;player.tick();}now=end;}
    const result=player.getSnapshot(),expected=step.expected;
    for(const key of ['loaded','playing','paused','loop','speed','positionMs','durationMs','actionCount','fileName','state','loopRangeActive','loopStartMs','loopEndMs'] as const)assert.equal(result[key],expected[key],key+' at '+step.action);
    close(result.currentL0,expected.currentL0,'script position');assert.deepEqual(result.activityBins,expected.activityBins);
  }
});
for(const [index,item] of data.configs.entries())test('C# complete normalized configuration JSON parity '+index,()=>{
  const result=normalizeConfiguration(item.input);
  // Device scoping is a new capability absent from the frozen C# schema; its
  // default values are checked here, and ownership rules have separate tests.
  for(const output of result.outputs){assert.equal(output.intifaceDeviceName,'');assert.equal(output.intifaceDeviceIndex,null);delete output.intifaceDeviceName;delete output.intifaceDeviceIndex;}
  assert.deepEqual(result,item.expected);
});
