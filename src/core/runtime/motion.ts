import type { MotionAxis,MotionValues,SignalMapping,SignalRole,SignalCurve,RuntimeMotionFrame,SignalOutputBinding } from './model.ts';
import { motionAxes,neutralValues } from './model.ts';
export const clampUnit=(value:number):number=>Math.max(0,Math.min(1,value));
export function signalCurve(value:number,curve:SignalCurve|string):number {
  return curve==='EaseIn'?value*value:curve==='EaseOut'?1-(1-value)*(1-value):curve==='SCurve'?(value<.5?2*value*value:1-2*(1-value)*(1-value)):value;
}
export class SignalChannelProcessor {
  readonly mapping:SignalMapping;observedMin=Number.POSITIVE_INFINITY;observedMax=Number.NEGATIVE_INFINITY;
  constructor(mapping:SignalMapping){this.mapping=mapping;}
  processSample(raw:number):{normalized:number;curved:number;output:number} {
    if(!Number.isFinite(raw))throw new Error('Signal value must be finite.');this.observedMin=Math.min(this.observedMin,raw);this.observedMax=Math.max(this.observedMax,raw);
    const min=this.mapping.invertDirection?this.mapping.vrchatMax:this.mapping.vrchatMin,max=this.mapping.invertDirection?this.mapping.vrchatMin:this.mapping.vrchatMax;
    const normal=Math.abs(max-min)<.0001?0:clampUnit((raw-min)/(max-min)),curved=signalCurve(normal,this.mapping.curve);
    const first=Math.max(0,Math.min(999,this.mapping.mappedMin??0)),last=Math.max(0,Math.min(999,this.mapping.mappedMax??999));
    const low=Math.min(first,last)/1000,high=Math.max(first,last)/1000;
    return {normalized:normal,curved,output:clampUnit(low+curved*(high-low))};
  }
  process(raw:number):number{return this.processSample(raw).output;}
  reset():void{this.observedMin=Infinity;this.observedMax=-Infinity;}
}
export interface SignalMixInput {role:SignalRole;value:number;priority?:number;}
export function axisForRole(role:SignalRole):MotionAxis|null {
  const axes:Partial<Record<SignalRole,MotionAxis>>={Depth:'L0',Surge:'L1',Sway:'L2',Twist:'R0',AngleX:'R1',AngleY:'R2',V0:'V0',V1:'V1',V2:'V2',Auxiliary:'A0',Auxiliary1:'A1',Auxiliary2:'A2'};return axes[role]??null;
}
export function fuseSignals(signals:readonly SignalMixInput[]):Partial<MotionValues> {
  const selected=new Map<SignalRole,SignalMixInput>();
  for(const input of signals){if(!Number.isFinite(input.value))continue;const old=selected.get(input.role);let choose=!old;
    if(old){const priority=input.priority??input.value,previous=old.priority??old.value;
      const difference=priority-previous;if(difference>.0001)choose=true;else if(difference<-.0001)choose=false;
      else choose=['AngleX','AngleY','Twist','Surge','Sway','Auxiliary','Auxiliary1','Auxiliary2'].includes(input.role)?Math.abs(input.value-.5)>Math.abs(old.value-.5):input.value>old.value;
    }if(choose)selected.set(input.role,input);
  }
  const patch:Partial<MotionValues>={};for(const [role,input] of selected){const axis=axisForRole(role);if(axis)patch[axis]=clampUnit(input.value);}return patch;
}
export function applyMotionPatch(frame:RuntimeMotionFrame,patch:Partial<MotionValues>,deltaMs=frame.deltaMs):RuntimeMotionFrame {
  const values={...frame.values};for(const axis of motionAxes){const value=patch[axis];if(value!==undefined&&Number.isFinite(value))values[axis]=clampUnit(value);}return {...frame,values,deltaMs};
}
export function framesEqual(a:RuntimeMotionFrame,b:RuntimeMotionFrame,epsilon=.0001):boolean{return motionAxes.every(axis=>Math.abs(a.values[axis]-b.values[axis])<epsilon);}
export function neutralFrame(deltaMs=0):RuntimeMotionFrame{return {values:neutralValues(),deltaMs};}
export function frameForApi(frame:RuntimeMotionFrame):Record<string,unknown>{return {...Object.fromEntries(motionAxes.map(axis=>[axis.toLowerCase(),frame.values[axis]])),deltaMs:frame.deltaMs,requestedCommandMode:frame.requestedCommandMode??null,requestedMotionValue:frame.requestedMotionValue??null,...(frame.activeAxes?{activeAxes:[...frame.activeAxes]}:{})};}
export function mapBinding(binding:SignalOutputBinding,value:number):number {
  let normal=clampUnit((value-binding.inputMin)/(binding.inputMax-binding.inputMin));
  normal=binding.curve==='SCurve'?normal*normal*(3-2*normal):signalCurve(normal,binding.curve);
  const result=binding.outputMin+normal*(binding.outputMax-binding.outputMin);
  return binding.valueType==='Int'?Math.max(-2147483648,Math.min(2147483647,Math.sign(result)*Math.round(Math.abs(result)))):binding.valueType==='Bool'?(result>=.5?1:0):result;
}
export class AxisVelocityTracker {
  private previous=.5;private initialized=false;
  estimate(position:number,deltaMs:number,maximumVelocity=200):number{if(!this.initialized){this.previous=position;this.initialized=true;return 0;}const delta=Math.abs(position-this.previous);this.previous=position;return maximumVelocity<=0?0:Math.min(Math.ceil(delta*999*100/Math.max(1,deltaMs)),maximumVelocity);}
  reset(position=.5):void{this.previous=position;this.initialized=false;}
  sync(position:number):void{this.previous=position;this.initialized=true;}
}
export class ContinuousAngle {private previous=0;private accumulated=0;private initialized=false;update(angle:number):number{if(!Number.isFinite(angle))return this.accumulated;if(!this.initialized){this.previous=angle;this.accumulated=angle;this.initialized=true;return angle;}let delta=angle-this.previous;while(delta>180)delta-=360;while(delta<-180)delta+=360;this.previous=angle;this.accumulated+=delta;return this.accumulated;}}
export class SpsDepthEstimator {
  private length=0;private lastTipSequence:number|null=null;
  reset():void{this.length=0;this.lastTipSequence=null;}
  process(root:number,tip:number,tipSequence:number|null=null):number {
    if(!Number.isFinite(root)||!Number.isFinite(tip)||root<=.01||tip<=.01||root>1||tip>1){this.reset();return 0;}
    const learn=tipSequence===null||tipSequence!==this.lastTipSequence;
    if(tip<root){if(learn){this.length=0;this.lastTipSequence=tipSequence;}return 0;}
    if(tip<.99&&learn){const observed=tip-root+.01;this.length=observed>=.02?observed:0;this.lastTipSequence=tipSequence;}
    return tip<.99||this.length<.02?0:clampUnit(1-(1-root+.01)/this.length);
  }
}
