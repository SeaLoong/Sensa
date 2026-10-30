import test from 'node:test';
import assert from 'node:assert/strict';
import { RuntimeEngine } from '../../src/core/runtime/runtime.ts';
import { normalizeConfiguration } from '../../src/core/runtime/configuration.ts';
import { defaultComputedSignalConfig,defaultComputedSignalInputConfig } from '../../src/core/runtime/configuration-defaults.ts';
import { neutralValues,type RuntimeMotionFrame } from '../../src/core/runtime/model.ts';
import { OscParameterStore,type OscSource } from '../../src/core/protocols/osc.ts';
import { ExternalControlStore } from '../../src/core/protocols/external-control.ts';
import { defaultProtocolInput } from '../../src/core/protocols/input-types.ts';
import { RuntimeMotionRecorder } from '../../src/core/runtime/recording.ts';
import { RuntimeScriptPlayer } from '../../src/core/runtime/script.ts';
const SOURCE:OscSource={key:'source',label:'Source',persistentId:null,address:'127.0.0.1',port:9000};
function rig(patch:Record<string,unknown>={}) {
  let now=1000;const config=normalizeConfiguration(patch),store=new OscParameterStore(()=>now),controls=new ExternalControlStore(config.protocolInputs,()=>now);
  const events:{kind:string;frame?:RuntimeMotionFrame}[]=[];
  const runtime=new RuntimeEngine(config,{now:()=>now,oscStore:store,externalControls:controls,sendFrame:frame=>{events.push({kind:'frame',frame});},stopOutputs:()=>{events.push({kind:'global-stop'});},stopUnboundOutputs:()=>{events.push({kind:'unbound-stop'});}});
  return {runtime,store,controls,events,config,setTime:(value:number)=>{now=value;},advance:(delta:number)=>{now+=delta;runtime.tick();},frames:()=>events.filter(event=>event.frame).map(event=>event.frame!)};
}
const mapping=(patch:Record<string,unknown>={})=>({oscPath:'Value',sourceMode:'Direct',role:'Depth',...patch});
const script={actions:[{at:0,pos:20},{at:1000,pos:80},{at:2000,pos:0}]};

test('manual activation is explicit and disabling stops without moving to a neutral target',async()=>{
  const r=rig();r.runtime.setManual({L0:.7,R0:.3});await r.runtime.flush();assert.equal(r.frames().length,0);
  r.runtime.setInputActive(true);await r.runtime.flush();assert.equal(r.frames().at(-1)?.values.L0,.7);assert.equal(r.frames().at(-1)?.values.R0,.3);
  r.runtime.setInputActive(false);await r.runtime.flush();assert.equal(r.events.at(-1)?.kind,'global-stop');assert.equal((r.runtime.getSnapshot()['command'] as {l0:number}).l0,.7);
});
test('manual selected axes preserve the current baseline for unselected axes',async()=>{
  const r=rig();r.runtime.setManual({values:{...neutralValues(),L0:.8,R0:0},deltaMs:0,activeAxes:['L0']});r.runtime.setInputActive(true);await r.runtime.flush();
  assert.deepEqual(r.frames()[0]?.activeAxes,['L0']);assert.equal(r.frames()[0]?.values.R0,.5);assert.equal(r.frames()[0]?.values.L0,.8);
  assert.deepEqual((r.runtime.getSnapshot()['manualCommand'] as {activeAxes:string[]}).activeAxes,['L0']);
});
for(const axes of [[],['L0','L0'],['V3'],['A9']])test('manual axes reject invalid selections '+axes.join(','),()=>{
  const r=rig();assert.throws(()=>r.runtime.setManual({values:neutralValues(),deltaMs:0,activeAxes:axes as NonNullable<RuntimeMotionFrame['activeAxes']>}));
});
test('emergency latches, clears input activation and requires a separate activation',async()=>{
  const r=rig();r.runtime.setManual({L0:.7});r.runtime.setInputActive(true);await r.runtime.flush();r.runtime.emergencyStop();await r.runtime.flush();
  r.runtime.setManual({L0:.9});r.runtime.setInputActive(true);assert.equal(r.runtime.getSnapshot()['inputActive'],false);assert.equal(r.runtime.getSnapshot()['isEmergency'],true);
  const count=r.frames().length;r.runtime.clearEmergency();await r.runtime.flush();assert.equal(r.frames().length,count);assert.equal(r.runtime.getSnapshot()['inputActive'],false);
  r.runtime.setInputActive(true);await r.runtime.flush();assert.equal(r.frames().at(-1)?.values.L0,.9);
});
test('mode/config/source changes revoke activation without clearing the emergency latch',async()=>{
  const r=rig();r.runtime.setManual({L0:.5});r.runtime.setInputActive(true);r.runtime.setInputMode('osc');assert.equal(r.runtime.getSnapshot()['inputActive'],false);
  r.runtime.setInputActive(true);r.runtime.setOscSource('other');assert.equal(r.runtime.getSnapshot()['inputActive'],false);
  r.runtime.emergencyStop();r.runtime.applyConfiguration(r.config);assert.equal(r.runtime.getSnapshot()['isEmergency'],true);await r.runtime.flush();
});
test('async host configuration transaction can block activation until an idempotent release',()=>{
  const r=rig();const release=r.runtime.blockInputActivation();assert.throws(()=>r.runtime.setInputActive(true),/Updating/);release();release();r.runtime.setInputActive(true);assert.equal(r.runtime.getSnapshot()['inputActive'],true);
});
test('repeated identical manual frames do not create a continuous send loop',async()=>{
  const r=rig();r.runtime.setManual({L0:.7});r.runtime.setInputActive(true);await r.runtime.flush();
  r.runtime.setManual({L0:.7});r.advance(100);r.advance(100);await r.runtime.flush();assert.equal(r.frames().length,1);
});
test('in-flight old dispatch cannot credit or replay queued work after emergency and reactivation',async()=>{
  let release:(()=>void)|undefined;const events:string[]=[];let first=true;
  const runtime=new RuntimeEngine(undefined,{sendFrame:frame=>{events.push(String(frame.values.L0));if(first){first=false;return new Promise<void>(resolve=>{release=resolve;});}},stopOutputs:()=>{events.push('stop');}});
  runtime.setManual({L0:.1});runtime.setInputActive(true);runtime.setManual({L0:.2});runtime.emergencyStop();runtime.clearEmergency();runtime.setManual({L0:.9});runtime.setInputActive(true);
  release?.();await runtime.flush();assert.deepEqual(events,['0.1','stop','0.9']);
});
test('direct OSC routing preserves untouched axes and source selection disarms before switching',async()=>{
  const r=rig({signals:[mapping()]});r.runtime.setInputMode('Osc');r.store.set('Value',.8,SOURCE);r.runtime.setInputActive(true);await r.runtime.flush();
  assert.ok(Math.abs((r.frames().at(-1)?.values.L0??0)-.7992)<1e-8);assert.equal(r.frames().at(-1)?.values.R0,.5);
  r.runtime.setOscSource('different');r.store.set('Value',1,SOURCE);await r.runtime.flush();assert.equal(r.runtime.getSnapshot()['inputActive'],false);
});
test('gate closure stops only unbound motion, leaves activation on and recovers on valid input',async()=>{
  const r=rig({signals:[mapping(),mapping({oscPath:'Gate',role:'GateEnable'})]});r.runtime.setInputMode('Osc');r.store.set('Value',.8,SOURCE);r.store.set('Gate',0,SOURCE);r.runtime.setInputActive(true);await r.runtime.flush();
  assert.equal(r.events.at(-1)?.kind,'unbound-stop');assert.equal(r.runtime.getSnapshot()['inputActive'],true);assert.equal(r.runtime.getSnapshot()['gateClosed'],true);assert.equal(r.events.some(item=>item.kind==='global-stop'),false);
  r.store.set('Gate',1,SOURCE);await r.runtime.flush();assert.equal(r.runtime.getSnapshot()['gateClosed'],false);assert.equal(r.frames().length,1);
});
test('an invalid mapped computation stops unbound axes without turning the input switch off',async()=>{
  const r=rig({computedSignals:[{...defaultComputedSignalConfig(),id:'A',operation:'Average',inputs:[{...defaultComputedSignalInputConfig(),oscPath:'Value'}]}],signals:[mapping({sourceMode:'Computed',oscPath:'A'})]});
  r.runtime.setInputMode('Osc');r.runtime.setInputActive(true);await r.runtime.flush();assert.equal(r.runtime.getSnapshot()['computedInputBlocked'],true);assert.equal(r.runtime.getSnapshot()['inputActive'],true);assert.equal(r.events.at(-1)?.kind,'unbound-stop');
  r.store.set('Value',.75,SOURCE);r.advance(31);await r.runtime.flush();assert.equal(r.runtime.getSnapshot()['computedInputBlocked'],false);assert.ok(r.frames().length>0);
});
test('high-frequency geometry/computed bursts coalesce without postponing forever',async()=>{
  const r=rig({computedSignals:[{...defaultComputedSignalConfig(),id:'A',operation:'Average',inputs:[{...defaultComputedSignalInputConfig(),oscPath:'Value'}]}],signals:[mapping({sourceMode:'Computed',oscPath:'A'})]});
  r.runtime.setInputMode('Osc');r.runtime.setInputActive(true);
  for(let i=0;i<20;i++){r.store.set('Value',i/20,SOURCE);r.advance(5);await r.runtime.flush();}
  assert.ok(r.frames().length>=2);assert.ok((r.frames().at(-1)?.values.L0??0)>.5);
});
test('unmapped invalid calculations cannot block a valid legacy axis',async()=>{
  const r=rig({computedSignals:[{...defaultComputedSignalConfig(),id:'Missing',inputs:[{...defaultComputedSignalInputConfig(),oscPath:'Absent'}]}],signals:[mapping()]});r.runtime.setInputMode('Osc');r.store.set('Value',.6,SOURCE);r.runtime.setInputActive(true);await r.runtime.flush();assert.equal(r.runtime.getSnapshot()['computedInputBlocked'],false);assert.equal(r.frames().length,1);
});
test('same scalar path in two OSC sources is ambiguous for computed values, not silently mixed',()=>{
  const r=rig();r.store.set('Value',.2,SOURCE);r.store.set('Value',.9,{...SOURCE,key:'other'});const input={...defaultComputedSignalInputConfig(),oscPath:'Value'};
  assert.equal(r.runtime.resolveSignalInput(input).valid,false);r.runtime.setOscSource('source');assert.equal(r.runtime.resolveSignalInput(input).value,.2);
});
test('OSC source reads follow the authoritative store when a persistent source reconnects on a new endpoint',()=>{
  const r=rig(), old={...SOURCE,key:'old-endpoint',persistentId:'oscquery:name:Saved'}, current={...old,key:'new-endpoint',port:9002};
  const input={...defaultComputedSignalInputConfig(),oscPath:'Depth'};
  r.store.set('Depth',.2,old);r.runtime.setOscSource(old.key);assert.equal(r.runtime.resolveSignalInput(input).value,.2);
  r.store.set('Depth',.8,current);r.store.preferredSourceKey=current.key;
  assert.equal(r.runtime.resolveSignalInput(input).value,.8);
  r.runtime.setOscSource(null);assert.equal(r.store.preferredSourceKey,null);assert.equal(r.runtime.resolveSignalInput(input).valid,false);
  r.runtime.dispose();
});
for(const removal of ['clearSource','clear','changeAvatar'] as const)test('OSC '+removal+' retains an explicit source intent instead of falling back to another producer',()=>{
  const r=rig(),input={...defaultComputedSignalInputConfig(),oscPath:'Depth'};
  try {
    r.store.set('Depth',.2,SOURCE);r.runtime.setOscSource(SOURCE.key);
    if(removal==='clearSource')r.store.clearSource(SOURCE.key);else if(removal==='changeAvatar')r.store.changeAvatar(SOURCE.key);else r.store.clear();
    r.store.set('Depth',.9,{...SOURCE,key:'other'});
    assert.equal(r.store.preferredSourceKey,SOURCE.key);assert.equal(r.runtime.resolveSignalInput(input).valid,false);
  } finally {r.runtime.dispose();}
});
test('OSC selection invalidates computed and leaf caches even within the same clock tick',()=>{
  const r=rig({computedSignals:[{...defaultComputedSignalConfig(),id:'A',operation:'Average',inputs:[{...defaultComputedSignalInputConfig(),oscPath:'Depth'}]}]});
  const direct={...defaultComputedSignalInputConfig(),oscPath:'Depth'},computed={...direct,sourceMode:'Computed' as const,oscPath:'A'};
  try {
    r.store.set('Depth',.2,SOURCE);r.store.set('Depth',.8,{...SOURCE,key:'other'});r.runtime.setOscSource(SOURCE.key);
    assert.equal(r.runtime.resolveSignalInput(direct).value,.2);assert.equal(r.runtime.resolveSignalInput(computed).value,.2);assert.equal(r.runtime.getComputedSignals()['A']?.value,.2);
    r.store.preferredSourceKey='other';
    assert.equal(r.runtime.resolveSignalInput(direct).value,.8);assert.equal(r.runtime.resolveSignalInput(computed).value,.8);assert.equal(r.runtime.getComputedSignals()['A']?.value,.8);
  } finally {r.runtime.dispose();}
});
test('scalar timeout is based on mapped input, not unrelated OSC traffic',async()=>{
  const r=rig({osc:{inputTimeoutMs:100},signals:[mapping()]});r.runtime.setInputMode('Osc');r.store.set('Value',.5,SOURCE);r.runtime.setInputActive(true);await r.runtime.flush();
  r.setTime(1600);r.store.set('Unrelated',1,SOURCE);r.runtime.tick();await r.runtime.flush();assert.equal(r.runtime.getSnapshot()['isEmergency'],true);
});
test('OGB modern root/tip pair cannot be kept alive by suppressed legacy or Close updates',async()=>{
  const r=rig({osc:{inputTimeoutMs:100},signals:[mapping({sourceMode:'OgbDepth',oscPath:'OGB/Orf/Socket/PenOthers'})]});r.runtime.setInputMode('Osc');
  r.store.set('OGB/Orf/Socket/PenOthersNewRoot',.6,SOURCE);r.store.set('OGB/Orf/Socket/PenOthersNewTip',.8,SOURCE);r.runtime.setInputActive(true);await r.runtime.flush();
  r.setTime(1600);r.store.set('OGB/Orf/Socket/PenOthers',1,SOURCE);r.store.set('OGB/Orf/Socket/PenOthersClose',1,SOURCE);r.runtime.tick();await r.runtime.flush();assert.equal(r.runtime.getSnapshot()['isEmergency'],true);
});
test('avatar changes revoke an active OSC session and reset calibration state',async()=>{
  const r=rig({signals:[mapping()]});r.runtime.setInputMode('Osc');r.store.set('Value',1,SOURCE);r.runtime.setInputActive(true);await r.runtime.flush();r.store.changeAvatar();await r.runtime.flush();assert.equal(r.runtime.getSnapshot()['isEmergency'],true);assert.equal(r.runtime.getSnapshot()['inputActive'],false);
});
test('protocol batches retain independent axes and durations, and expiry stops whole motion',async()=>{
  const input={...defaultProtocolInput('in'),enabled:true,timeoutMs:1000,features:[{channel:'stroke',name:'Stroke',actuator:'Position',scalarType:'Vibrate',targetAxis:'L0'},{channel:'roll',name:'Roll',actuator:'Position',scalarType:'Vibrate',targetAxis:'R0'}]};
  const r=rig({protocolInputs:[input]});r.runtime.setInputMode('Protocol');r.runtime.setInputActive(true);assert.equal(r.controls.tryAcquire('in','session').ok,true);
  assert.equal(r.controls.publish('in','session',[{channel:'stroke',value:.3,durationMs:100},{channel:'roll',value:.8,durationMs:250}]).ok,true);await r.runtime.flush();
  assert.equal(r.frames().length,2);assert.deepEqual(r.frames()[0]?.activeAxes,['L0']);assert.deepEqual(r.frames()[1]?.activeAxes,['R0']);assert.equal(r.frames()[0]?.requestedMotionValue,100);assert.equal(r.frames()[1]?.requestedMotionValue,250);
  r.advance(2000);await r.runtime.flush();assert.equal(r.events.at(-1)?.kind,'global-stop');
});
test('virtual registered protocol sources route through the same store without persisting fake inputs',async()=>{
  const r=rig();const virtual={...defaultProtocolInput('browser-explorer'),type:'JsonWebSocket' as const,enabled:true,port:0,timeoutMs:1000};r.controls.configure([virtual]);r.runtime.setInputMode('Protocol');r.runtime.setInputActive(true);
  assert.equal(r.controls.tryAcquire(virtual.id,'paired').ok,true);assert.equal(r.controls.publish(virtual.id,'paired',[{channel:'L0',value:.65}]).ok,true);await r.runtime.flush();assert.equal(r.frames().at(-1)?.values.L0,.65);assert.equal(r.runtime.getConfig().protocolInputs.length,0);
});
test('protocol command received while disarmed is discarded on subsequent activation',async()=>{
  const r=rig({protocolInputs:[{...defaultProtocolInput('in'),enabled:true}]});r.runtime.setInputMode('Protocol');r.controls.tryAcquire('in','client');r.controls.publish('in','client',[{channel:'L0',value:.8}]);r.runtime.setInputActive(true);r.advance(20);await r.runtime.flush();assert.equal(r.frames().length,0);
});
test('protocol stop is a barrier before a newer target, and old pending channels are revoked',async()=>{
  const r=rig({protocolInputs:[{...defaultProtocolInput('in'),enabled:true}]});r.runtime.setInputMode('Protocol');r.runtime.setInputActive(true);r.controls.tryAcquire('in','client');r.controls.publish('in','client',[{channel:'L0',value:.2}]);await r.runtime.flush();r.controls.stop('in','client');r.controls.publish('in','client',[{channel:'L0',value:.9}]);await r.runtime.flush();
  assert.deepEqual(r.events.slice(-2).map(item=>item.kind),['global-stop','frame']);assert.equal(r.frames().at(-1)?.values.L0,.9);
});
test('script axis selects actual output routing, changing it disarms rather than just changing UI metadata',async()=>{
  const r=rig();r.runtime.loadScript('motion.funscript',script);r.runtime.configureScript({axis:'A2'});r.runtime.setInputActive(true);r.runtime.playScript();r.advance(500);await r.runtime.flush();
  assert.equal(r.runtime.getScriptSnapshot().axis,'A2');assert.deepEqual(r.frames().at(-1)?.activeAxes,['A2']);assert.ok(Math.abs((r.frames().at(-1)?.values.A2??0)-.5)<1e-9);assert.equal(r.frames().at(-1)?.values.L0,.5);
  r.runtime.configureScript({axis:'V2'});await r.runtime.flush();assert.equal(r.runtime.getSnapshot()['inputActive'],false);
});
test('snapshot reads after natural script completion preserve the final frame for the next tick',async()=>{
  const r=rig();r.runtime.loadScript('end.funscript',{actions:[{at:0,pos:100},{at:1050,pos:0}]});r.runtime.setInputActive(true);r.runtime.playScript();await r.runtime.flush();r.setTime(2055);assert.equal(r.runtime.getScriptSnapshot().state,'finished');r.runtime.tick();await r.runtime.flush();assert.equal(r.frames().at(-1)?.values.L0,0);
});
test('script pause invalidates queued frames before play resumes and emits a stop barrier',async()=>{
  const r=rig();r.runtime.loadScript('motion.funscript',script);r.runtime.setInputActive(true);r.runtime.playScript();await r.runtime.flush();r.advance(200);r.runtime.pauseScript();await r.runtime.flush();assert.equal(r.events.at(-1)?.kind,'global-stop');const count=r.frames().length;r.advance(1000);await r.runtime.flush();assert.equal(r.frames().length,count);
});
test('recordings retain a final held duration and never exceed their declared capacity',()=>{
  let now=0;const recorder=new RuntimeMotionRecorder(()=>now,3);recorder.start();recorder.push({values:{...neutralValues(),L0:.575},deltaMs:0});now=1000;recorder.stop();assert.deepEqual(recorder.export().actions,[{at:0,pos:58},{at:1000,pos:58}]);
  recorder.start();for(let i=0;i<5;i++){now+=10;recorder.push({values:{...neutralValues(),L0:.2+i*.1},deltaMs:10});}assert.deepEqual(recorder.snapshot(),{isActive:false,frameCount:3});
});
for(const position of [.005,.015,.025,.575])test('recording midpoint rounding matches float/ties-to-even desktop export '+position,()=>{
  const recorder=new RuntimeMotionRecorder(()=>0);recorder.start();recorder.push({values:{...neutralValues(),L0:position},deltaMs:0});assert.equal(recorder.export().actions[0]?.pos,position===.005?0:position===.015?2:position===.025?2:58);
});
test('script import preserves clipped sorted fractional actions and duplicate last-wins while strict SDK parsing remains separate policy',()=>{
  const player=new RuntimeScriptPlayer(()=>0);const state=player.load('old.funscript',{inverted:true,actions:[null,{at:1000,pos:150},{at:-2,pos:-10},{at:500,pos:50.25},{at:0.5,pos:50}]});assert.equal(state.actionCount,3);assert.equal(player.seek(500).currentL0,.4975);
});
test('stopping a script in one frame subscriber revokes delivery to later subscribers',()=>{
  let now=0;const player=new RuntimeScriptPlayer(()=>now),seen:number[]=[];let interrupt=false;player.load('test',script);player.onFrame.add(()=>{if(interrupt)player.pause();});player.onFrame.add(value=>seen.push(value));player.play();interrupt=true;now=100;player.tick();assert.deepEqual(seen,[.2]);
});
test('disposed runtime detaches inputs and cannot deliver later script or OSC work',async()=>{
  const r=rig({signals:[mapping()]});r.runtime.setInputMode('Osc');r.runtime.setInputActive(true);r.runtime.dispose();r.store.set('Value',1,SOURCE);r.advance(1000);await r.runtime.flush();assert.equal(r.frames().length,0);assert.equal(r.store.onSet.size,0);assert.equal(r.controls.onBatch.size,0);
});
