import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultConfiguration,normalizeConfiguration,configurationForPersistence,normalizeComputedSignals,normalizeSignalOutput,normalizeFeatureRoutes,resolveAxisProfile } from '../../src/core/runtime/configuration.ts';
import { defaultComputedSignalConfig,defaultComputedSignalInputConfig,defaultOutputDeviceConfig,defaultSignalOutputBinding } from '../../src/core/runtime/configuration-defaults.ts';
import { sha256 } from '../../src/core/runtime/hash.ts';
const output=(patch:Record<string,unknown>={})=>({...defaultOutputDeviceConfig(),...patch});
const calculation=(id:string,inputs:unknown[],patch:Record<string,unknown>={})=>({...defaultComputedSignalConfig(),id,inputs,...patch});
const input=(patch:Record<string,unknown>={})=>({...defaultComputedSignalInputConfig(),sourceMode:'Constant',...patch});

test('configuration defaults preserve schema, ports, isolated profiles and inactive outputs',()=>{
  const a=createDefaultConfiguration(),b=createDefaultConfiguration();
  assert.equal(a.schemaVersion,5);assert.equal(a.webUi.port,5086);assert.equal(a.osc.receiverPort,9001);assert.equal(a.axisProfiles[0]?.id,'global-default');
  assert.equal(a.axisProfiles[0]?.isDefault,true);assert.equal(a.intiface.enabled,false);assert.equal(a.outputs.length,0);
  a.axisProfiles[0]!.motion.l0.max=300;assert.equal(b.axisProfiles[0]?.motion.l0.max,999);
});
test('PascalCase persisted config and camelCase API normalize to the same typed shape',()=>{
  const parsed=normalizeConfiguration({SchemaVersion:3,WebUi:{Port:5099},AxisProfiles:[{Id:'profile',Name:'Custom',IsDefault:true,Motion:{L0:{Min:900,Max:100,RemapMin:800,RemapMax:200,MaxSpeed:0}}}],Outputs:[{Id:'UDP',Type:'TCodeUdp',Enabled:true,Host:'localhost',Port:9512,MotionProfileId:'profile'}]});
  assert.equal(parsed.webUi.port,5099);assert.equal(parsed.schemaVersion,5);assert.equal(parsed.axisProfiles[0]?.id,'global-default');assert.equal(parsed.axisProfiles[0]?.motion.l0.min,100);assert.equal(parsed.axisProfiles[0]?.motion.l0.max,900);
  assert.equal(parsed.axisProfiles[0]?.motion.l0.remapMin,200);assert.equal(parsed.axisProfiles[0]?.motion.l0.maxSpeed,1);assert.equal(parsed.udpTCode.enabled,true);assert.equal(parsed.udpTCode.port,9512);
});
test('known numeric C# enums are imported but unsupported choices are rejected',()=>{
  const config=normalizeConfiguration({outputs:[{type:1,id:'udp'}],signals:[{oscPath:'A',role:5,curve:2}],computedSignals:[calculation('Sum',[input()],{operation:2})]});
  assert.equal(config.outputs[0]?.type,'TCodeUdp');assert.equal(config.signals[0]?.role,'Sway');assert.equal(config.signals[0]?.curve,'EaseOut');assert.equal(config.computedSignals[0]?.operation,'Sum');
  assert.throws(()=>normalizeConfiguration({outputs:[{type:999}]}),/enum/);
});
for(const value of [{webUi:{port:'5086'}},{osc:{enabled:null}},{outputs:[{enabled:'true'}]}])test('wrong primitive configuration shape is rejected '+JSON.stringify(value),()=>assert.throws(()=>normalizeConfiguration(value)));
for(const value of ['{"__proto__":{"polluted":true}}','{"Osc":{},"osc":{}}','{"webUi":{"constructor":{}}}'])test('prototype and case-collision properties are rejected '+value,()=>{assert.throws(()=>normalizeConfiguration(JSON.parse(value)));assert.equal(Object.hasOwn(Object.prototype,'polluted'),false);});
test('save snapshots reset enabled outputs without changing the running configuration',()=>{
  const config=normalizeConfiguration({outputs:[output({id:'udp',type:'TCodeUdp',enabled:true})]});const stored=configurationForPersistence(config);
  assert.equal(config.outputs[0]?.enabled,true);assert.equal(stored.outputs[0]?.enabled,false);assert.equal(config.udpTCode.enabled,true);assert.equal(stored.udpTCode.enabled,false);
});
test('axis profiles have one default and output references fall back case-insensitively',()=>{
  const config=normalizeConfiguration({axisProfiles:[{id:'global-default',isDefault:false},{id:'extra',isDefault:true}],outputs:[output({motionProfileId:'EXTRA'})]});
  assert.equal(config.axisProfiles.filter(item=>item.isDefault).length,1);assert.equal(resolveAxisProfile(config,'EXTRA').id,'extra');assert.equal(resolveAxisProfile(config,'missing').id,'extra');
});
for(const types of [['TCodeUdp','TCodeUdp'],['TCodeTcp','TCodeTcp'],['Intiface','Intiface'],['TCodeSerial','TCodeSerial']])test('physical target conflicts rejected '+types[0],()=>assert.throws(()=>normalizeConfiguration({outputs:types.map((type,i)=>output({id:'o'+i,type}))}),/duplicate/));
test('TCP and UDP can share numeric ports while localhost aliases collide within one transport',()=>{
  assert.equal(normalizeConfiguration({outputs:[output({type:'TCodeUdp'}),output({type:'TCodeTcp'})]}).outputs.length,2);
  assert.throws(()=>normalizeConfiguration({outputs:[output({id:'a',type:'TCodeUdp',host:'localhost'}),output({id:'b',type:'TCodeUdp',host:'127.0.0.1'})]}),/duplicate/);
});
test('Intiface explicit scopes share a socket while default-all and duplicate devices conflict',()=>{
  const scoped=(index:number)=>output({type:'Intiface',intifaceDeviceIndex:index});
  assert.equal(normalizeConfiguration({outputs:[scoped(0),scoped(1)]}).outputs.length,2);
  assert.throws(()=>normalizeConfiguration({outputs:[scoped(0),scoped(0)]}),/overlap/);
  assert.throws(()=>normalizeConfiguration({outputs:[scoped(0),output({type:'Intiface'})]}),/overlap/);
  assert.equal(normalizeConfiguration({outputs:[output({type:'Intiface',intifaceDeviceName:'Device'}),output({type:'Intiface',intifaceDeviceName:'device'})]}).outputs.length,2);
  assert.equal(normalizeConfiguration({outputs:[output({type:'Intiface',intifaceDeviceName:'Same model',intifaceDeviceIndex:0}),output({type:'Intiface',intifaceDeviceName:'Same model',intifaceDeviceIndex:1})]}).outputs.length,2);
});
test('serial paths and WebSocket path/query keep case while COM names and hosts normalize',()=>{
  assert.equal(normalizeConfiguration({outputs:[output({type:'TCodeSerial',comPort:'/dev/PortA'}),output({type:'TCodeSerial',comPort:'/dev/porta'})]}).outputs.length,2);
  assert.throws(()=>normalizeConfiguration({outputs:[output({type:'TCodeSerial',comPort:'com3'}),output({type:'TCodeSerial',comPort:'COM3'})]}),/duplicate/);
  assert.equal(normalizeConfiguration({outputs:[output({type:'TCodeWebSocket',websocketAddress:'ws://localhost:1234/A?key=X'}),output({type:'TCodeWebSocket',websocketAddress:'ws://127.0.0.1:1234/a?key=x'})]}).outputs.length,2);
});
test('Bridge metadata roundtrips with exact profile names, adapter and port checks',()=>{
  const config=normalizeConfiguration({outputs:[output({type:'BleBridge',bridge:{protocol:'youou-vx001',device:'test-device',adapter:'adapter0',listenPort:0}})]});
  assert.equal(config.outputs[0]?.bridge?.protocol,'youou-vx001');assert.equal(config.outputs[0]?.bridge?.adapter,'adapter0');assert.equal(config.outputs[0]?.bridge?.listenPort,0);
  assert.throws(()=>normalizeConfiguration({outputs:[output({type:'BleBridge',bridge:{protocol:'youou',device:'x'}})]}));
});
for(const key of ['python','scriptPath','ScriptPath','PYTHON'])test('public configuration cannot select native code path '+key,()=>{
  assert.throws(()=>normalizeConfiguration({outputs:[output({type:'BleBridge',bridge:{protocol:'loob',device:'test-device',[key]:'untrusted-program'}})]}),/trusted host settings/);
});
test('protocol features import PascalCase and retain all twelve target axes',()=>{
  const result=normalizeConfiguration({ProtocolInputs:[{Id:'input',Enabled:true,Type:'Buttplug',Features:[{Channel:'aux',Name:'Auxiliary',Actuator:'Position',ScalarType:'Vibrate',TargetAxis:'A2'}]}]});
  assert.equal(result.protocolInputs[0]?.features[0]?.targetAxis,'A2');
});
test('computed zero-weight references still validate cycles and missing IDs',()=>{
  assert.throws(()=>normalizeComputedSignals([calculation('A',[input({sourceMode:'Computed',oscPath:'A',weight:0}),input({value:1})])]),/cycles/);
  assert.throws(()=>normalizeComputedSignals([calculation('A',[input({sourceMode:'Computed',oscPath:'Missing',weight:0}),input({value:1})])]),/Unknown/);
});
for(const patch of [{id:'1bad'},{id:'has space'},{operation:'Difference'},{maxAgeMs:50},{timeMs:60001},{frequencyHz:101},{operation:'Hysteresis',threshold:.2,releaseThreshold:.5},{operation:'DeadZone',threshold:-1}])test('computed validation rejects '+JSON.stringify(patch),()=>assert.throws(()=>normalizeComputedSignals([calculation('A',[input()],patch)])));
test('graph depth and count limits prevent unbounded evaluation',()=>{
  const definitions=Array.from({length:17},(_,i)=>calculation('A'+i,[i?input({sourceMode:'Computed',oscPath:'A'+(i-1)}):input()]));
  assert.throws(()=>normalizeComputedSignals(definitions),/16 levels/);assert.throws(()=>normalizeComputedSignals(Array.from({length:65},(_,i)=>calculation('N'+i,[input()]))),/64/);
});
test('Intiface position aliases overlap; separate feature indices remain independent',()=>{
  assert.throws(()=>normalizeFeatureRoutes([{outputType:'Position',sourceAxis:'L0'},{outputType:'HwPositionWithDuration',sourceAxis:'L1'}]),/overlap/);
  assert.equal(normalizeFeatureRoutes([{outputType:'Position',sourceAxis:'L0',featureIndex:0},{outputType:'Position',sourceAxis:'L1',featureIndex:1}]).length,2);
});
for(const patch of [{rateHz:0},{inputMin:1,inputMax:1},{outputMax:Infinity},{epsilon:-1},{sendMode:'unknown'},{valueType:'byte'},{channel:3}])test('binding rejects invalid range/type/schedule '+JSON.stringify(patch),()=>assert.throws(()=>normalizeSignalOutput({bindings:[{...defaultSignalOutputBinding(),...patch}]})));
test('enabled generic outputs require bindings; motion outputs retain frame routing',()=>{
  assert.throws(()=>normalizeConfiguration({outputs:[output({type:'HttpJson',enabled:true,websocketAddress:'https://example.invalid/'})]}),/binding/);
  assert.equal(normalizeConfiguration({outputs:[output({type:'SensaHttp',enabled:true,websocketAddress:'https://example.invalid/api'})]}).outputs[0]?.type,'SensaHttp');
});
test('spatial input coordinates cannot be mixed or used as implicit gates',()=>{
  assert.throws(()=>normalizeConfiguration({signals:[{sourceMode:'SensaPoint',oscPath:'a'},{sourceMode:'SensaPose',oscPath:'b'}]}),/Spatial/);
  assert.throws(()=>normalizeConfiguration({signals:[{sourceMode:'SensaPoint',oscPath:'a',role:'GateEnable'}]}),/Spatial/);
});
for(const text of ['', 'abc','The quick brown fox jumps over the lazy dog','多宿主来源\0test'.repeat(100)])test('pure SHA256 provenance matches Node crypto '+text.slice(0,20),async()=>{
  const {createHash}=await import('node:crypto');assert.equal(sha256(text),createHash('sha256').update(text).digest('hex').toUpperCase());
});

test('OSC and OGB forwarding validate exact local-loop targets including mapped IPv6',()=>{
  assert.throws(()=>normalizeConfiguration({osc:{enabled:true,receiverHost:'::',receiverPort:9001,hub:{enabled:true,targets:[{host:'127.0.0.1',port:9001}]}}}),/own listener/);
  assert.throws(()=>normalizeConfiguration({osc:{receiverHost:'127.0.0.1',receiverPort:9001,ogbControl:{enabled:true,host:'::ffff:127.0.0.1',port:9001}}}),/own listener/);
  assert.throws(()=>normalizeConfiguration({osc:{ogbControl:{enabled:true,host:'239.1.1.1',port:9000}}}),/unicast/);
  assert.throws(()=>normalizeConfiguration({osc:{hub:{targets:[{host:'LOCALHOST',port:9002},{host:'127.0.0.1',port:9002}]}}}),/duplicate/);
});
test('OSC output rejects direct and computed feedback into the parameter it reads',()=>{
  const binding={...defaultSignalOutputBinding(),source:input({sourceMode:'Direct',oscPath:'Loop'}),address:'/avatar/parameters/Loop'};
  assert.throws(()=>normalizeConfiguration({outputs:[output({type:'OscParameter',host:'127.0.0.1',port:9000,signal:{bindings:[binding]}})]}),/feedback/);
  assert.throws(()=>normalizeConfiguration({computedSignals:[calculation('Calc',[input({sourceMode:'Direct',oscPath:'Loop'})])],outputs:[output({type:'OscParameter',host:'127.0.0.1',port:9000,signal:{bindings:[{...binding,source:input({sourceMode:'Computed',oscPath:'Calc'})}]}})]}),/feedback/);
});
for(const [type,signal] of [['HttpJson',{bindings:[{...defaultSignalOutputBinding(),address:''}]}],['Mqtt',{mqttTopicPrefix:'unsafe/+',bindings:[{...defaultSignalOutputBinding(),address:'value'}]}],['Midi',{bindings:[{...defaultSignalOutputBinding(),address:'CC/17/1'}]}]])test('output configuration uses real wire codec validation '+type,()=>{
  assert.throws(()=>normalizeConfiguration({outputs:[output({type,websocketAddress:'https://example.invalid/value',signal})]}));
});
test('allowed OSC source entries are canonical numeric addresses, not arbitrary hosts or malformed IPv6',()=>{
  assert.deepEqual(normalizeConfiguration({osc:{allowedSourceAddresses:['::ffff:127.0.0.1','127.0.0.1','::1']}}).osc.allowedSourceAddresses,['127.0.0.1','::1']);
  for(const value of ['localhost','not.an.ip',':1','gg::1','999.1.2.3'])assert.throws(()=>normalizeConfiguration({osc:{allowedSourceAddresses:[value]}}));
});
