import type { RuntimeMotionFrame } from './model.ts';
export interface RecordedMotion { at:number;value:number; }
/** Bounded command capture; storage and filenames belong to the host. */
export class RuntimeMotionRecorder {
  readonly now: () => number;
  readonly maximumFrames: number;
  private frames:RecordedMotion[]=[];private startedAt=0;private active=false;
  constructor(now:()=>number=Date.now,maximumFrames=100000) {if(!Number.isInteger(maximumFrames)||maximumFrames<1||maximumFrames>100000)throw new Error('Invalid recording capacity.');this.now=now;this.maximumFrames=maximumFrames;}
  start():void {this.frames=[];this.startedAt=this.now();this.active=true;}
  push(frame:RuntimeMotionFrame):void {if(!this.active||!Number.isFinite(frame.values.L0))return;if(this.frames.length>=this.maximumFrames){this.active=false;return;}
    this.frames.push({at:Math.max(0,Math.trunc(this.now()-this.startedAt)),value:Math.max(0,Math.min(1,frame.values.L0))});if(this.frames.length===this.maximumFrames)this.active=false;}
  stop():void {if(!this.active)return;this.active=false;const last=this.frames.at(-1),at=Math.max(0,Math.trunc(this.now()-this.startedAt));if(last&&at>last.at&&this.frames.length<this.maximumFrames)this.frames.push({at,value:last.value});}
  snapshot():{isActive:boolean;frameCount:number} {return {isActive:this.active,frameCount:this.frames.length};}
  takeSnapshot():RecordedMotion[] {return this.frames.map(frame=>({...frame}));}
  export():{version:string;inverted:boolean;range:number;actions:{at:number;pos:number}[]} {
    return {version:'1.0',inverted:false,range:100,actions:simplifyMotion(this.frames).map(item=>({at:item.at,pos:roundHalfToEven(Math.fround(Math.fround(item.value)*100))}))};
  }
}
export function roundHalfToEven(value:number):number {
  const lower=Math.floor(value),fraction=value-lower;
  return fraction===.5 ? lower%2===0?lower:lower+1 : Math.round(value);
}
export function simplifyMotion(points:readonly RecordedMotion[],epsilon=.02):RecordedMotion[] {
  if(points.length<=2)return points.map(item=>({...item}));const keep=new Set([0,points.length-1]),stack:[number,number][]=[[0,points.length-1]];
  while(stack.length){const pair=stack.pop();if(!pair)break;const [start,end]=pair,first=points[start],last=points[end];if(!first||!last)continue;
    let maximum=0,index=-1;const x0=first.at/1000,y0=first.value,dx=last.at/1000-x0,dy=last.value-y0,size=dx*dx+dy*dy;
    for(let i=start+1;i<end;i++){const item=points[i];if(!item)continue;const px=item.at/1000,py=item.value,t=size<1e-10?0:Math.max(0,Math.min(1,((px-x0)*dx+(py-y0)*dy)/size));
      const distance=Math.hypot(px-(x0+t*dx),py-(y0+t*dy));if(distance>maximum){maximum=distance;index=i;}}
    if(maximum>epsilon&&index>=0){keep.add(index);stack.push([start,index],[index,end]);}
  }return [...keep].sort((a,b)=>a-b).map(index=>({...points[index]!}));
}
