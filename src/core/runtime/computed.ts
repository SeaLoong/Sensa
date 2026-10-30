import type { ComputedSignalConfig,ComputedSignalInputConfig,ComputedSignalSample,ComputedSignalOperation } from './model.ts';
import { invalidSample,sample } from './model.ts';
import { normalizeComputedSignals,isGeometry,isTemporal } from './configuration.ts';
import { geometryValue,geometryFrame } from './geometry.ts';
import { sha256 } from './hash.ts';
export type SignalResolver = (input: ComputedSignalInputConfig) => ComputedSignalSample;
interface TemporalState {
  identity:string; startedMs:number; lastMs:number; initialized:boolean; value:number; previousValue:number;
  previousGate:boolean; gate:boolean; activeSinceMs:number|null; deadlineMs:number|null;
  lastOutput:ComputedSignalSample|null; history:{atMs:number;sample:ComputedSignalSample}[]; delayed:ComputedSignalSample|null;
}
const activeInputs=(signal:ComputedSignalConfig):ComputedSignalInputConfig[]=>signal.operation==='WeightedAverage' ? signal.inputs.filter(input=>input.weight>0) : signal.inputs;
const leafKey=(input:ComputedSignalInputConfig):string=>JSON.stringify([input.sourceMode,input.oscPath,input.pointMetric,input.poseMetric]);
function derivativeFrame(frame:string|null):string|null {
  if (!frame) return null;
  for (const [suffix,replacement] of [[':Velocity',':Acceleration'],[':Angle',':AngularVelocity'],[':ProximityRate',':ProximityAcceleration']] as const) if (frame.endsWith(suffix)) return frame.slice(0,-suffix.length)+replacement;
  return frame+':Velocity';
}
/** One bounded graph, one read per external leaf and one temporal result per clock tick. */
export class ComputedSignalEvaluator {
  readonly definitions:readonly ComputedSignalConfig[];
  private readonly lookup:Map<string,ComputedSignalConfig>;
  private readonly ordered:ComputedSignalConfig[]=[];
  private readonly temporal=new Map<string,TemporalState>();
  constructor(definitions:readonly ComputedSignalConfig[] = []) {
    this.definitions=normalizeComputedSignals(definitions); this.lookup=new Map(this.definitions.map(item=>[item.id,item]));
    const seen=new Set<string>(); const visit=(signal:ComputedSignalConfig):void=>{
      if (seen.has(signal.id)) return; seen.add(signal.id);
      for (const input of activeInputs(signal)) if (input.sourceMode==='Computed') {const dependency=this.lookup.get(input.oscPath);if(dependency)visit(dependency);}
      this.ordered.push(signal);
    }; for (const item of this.definitions) visit(item);
  }
  reset():void {this.temporal.clear();}
  getRequiredInputs(ids:readonly string[]):ComputedSignalInputConfig[] {
    const visited=new Set<string>(),leaves=new Map<string,ComputedSignalInputConfig>();
    const visit=(id:string):void=>{if(visited.has(id))return;visited.add(id);const item=this.lookup.get(id);if(!item)throw new Error(`Unknown computed signal: ${id}`);
      for(const input of activeInputs(item)) {if(input.sourceMode==='Computed')visit(input.oscPath);else if(input.sourceMode!=='Constant')leaves.set(leafKey(input),structuredClone(input));}};
    for(const id of ids)visit(id);return [...leaves.values()];
  }
  evaluate(nowMs:number,resolver:SignalResolver):Record<string,ComputedSignalSample> {
    const results:Record<string,ComputedSignalSample>=Object.create(null) as Record<string,ComputedSignalSample>,leaves=new Map<string,ComputedSignalSample>();
    for(const signal of this.ordered) {
      const inputs=activeInputs(signal),samples=inputs.map(input=>{
        if(input.sourceMode==='Constant')return sample(input.value,nowMs);
        if(input.sourceMode==='Computed')return results[input.oscPath] ?? invalidSample('Unknown computation.');
        const key=leafKey(input),existing=leaves.get(key);if(existing)return existing;const result=resolver(input);leaves.set(key,result);return result;
      }); results[signal.id]=this.calculate(signal,inputs,samples,nowMs);
    } return results;
  }
  private invalidate(id:string,reason:string):ComputedSignalSample {this.temporal.delete(id);return invalidSample(reason);}
  private calculate(signal:ComputedSignalConfig,inputs:ComputedSignalInputConfig[],samples:ComputedSignalSample[],now:number):ComputedSignalSample {
    const bad=samples.find(item=>!item.valid || item.value===null || !Number.isFinite(item.value) || !Number.isFinite(item.timestampMs));
    if(bad)return this.invalidate(signal.id,bad.reason||'Waiting for valid calculation inputs.');
    if(samples.some(item=>item.timestampMs>now || signal.maxAgeMs>0 && now-item.timestampMs>signal.maxAgeMs))return this.invalidate(signal.id,'A calculation input has expired.');
    const sources=[...new Set(samples.map(item=>item.sourceKey).filter((value):value is string=>Boolean(value)))];
    if(sources.length>1)return this.invalidate(signal.id,'Choose inputs from the same OSC source.');
    let frame:string|null=null;
    try {
      if(isGeometry(signal.operation))frame=geometryFrame(signal.operation,samples);
      else {
        const frames=[...new Set(samples.map(item=>item.coordinateFrame).filter((value):value is string=>Boolean(value)))];
        if(frames.length===2 && signal.operation==='Product' && samples.filter(item=>item.coordinateFrame==='AvatarRootLocal').length===1
          && samples.filter(item=>item.coordinateFrame==='AvatarRootLocal:Scale').length===1 && samples.every((item,i)=>Boolean(item.coordinateFrame)||inputs[i]?.sourceMode==='Constant'))frame='AvatarRootMeters';
        else if(signal.operation==='Ratio' && samples.length===2 && samples[0]?.coordinateFrame==='AvatarRootMeters' && samples[1]?.coordinateFrame==='AvatarRootLocal:Scale')frame='AvatarRootLocal';
        else {if(frames.length>1)throw new Error('Choose spatial inputs in the same coordinate frame.');frame=frames[0]??null;}
      }
      const origins=[...new Set(samples.map(item=>item.originKey).filter((value):value is string=>Boolean(value)))].sort();
      const origin=origins.length>1 ? 'combined:'+sha256(origins.join('\0')) : origins[0]??null;
      const source=sources[0]??null,timestamp=samples.length?Math.min(...samples.map(item=>item.timestampMs)):now;
      if(isTemporal(signal.operation))return this.calculateTemporal(signal,samples,now,source,frame,origin,timestamp);
      const values=samples.map(item=>item.value ?? NaN);let value:number;
      if(isGeometry(signal.operation)) {value=geometryValue(signal.operation,values);if(['VectorAngle','PlaneAngle'].includes(signal.operation))frame=frame?frame+':Angle':'Angle';}
      else {
        switch(signal.operation) {
          case 'WeightedAverage':value=values.reduce((sum,n,i)=>sum+n*(inputs[i]?.weight??0),0)/inputs.reduce((sum,item)=>sum+item.weight,0);break;
          case 'Average':value=values.reduce((sum,n)=>sum+n,0)/values.length;break;
          case 'Sum':value=values.reduce((sum,n)=>sum+n,0);break;
          case 'Difference':value=(values[0]??0)-(values[1]??0);break;
          case 'Product':value=values.reduce((product,n)=>product*n,1);break;
          case 'Ratio':if(values[1]===0)throw new Error('Choose a non-zero denominator.');value=(values[0]??0)/(values[1]??0);break;
          case 'Minimum':value=Math.min(...values);break;case 'Maximum':value=Math.max(...values);break;
          case 'Magnitude':value=Math.hypot(...values);break;
          case 'DeadZone':value=Math.abs(values[0]??0)<=signal.threshold ? 0 : values[0]??0;break;
          default:throw new Error('Unsupported calculation operation.');
        }
      }
      if(!Number.isFinite(value)||Math.abs(value)>3.4028234663852886e38)throw new Error('The calculation exceeds the finite numeric range.');
      return sample(value,timestamp,source,frame,origin);
    } catch(error) {return this.invalidate(signal.id,error instanceof Error?error.message:'Invalid calculation.');}
  }
  private calculateTemporal(signal:ComputedSignalConfig,samples:ComputedSignalSample[],now:number,source:string|null,frame:string|null,origin:string|null,timestamp:number):ComputedSignalSample {
    const identity=[source,frame,origin].join('\0');let state=this.temporal.get(signal.id);
    if(!state||state.identity!==identity||now<state.lastMs) {
      state={identity,startedMs:now,lastMs:now,initialized:false,value:0,previousValue:0,previousGate:false,gate:false,activeSinceMs:null,deadlineMs:null,lastOutput:null,history:[],delayed:null};this.temporal.set(signal.id,state);
    }
    if(state.initialized&&now===state.lastMs&&state.lastOutput)return state.lastOutput;
    const x=samples[0]?.value??1,elapsed=state.initialized?Math.max(0,now-state.lastMs):0;
    const gate=x>=signal.threshold,rising=state.initialized&&gate&&!state.previousGate,falling=state.initialized&&!gate&&state.previousGate;
    let value:number,delayed:ComputedSignalSample|null=null;
    switch(signal.operation) {
      case 'Smooth':value=!state.initialized||signal.timeMs===0?x:state.value+(x-state.value)*(1-Math.exp(-elapsed/signal.timeMs));break;
      case 'Hysteresis':if(x>=signal.threshold)state.gate=true;else if(x<=signal.releaseThreshold)state.gate=false;value=state.gate?1:0;frame=null;break;
      case 'Delay':
        if(state.history.length>=4096)return this.invalidate(signal.id,'Delay buffer is full; reduce the sample rate or delay.');
        state.history.push({atMs:now,sample:sample(x,timestamp,source,frame,origin)});
        while(state.history[0]&&state.history[0].atMs<=now-signal.timeMs)state.delayed=state.history.shift()?.sample??null;
        delayed=state.delayed;value=delayed?.value??0;break;
      case 'Derivative':value=state.initialized&&elapsed>0?(x-state.previousValue)*1000/elapsed:0;frame=derivativeFrame(frame);break;
      case 'PeakHold':if(!state.initialized||signal.timeMs===0||x>=state.value||state.deadlineMs===null||now>=state.deadlineMs){state.value=x;state.deadlineMs=now+signal.timeMs;}value=state.value;break;
      case 'RisingEdge':value=rising?1:0;frame=null;break;case 'FallingEdge':value=falling?1:0;frame=null;break;
      case 'Pulse':if(rising)state.deadlineMs=now+signal.timeMs;value=rising||state.deadlineMs!==null&&now<state.deadlineMs?1:0;frame=null;break;
      case 'Cooldown':{const accepted=rising&&(state.deadlineMs===null||now>=state.deadlineMs);if(accepted)state.deadlineMs=now+signal.timeMs;value=accepted?1:0;frame=null;break;}
      case 'Duration':if(!gate)state.activeSinceMs=null;else state.activeSinceMs??=now;value=state.activeSinceMs!==null&&now-state.activeSinceMs>=signal.timeMs?1:0;frame=null;break;
      case 'Sine':value=signal.offset+signal.amplitude*Math.sin(((now-state.startedMs)/1000*signal.frequencyHz%1)*Math.PI*2)*x;break;
      case 'Envelope':value=signal.timeMs===0?(gate?1:0):Math.max(0,Math.min(1,state.value+(gate?1:-1)*elapsed/signal.timeMs));frame=null;break;
      default:throw new Error('Unsupported temporal calculation.');
    }
    if(!Number.isFinite(value)||Math.abs(value)>3.4028234663852886e38)return this.invalidate(signal.id,'The calculation exceeds the finite numeric range.');
    const result=signal.operation==='Delay'?(delayed??invalidSample('Waiting for the first delayed sample.')):sample(value,timestamp,source,frame,origin);
    state.value=value;state.previousValue=x;state.previousGate=gate;state.lastMs=now;state.initialized=true;state.lastOutput=result;return result;
  }
}
export { isGeometry,isTemporal };
export type { ComputedSignalOperation };
