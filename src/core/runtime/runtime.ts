import type { AppConfig,ComputedSignalInputConfig,ComputedSignalSample,MotionAxis,MotionValues,RuntimeInputMode,RuntimeMotionFrame,TCodeCommandMode,SignalMapping } from './model.ts';
import { isMotionAxis,motionAxes,invalidSample,sample } from './model.ts';
import { normalizeConfiguration,createDefaultConfiguration,requireConfiguration,isTemporal } from './configuration.ts';
import { ComputedSignalEvaluator } from './computed.ts';
import { ComputedSignalResolver,ogbDepthAddress,ogbTouchAddress } from './resolver.ts';
import { OscParameterStore,oscNumber,matchesOscPath,type OscSnapshotEntry,type OscEntry } from '../protocols/osc.ts';
import { ExternalControlStore } from '../protocols/external-control.ts';
import type { ExternalControlBatch } from '../protocols/input-types.ts';
import { RuntimeScriptPlayer,type ScriptOptions } from './script.ts';
import { RuntimeMotionRecorder } from './recording.ts';
import { SignalChannelProcessor,fuseSignals,neutralFrame,applyMotionPatch,framesEqual,frameForApi,SpsDepthEstimator,ContinuousAngle,type SignalMixInput } from './motion.ts';
import { observeTracking,observePoses,getMetric,getPoseMetric,trackingMatches,poseMatches,type TrackingObservation,type PoseObservation,poseProtocol } from './tracking.ts';
type Awaitable<T> = T | PromiseLike<T>;
export interface RuntimeEngineOptions {
  now?:()=>number;sendFrame?:(frame:RuntimeMotionFrame)=>Awaitable<void>;stopOutputs?:()=>Awaitable<void>;
  stopUnboundOutputs?:()=>Awaitable<void>;
  cancelPendingOutputs?:()=>void;oscStore?:OscParameterStore;externalControls?:ExternalControlStore;
  readFeedback?:(path:string,now:number)=>ComputedSignalSample;readReplay?:(path:string,now:number)=>ComputedSignalSample;
  onChanged?:()=>void;onError?:(error:unknown)=>void;
}
interface Work {sequence:number;generation:number;kind:'frame'|'stop';unbound?:boolean;patch?:Partial<MotionValues>;mode?:TCodeCommandMode;motionValue?:number;axes?:MotionAxis[];batch?:ExternalControlBatch;channel?:string;}
/** The single host-neutral signal runtime. Hosts supply scheduling, files and transports. */
export class RuntimeEngine {
  readonly now:()=>number;readonly oscStore:OscParameterStore;readonly externalControls:ExternalControlStore;readonly script:RuntimeScriptPlayer;readonly recorder:RuntimeMotionRecorder;
  readonly onChanged=new Set<()=>void>();readonly options:RuntimeEngineOptions;
  private config:AppConfig;private inputMode:RuntimeInputMode='Manual';private active=false;private emergency=false;private disposed=false;private activationBlocks=0;
  private generation=0;private workSequence=0;private queue=new Map<string,Work>();private worker:Promise<void>|null=null;private forceFrame=true;private gateStopSent=false;
  private current=neutralFrame();private manual=neutralFrame();private manualEnabled=false;private scriptStopped=true;private lastEventAt:number;private activatedAt:number;private lastWatchdogAt:number;
  private scriptAxis:MotionAxis='L0';
  private processors:SignalChannelProcessor[]=[];private evaluator:ComputedSignalEvaluator;private previewEvaluator:ComputedSignalEvaluator;private computed:Record<string,ComputedSignalSample>={};private computedAt=-1;private previewAt=-1;
  private gateClosed=false;private poseBlocked=false;private computedBlocked=false;private computedReason='';private spatialReason='';private activePoseKey:string|null=null;
  private rollKey:string|null=null;private continuousRoll=new ContinuousAngle();private estimators=new Map<string,SpsDepthEstimator>();private sourceKey:string|null=null;
  private oscDirty=true;private geometryDueAt=0;private geometryPending=false;private resolverAt=-1;private resolverRevision=-1;private oscResolver:ComputedSignalResolver|null=null;
  private latestPoints:TrackingObservation[]=[];private latestPoses:PoseObservation[]=[];
  private trackingRevision=-1;private trackingSource:string|null=null;private trackingAt=-Infinity;
  private readonly oscHandler:(path:string)=>void;private readonly avatarHandler:()=>void;private readonly protocolHandler:(batch:ExternalControlBatch)=>void;private readonly protocolStopHandler:(inputId:string,channel:string|null,sequence:number)=>void;
  constructor(config:AppConfig=createDefaultConfiguration(),options:RuntimeEngineOptions={}) {
    this.options=options;this.now=options.now??Date.now;this.config=normalizeConfiguration(config);this.lastEventAt=this.activatedAt=this.lastWatchdogAt=this.now();
    this.oscStore=options.oscStore??new OscParameterStore(this.now);this.externalControls=options.externalControls??new ExternalControlStore(this.config.protocolInputs,this.now);
    this.script=new RuntimeScriptPlayer(this.now);this.recorder=new RuntimeMotionRecorder(this.now);this.evaluator=new ComputedSignalEvaluator(this.config.computedSignals);this.previewEvaluator=new ComputedSignalEvaluator(this.config.computedSignals);
    this.rebuild();
    this.oscHandler=path=>{this.oscDirty=true;this.resolverAt=-1;if(this.usesGeometry()||this.config.signals.some(item=>['OgbDepth','OgbTouch','SpsSocketDepth','Computed'].includes(item.sourceMode))){if(!this.geometryPending){this.geometryDueAt=this.now()+30;this.geometryPending=true;}}else if(this.active&&this.inputMode==='Osc')this.refreshOsc();void path;this.changed();};
    this.avatarHandler=()=>{for(const processor of this.processors)processor.reset();this.estimators.clear();this.resetSignalProcessing();if(this.active&&['Osc','Combined'].includes(this.inputMode))this.emergencyStop();this.changed();};
    this.protocolHandler=batch=>this.receiveProtocol(batch);this.protocolStopHandler=(id,channel,sequence)=>this.receiveProtocolStop(id,channel,sequence);
    this.oscStore.onSet.add(this.oscHandler);this.oscStore.onAvatarChanged.add(this.avatarHandler);this.externalControls.onBatch.add(this.protocolHandler);this.externalControls.onStop.add(this.protocolStopHandler);
    this.script.onFrame.add(value=>{if(!this.disposed&&this.active&&!this.emergency&&this.inputMode==='Script'){this.scriptStopped=false;this.queueFrame({[this.scriptAxis]:value},'script','None',undefined,[this.scriptAxis]);}});
    this.script.onStopped.add(()=>{this.scriptStopped=true;this.computedAt=this.previewAt=-1;this.resolverAt=-1;if(this.active&&this.inputMode==='Script'){this.generation++;this.queue.clear();this.options.cancelPendingOutputs?.();this.forceFrame=true;this.queueStop();}});
    this.script.onChanged.add(()=>this.changed());
  }
  getConfig():AppConfig{return this.config;}
  applyConfiguration(config:AppConfig|unknown):AppConfig {this.setInputActive(false);const candidate=normalizeConfiguration(config);this.config=candidate;this.externalControls.configure(candidate.protocolInputs);this.rebuild();this.changed();return this.config;}
  private rebuild():void {this.processors=this.config.signals.filter(item=>item.oscPath).map(item=>new SignalChannelProcessor(item));this.evaluator=new ComputedSignalEvaluator(this.config.computedSignals);this.previewEvaluator=new ComputedSignalEvaluator(this.config.computedSignals);this.estimators.clear();this.resetSignalProcessing();this.oscDirty=true;this.geometryPending=false;this.geometryDueAt=0;this.forceFrame=true;this.activePoseKey=this.rollKey=null;this.continuousRoll=new ContinuousAngle();}
  blockInputActivation():()=>void {this.activationBlocks++;this.setInputActive(false);let released=false;return()=>{if(!released){released=true;this.activationBlocks=Math.max(0,this.activationBlocks-1);}};}
  setInputMode(value:string):void {
    const mode=(['Manual','Osc','Script','Protocol','Combined'] as const).find(candidate=>candidate.toLowerCase()===value.toLowerCase());requireConfiguration(mode,'Choose a supported input mode.');if(mode===this.inputMode)return;
    this.setInputActive(false);this.inputMode=mode;this.gateClosed=false;this.poseBlocked=mode==='Osc'&&this.usesGeometry();this.computedBlocked=mode==='Osc'&&this.config.signals.some(item=>item.sourceMode==='Computed');
    if(!['Script','Combined'].includes(mode))this.script.pause();this.oscDirty=true;this.changed();
  }
  setInputActive(value:boolean):void {
    requireConfiguration(typeof value==='boolean','Specify a boolean input activation.');if(value&&this.emergency)return;if(value&&this.activationBlocks)throw new Error('Updating input setup; enable input after it completes.');if(this.active===value)return;
    this.active=value;this.generation++;this.activatedAt=this.now();this.externalControls.clearCommands();
    for(const [key,work] of this.queue)if(!value||work.kind!=='stop')this.queue.delete(key);
    this.options.cancelPendingOutputs?.();this.resetSignalProcessing();this.forceFrame=true;this.gateStopSent=false;
    if(!value){this.script.pause();this.queueStop();}else {if(this.inputMode==='Osc')this.estimators.clear();if(this.inputMode==='Script')this.scriptStopped=false;this.oscDirty=true;
      if(this.inputMode==='Manual'&&this.manualEnabled)this.queueManual();else if(this.inputMode==='Script'&&this.script.getSnapshot().loaded)this.queueFrame({[this.scriptAxis]:this.script.getSnapshot().currentL0},'script','None',undefined,[this.scriptAxis]);else if(this.inputMode==='Osc')this.refreshOsc();}
    this.changed();
  }
  emergencyStop():void {if(this.emergency)return;this.emergency=true;this.active=false;this.generation++;this.queue.clear();this.options.cancelPendingOutputs?.();this.externalControls.clearCommands();this.resetSignalProcessing();this.script.pause();this.forceFrame=true;this.queueStop();this.changed();}
  clearEmergency():void {this.emergency=false;this.changed();}
  setManual(frame:RuntimeMotionFrame|Partial<MotionValues>|null):void {
    if(frame===null){this.manualEnabled=false;if(this.inputMode==='Manual')this.setInputActive(false);this.changed();return;}
    const provided:RuntimeMotionFrame='values' in frame ? frame : {values:{...this.manual.values,...frame},deltaMs:0};
    const values={...this.manual.values};for(const axis of motionAxes){const value=provided.values[axis];requireConfiguration(typeof value==='number'&&Number.isFinite(value),'Manual values must be finite.');values[axis]=Math.max(0,Math.min(1,value));}
    const mode=provided.requestedCommandMode;requireConfiguration(mode===undefined||['None','Interval','Speed'].includes(mode),'Unsupported manual motion mode.');
    const axes=provided.activeAxes;
    requireConfiguration(axes===undefined||Array.isArray(axes)&&axes.length>=1&&axes.length<=12&&new Set(axes).size===axes.length&&axes.every(isMotionAxis),'Choose one or more unique motion axes.');
    const raw=provided.requestedMotionValue;requireConfiguration(raw===undefined||Number.isFinite(raw),'Motion value must be finite.');
    const motionValue=mode==='None'?undefined:Math.max(1,Math.min(mode==='Interval'?1000:999,raw&&raw>0?Math.trunc(raw):mode==='Interval'?100:999));
    this.manual={values,deltaMs:mode==='Interval'?(motionValue??100):1000,...(mode?{requestedCommandMode:mode}:{}),...(motionValue===undefined?{}:{requestedMotionValue:motionValue}),...(axes?{activeAxes:[...axes]}:{})};this.manualEnabled=true;this.resolverAt=-1;
    if(this.active&&this.inputMode==='Manual'&&!this.emergency)this.queueManual();this.changed();
  }
  clearManual():void{this.setManual(null);}
  private queueManual():void{const axes=this.manual.activeAxes;const patch=axes?Object.fromEntries(axes.map(axis=>[axis,this.manual.values[axis]])):this.manual.values;this.queueFrame(patch,'manual',this.manual.requestedCommandMode,this.manual.requestedMotionValue,axes?[...axes]:undefined);}
  setOscSource(source:string|null):void {if(source===this.sourceKey)return;this.setInputActive(false);this.sourceKey=source;this.oscStore.preferredSourceKey=source;this.estimators.clear();this.activePoseKey=null;this.resetSignalProcessing();this.oscDirty=true;this.changed();}
  resetSignalProcessing():void {this.evaluator.reset();this.previewEvaluator.reset();this.computed={};this.computedAt=this.previewAt=-1;this.resolverAt=-1;this.computedReason='';}
  getComputedSignals():Record<string,ComputedSignalSample>{const now=this.now();if(this.active&&this.computedAt===now)return this.computed;if(this.active){this.computed=this.evaluator.evaluate(now,input=>this.resolveLeaf(input,now));this.computedAt=now;return this.computed;}
    if(this.previewAt!==now){this.computed=this.previewEvaluator.evaluate(now,input=>this.resolveLeaf(input,now));this.previewAt=now;}return this.computed;}
  resolveSignalInput(input:ComputedSignalInputConfig,now=this.now()):ComputedSignalSample {if(input.sourceMode==='Computed'){if(this.computedAt!==now){this.computed=this.evaluator.evaluate(now,item=>this.resolveLeaf(item,now));this.computedAt=now;}return this.computed[input.oscPath]??invalidSample('Choose an existing computation.');}return this.resolveLeaf(input,now);}
  private resolveLeaf(input:ComputedSignalInputConfig,now:number):ComputedSignalSample {
    switch(input.sourceMode) {
      case 'Constant':return sample(input.value,now);
      case 'Manual':return isMotionAxis(input.oscPath)?sample(this.manual.values[input.oscPath],now,null,null,'manual:'+input.oscPath):invalidSample('Choose a manual axis.');
      case 'Script':{const state=this.script.getSnapshot();const value=input.oscPath==='Progress'?(state.durationMs?state.positionMs/state.durationMs:0):input.oscPath==='Time'?state.positionMs/1000:input.oscPath==='L0'?state.currentL0:NaN;
        return state.loaded&&(state.playing||this.inputMode==='Script'&&!this.scriptStopped)?sample(value,now,null,null,`script:${state.fileName}:${input.oscPath}`):invalidSample('Waiting for script playback.');}
      case 'Protocol':return ['Protocol','Combined'].includes(this.inputMode)?this.externalControls.read(input.oscPath,now):invalidSample('Select Protocol or Combined input mode.');
      case 'DeviceFeedback':return this.options.readFeedback?.(input.oscPath,now)??invalidSample('Waiting for device feedback.');
      case 'RecordingReplay':return this.options.readReplay?.(input.oscPath,now)??invalidSample('Waiting for session replay.');
      default:{if(!this.oscResolver||this.resolverAt!==now||this.resolverRevision!==this.oscStore.revision){this.oscResolver=new ComputedSignalResolver(this.oscStore.snapshotEntries(),this.preferredSource(),now,this.spatialAge(),this.config.osc.allowExperimentalSpatialInput,this.config.osc.inputTimeoutMs);this.resolverAt=now;this.resolverRevision=this.oscStore.revision;}return this.oscResolver.resolve(input);}
    }
  }
  getScriptSnapshot():ReturnType<RuntimeScriptPlayer['getSnapshot']>&{axis:MotionAxis}{return {...this.script.getSnapshot(),axis:this.scriptAxis};}
  loadScript(name:string,content:unknown,options:ScriptOptions={}):ReturnType<RuntimeScriptPlayer['getSnapshot']>{this.setInputActive(false);const result=this.script.load(name,content);this.configureScript(options);if(this.inputMode!=='Combined')this.setInputMode('Script');this.changed();return result;}
  playScript(options:ScriptOptions={}):ReturnType<RuntimeScriptPlayer['getSnapshot']>{if(options.axis!==undefined&&options.axis!==this.scriptAxis)this.configureScript(options);return this.script.play(options);}
  pauseScript():ReturnType<RuntimeScriptPlayer['getSnapshot']>{return this.script.pause();}
  stopScript():ReturnType<RuntimeScriptPlayer['getSnapshot']>{return this.script.stop();}
  clearScript():ReturnType<RuntimeScriptPlayer['getSnapshot']>{this.setInputActive(false);return this.script.clear();}
  configureScript(options:ScriptOptions):ReturnType<RuntimeScriptPlayer['getSnapshot']>{if(options.axis!==undefined){requireConfiguration(isMotionAxis(options.axis),'Choose a supported script axis.');if(options.axis!==this.scriptAxis){this.setInputActive(false);this.scriptAxis=options.axis;}}return this.script.configure(options);}
  seekScript(position:number):ReturnType<RuntimeScriptPlayer['getSnapshot']>{return this.script.seek(position);}
  stepScript(direction:number):ReturnType<RuntimeScriptPlayer['getSnapshot']>{return this.script.step(direction);}
  setScriptSpeed(speed:number):void{this.script.configure({speed});}
  setScriptLoop(loop:boolean):void{this.script.configure({loop});}
  startRecording(_name?:string):void{this.recorder.start();this.changed();}
  stopRecording():void{this.recorder.stop();this.changed();}
  getRecordingSnapshot():ReturnType<RuntimeMotionRecorder['snapshot']>{return this.recorder.snapshot();}
  exportRecording():ReturnType<RuntimeMotionRecorder['export']>{return this.recorder.export();}
  getSnapshot():Record<string,unknown> {
    this.refreshTracking(this.now());
    return {inputMode:this.inputMode,inputActive:this.active,isEmergency:this.emergency,emergencyStopped:this.emergency,canSend:this.canSend(),canRouteSignals:this.canRoute(),gateClosed:this.gateClosed,poseBlocked:this.poseBlocked,
      computedInputBlocked:this.inputMode==='Osc'&&this.computedBlocked,computedInputBlockedReason:this.inputMode==='Osc'?this.computedReason:'',spatialInputBlockedReason:this.inputMode==='Osc'?this.spatialReason:'',spatialInputStatus:this.spatialReason,spatialSampleMaxAgeMs:this.spatialAge(),manualOverrideEnabled:this.manualEnabled,
      command:frameForApi(this.current),manualCommand:frameForApi(this.manual),currentFrame:structuredClone(this.current),manualFrame:structuredClone(this.manual),script:this.getScriptSnapshot(),
      poseTracking:{observations:this.latestPoses,activeKey:this.activePoseKey??'',spsRoots:this.latestPoints},computedSignals:this.computed};
  }
  tick(now=this.now()):void {
    if(this.disposed)return;this.script.tick();this.externalControls.expire();
    if(this.active&&this.inputMode==='Osc'&&(this.oscDirty&&now>=this.geometryDueAt||this.config.computedSignals.some(item=>isTemporal(item.operation))||this.config.signals.some(item=>item.sourceMode==='Computed')))this.refreshOsc();
    if(now-this.lastWatchdogAt>=500){this.lastWatchdogAt=now;this.checkTimeout(now);}
  }
  private canRoute():boolean{return !this.disposed&&!this.emergency&&this.active&&this.activationBlocks===0;}
  private canSend():boolean{return this.canRoute()&&!this.gateClosed&&!this.poseBlocked&&!(this.inputMode==='Osc'&&this.computedBlocked)&&!(this.inputMode==='Script'&&this.scriptStopped);}
  private spatialAge():number{return this.config.osc.inputTimeoutMs>0?this.config.osc.inputTimeoutMs:poseProtocol.maximumSampleAgeMs;}
  private preferredSource():string|null{return this.sourceKey??this.oscStore.preferredSourceKey;}
  private refreshTracking(now:number):void {
    const source=this.preferredSource();
    if(this.trackingRevision===this.oscStore.revision&&this.trackingSource===source&&now>=this.trackingAt&&now-this.trackingAt<100)return;
    const entries=this.oscStore.snapshotEntries();this.latestPoints=observeTracking(entries,source,now,this.spatialAge());this.latestPoses=observePoses(entries,source,now,this.spatialAge());
    this.trackingRevision=this.oscStore.revision;this.trackingSource=source;this.trackingAt=now;
  }
  private usesGeometry():boolean{return this.config.signals.some(item=>['SensaPoint','SensaPose'].includes(item.sourceMode))||this.config.computedSignals.some(item=>item.inputs.some(input=>['SensaPoint','SensaPose'].includes(input.sourceMode)));}
  private refreshOsc():void {
    if(!this.canRoute()||this.inputMode!=='Osc')return;this.oscDirty=false;this.geometryPending=false;const now=this.now(),source=this.preferredSource(),entries=this.oscStore.snapshotEntries();
    const pointMappings=this.processors.filter(item=>item.mapping.sourceMode==='SensaPoint'),poseMappings=this.processors.filter(item=>item.mapping.sourceMode==='SensaPose');
    const spatialRoles=new Set([...pointMappings,...poseMappings].map(item=>item.mapping.role));const shadows=(mapping:SignalMapping):boolean=>spatialRoles.has(mapping.role)||mapping.role==='DepthOverride'&&spatialRoles.has('Depth');
    const computedMappings=this.processors.filter(item=>item.mapping.sourceMode==='Computed'&&!shadows(item.mapping));const computed=this.getComputedSignals();
    const bad=computedMappings.map(item=>computed[item.mapping.oscPath]).find(item=>!item||!item.valid);this.computedBlocked=Boolean(bad)||computedMappings.some(item=>!computed[item.mapping.oscPath]);this.computedReason=bad?.reason??(this.computedBlocked?'Waiting for calculation inputs.':'');
    this.refreshTracking(now);
    let point:TrackingObservation|undefined,pose:PoseObservation|undefined;
    if(this.config.osc.allowExperimentalSpatialInput){const points=this.latestPoints.filter(item=>item.isMappablePoint&&pointMappings.some(mapping=>trackingMatches(item,mapping.mapping.oscPath)));
      if(points.length===1&&points[0]?.valid&&pointMappings.every(mapping=>getMetric(points[0]!,mapping.mapping.pointMetric)!==undefined))point=points[0];
      const poses=this.latestPoses.filter(item=>poseMappings.some(mapping=>poseMatches(item,mapping.mapping.oscPath))&&item.valid&&item.engaged);
      if(source||new Set(poses.map(item=>item.sourceKey)).size<=1){pose=poses.sort((a,b)=>b.depth-a.depth||(a.key<b.key?-1:1))[0];const previous=poses.find(item=>item.key===this.activePoseKey);if(pose&&previous&&pose.depth-previous.depth<.05)pose=previous;}
    }
    this.poseBlocked=pointMappings.length>0&&!point||poseMappings.length>0&&!pose;this.spatialReason=this.usesGeometry()&&!this.config.osc.allowExperimentalSpatialInput?'Experimental spatial input is disabled.':this.poseBlocked?'Waiting for complete, fresh local geometry.':'';
    this.activePoseKey=pose?.key??null;if(pose&&this.rollKey!==pose.key){this.rollKey=pose.key;this.continuousRoll=new ContinuousAngle();}const roll=pose?this.continuousRoll.update(pose.roll):0;
    const signals:SignalMixInput[]=[];let gate=true,override:number|null=null;
    for(const processor of this.processors){const mapping=processor.mapping;let values:number[]=[];
      if(mapping.sourceMode==='SensaPoint'){const value=point&&trackingMatches(point,mapping.oscPath)?getMetric(point,mapping.pointMetric):undefined;if(value!==undefined)values=[value];}
      else if(mapping.sourceMode==='SensaPose'){if(pose&&poseMatches(pose,mapping.oscPath))values=[mapping.poseMetric==='Roll'?roll:getPoseMetric(pose,mapping.poseMetric)];}
      else if(shadows(mapping))continue;
      else if(mapping.sourceMode==='Computed'){const result=computed[mapping.oscPath];if(result?.valid&&result.value!==null)values=[result.value];}
      else values=this.scalarValues(mapping,entries,source,now);
      let thisGate=false;for(const value of values){if(!Number.isFinite(value))continue;const result=processor.processSample(value);
        if(mapping.role==='GateEnable')thisGate||=result.output>.5;else if(mapping.role==='DepthOverride')override=Math.max(override??0,result.output);else signals.push({role:mapping.role,value:result.output,priority:result.normalized});}
      if(mapping.role==='GateEnable')gate&&=thisGate;
    }
    this.gateClosed=!gate;if(override!==null){for(let i=signals.length-1;i>=0;i--)if(signals[i]?.role==='Depth')signals.splice(i,1);signals.push({role:'Depth',value:override,priority:1});}
    if(!this.canSend()){this.forceFrame=true;if(!this.gateStopSent){this.queueStop(true);this.gateStopSent=true;}this.changed();return;}
    this.gateStopSent=false;const patch=fuseSignals(signals);if(Object.keys(patch).length)this.queueFrame(patch,'osc');this.changed();
  }
  private scalarValues(mapping:SignalMapping,entries:readonly OscSnapshotEntry[],source:string|null,now:number):number[] {
    const filtered=entries.filter(item=>!source||item.entry.source.key===source);const fresh=(at:number):boolean=>at<=now&&(this.config.osc.inputTimeoutMs<=0||now-at<=this.config.osc.inputTimeoutMs);
    const find=(path:string,key:string):OscEntry|undefined=>filtered.find(item=>item.path===path&&item.entry.source.key===key)?.entry;
    const unit=(entry:OscEntry|undefined):boolean=>Boolean(entry)&&oscNumber(entry!.value)>=0&&oscNumber(entry!.value)<=1;
    if(mapping.sourceMode==='OgbTouch'){
      const groups=new Map<string,{value:string;close:string;needsClose:boolean;source:string}>();for(const item of filtered){const address=ogbTouchAddress(item.path);if(address&&matchesOscPath(mapping.oscPath,address.value))groups.set(item.entry.source.key+'|'+address.value,{...address,source:item.entry.source.key});}
      return [...groups.values()].flatMap(item=>{const value=find(item.value,item.source),close=find(item.close,item.source);if(!value||!fresh(value.timestampMs))return [];return [(!item.needsClose||unit(close)&&oscNumber(close!.value)>.5)&&unit(value)?oscNumber(value.value):0];});
    }
    if(mapping.sourceMode==='OgbDepth'){
      const groups=new Map<string,{address:NonNullable<ReturnType<typeof ogbDepthAddress>>;source:string}>();for(const item of filtered){const address=ogbDepthAddress(item.path);if(address&&(matchesOscPath(mapping.oscPath,address.legacy)||address.socket&&matchesOscPath(mapping.oscPath,address.root)))groups.set(item.entry.source.key+'|'+address.legacy,{address,source:item.entry.source.key});}
      return [...groups.values()].flatMap(({address,source:key})=>{const root=find(address.root,key),tip=find(address.tip,key),legacy=find(address.legacy,key),close=find(address.close,key),modern=address.socket&&((root?oscNumber(root.value):0)>0||(tip?oscNumber(tip.value):0)>0),stamp=modern||!legacy?Math.max(root?.timestampMs??0,tip?.timestampMs??0):legacy.timestampMs;
        if(!fresh(stamp)){this.estimators.get(key+'|'+address.root)?.reset();return [];}
        if(modern)return [this.processPair(key,address.root,root,tip)];this.estimators.get(key+'|'+address.root)?.reset();const open=!address.socket||address.party!=='Others'||!close||unit(close)&&oscNumber(close.value)>.5;return [unit(legacy)&&open?oscNumber(legacy!.value):0];});
    }
    return filtered.filter(item=>matchesOscPath(mapping.oscPath,item.path)).flatMap(item=>{
      if(mapping.sourceMode==='SpsSocketDepth'){const tip=item.path.endsWith('NewRoot')?find(item.path.slice(0,-7)+'NewTip',item.entry.source.key):undefined;if(!tip||!fresh(Math.max(item.entry.timestampMs,tip.timestampMs)))return [];return [this.processPair(item.entry.source.key,item.path,item.entry,tip)];}
      return fresh(item.entry.timestampMs)?[oscNumber(item.entry.value)]:[];
    });
  }
  private processPair(source:string,path:string,root:OscEntry|undefined,tip:OscEntry|undefined):number {const key=source+'|'+path;let estimator=this.estimators.get(key);if(!estimator){if(this.estimators.size>=4096)return 0;estimator=new SpsDepthEstimator();this.estimators.set(key,estimator);}if(!root||!tip){estimator.reset();return 0;}return estimator.process(oscNumber(root.value),oscNumber(tip.value),tip.sequence);}
  private checkTimeout(now:number):void {
    if(!this.active||this.emergency||this.inputMode!=='Osc')return;
    const mappings=this.config.signals.filter(item=>item.sourceMode!=='Computed'&&item.role!=='GateEnable');if(!mappings.length)return;
    const source=this.preferredSource(),entries=this.oscStore.snapshotEntries(undefined,source);const spatial=mappings.some(item=>['SensaPoint','SensaPose'].includes(item.sourceMode)),timeout=spatial?this.spatialAge():this.config.osc.inputTimeoutMs;if(timeout<=0)return;
    const groups:number[][]=[];
    if(spatial){this.refreshTracking(now);const pointMappings=mappings.filter(item=>item.sourceMode==='SensaPoint');
      if(pointMappings.length){const points=this.latestPoints.filter(item=>item.isMappablePoint&&pointMappings.some(mapping=>trackingMatches(item,mapping.oscPath)));
        groups.push(points.length===1&&points[0]?.valid&&pointMappings.every(mapping=>getMetric(points[0]!,mapping.pointMetric)!==undefined)?[points[0]!.timestampMs]:[]);}
      if(mappings.some(item=>item.sourceMode==='SensaPose')){const selected=this.latestPoses.find(item=>item.key===this.activePoseKey&&item.valid&&item.engaged);groups.push(selected?[selected.timestampMs]:[]);}
    }
    if(!groups.length)groups.push(mappings.flatMap(mapping=>this.scalarTimestamps(mapping,entries)));
    if(groups.some(timestamps=>now-Math.max(this.activatedAt,...timestamps)>timeout))this.emergencyStop();
  }
  private scalarTimestamps(mapping:SignalMapping,entries:readonly OscSnapshotEntry[]):number[] {
    const find=(path:string,source:string):OscEntry|undefined=>entries.find(item=>item.path===path&&item.entry.source.key===source)?.entry;
    if(mapping.sourceMode==='OgbTouch'){
      const groups=new Map<string,{path:string;source:string}>();for(const item of entries){const address=ogbTouchAddress(item.path);if(address&&matchesOscPath(mapping.oscPath,address.value))groups.set(item.entry.source.key+'|'+address.value,{path:address.value,source:item.entry.source.key});}
      return [...groups.values()].flatMap(item=>{const value=find(item.path,item.source);return value?[value.timestampMs]:[];});
    }
    if(mapping.sourceMode==='OgbDepth'){
      const groups=new Map<string,{address:NonNullable<ReturnType<typeof ogbDepthAddress>>;source:string}>();for(const item of entries){const address=ogbDepthAddress(item.path);if(address&&(matchesOscPath(mapping.oscPath,address.legacy)||address.socket&&matchesOscPath(mapping.oscPath,address.root)))groups.set(item.entry.source.key+'|'+address.legacy,{address,source:item.entry.source.key});}
      return [...groups.values()].map(({address,source})=>{const root=find(address.root,source),tip=find(address.tip,source),legacy=find(address.legacy,source);
        const modern=address.socket&&((root?oscNumber(root.value):0)>0||(tip?oscNumber(tip.value):0)>0);return modern||!legacy?Math.max(root?.timestampMs??0,tip?.timestampMs??0):legacy.timestampMs;});
    }
    return entries.filter(item=>matchesOscPath(mapping.oscPath,item.path)).flatMap(item=>{if(mapping.sourceMode!=='SpsSocketDepth')return [item.entry.timestampMs];const tip=item.path.endsWith('NewRoot')?find(item.path.slice(0,-7)+'NewTip',item.entry.source.key):undefined;return tip?[Math.max(item.entry.timestampMs,tip.timestampMs)]:[];});
  }
  private receiveProtocol(batch:ExternalControlBatch):void {
    if(!this.canSend()||!['Protocol','Combined'].includes(this.inputMode))return;const input=this.externalControls.getInput(batch.inputId);if(!input?.routeToMotion)return;
    for(const command of batch.commands){const feature=input.features.find(item=>item.channel===command.channel);if(!feature||!isMotionAxis(feature.targetAxis))continue;
      this.queueFrame({[feature.targetAxis]:command.value},`protocol:${batch.inputId}/${command.channel}`,command.durationMs?'Interval':'None',command.durationMs,[feature.targetAxis],batch,command.channel);}
  }
  private receiveProtocolStop(inputId:string,channel:string|null,sequence:number):void {
    if(!this.canRoute()||!['Protocol','Combined'].includes(this.inputMode))return;
    if(!this.externalControls.getInput(inputId)?.routeToMotion)return;
    for(const key of this.queue.keys())if(key.startsWith('protocol:'+inputId+'/')&&(channel===null||key==='protocol:'+inputId+'/'+channel))this.queue.delete(key);
    this.options.cancelPendingOutputs?.();this.forceFrame=true;this.queue.set(`stop:${inputId}`,{kind:'stop',sequence:++this.workSequence,generation:this.generation});void sequence;this.drain();
  }
  private queueFrame(patch:Partial<MotionValues>,key:string,mode?:TCodeCommandMode,motionValue?:number,axes?:MotionAxis[],batch?:ExternalControlBatch,channel?:string):void {
    if(!this.canSend())return;this.queue.set(key,{kind:'frame',patch:{...patch},sequence:++this.workSequence,generation:this.generation,...(mode?{mode}:{}),...(motionValue!==undefined?{motionValue}:{}),...(axes?{axes}:{}),...(batch?{batch}:{}),...(channel?{channel}:{})});this.drain();
  }
  private queueStop(unbound=false):void {this.forceFrame=true;this.queue.set(unbound?'!stop-unbound':'!stop',{kind:'stop',sequence:++this.workSequence,generation:this.generation,...(unbound?{unbound:true}:{})});this.drain();}
  private drain():void {
    if(this.worker)return;let complete:()=>void=()=>{};this.worker=new Promise<void>(resolve=>{complete=resolve;});void(async()=>{
      try {while(this.queue.size){const first=[...this.queue].sort((a,b)=>a[1].sequence-b[1].sequence)[0];if(!first)break;this.queue.delete(first[0]);const work=first[1];
        if(work.kind==='stop'){await (work.unbound?(this.options.stopUnboundOutputs??this.options.stopOutputs)?.():this.options.stopOutputs?.());continue;}
        if(!this.canSend()||work.generation!==this.generation||work.batch&&work.channel&&!this.externalControls.isCurrent(work.batch,work.channel))continue;
        const now=this.now(),delta=work.mode==='Interval'&&work.motionValue&&work.motionValue>0?work.motionValue:Math.max(1,now-this.lastEventAt);this.lastEventAt=now;
        const patched=applyMotionPatch(this.current,work.patch??{},delta);const next:RuntimeMotionFrame={values:patched.values,deltaMs:delta,...(work.mode?{requestedCommandMode:work.mode}:{}),...(work.motionValue!==undefined?{requestedMotionValue:work.motionValue}:{}),...(work.axes?{activeAxes:work.axes}:{})};
        const changed=this.current.requestedCommandMode!==next.requestedCommandMode||this.current.requestedMotionValue!==next.requestedMotionValue||!framesEqual(this.current,next);this.current=next;
        if(!this.forceFrame&&!changed)continue;this.recorder.push(next);await this.options.sendFrame?.(structuredClone(next));if(work.generation===this.generation)this.forceFrame=false;this.changed();
      }}catch(error){this.forceFrame=true;this.options.onError?.(error);}finally{this.worker=null;complete();if(this.queue.size)this.drain();}
    })();
  }
  async flush():Promise<void>{while(this.worker)await this.worker;}
  private changed():void {if(this.disposed)return;this.options.onChanged?.();for(const listener of this.onChanged)listener();}
  dispose():void {if(this.disposed)return;this.setInputActive(false);this.disposed=true;this.generation++;this.queue.clear();this.oscStore.onSet.delete(this.oscHandler);this.oscStore.onAvatarChanged.delete(this.avatarHandler);this.externalControls.onBatch.delete(this.protocolHandler);this.externalControls.onStop.delete(this.protocolStopHandler);this.script.dispose();this.onChanged.clear();this.options.cancelPendingOutputs?.();void this.options.stopOutputs?.();}
}
