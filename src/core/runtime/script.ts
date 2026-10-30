import type { Script } from '../types.ts';
import { parseFunscript,scriptValue } from '../funscript.ts';
import type { MotionAxis } from './model.ts';
export interface ScriptOptions { restart?:boolean;loop?:boolean;speed?:number;updateLoopRange?:boolean;loopStartMs?:number|null;loopEndMs?:number|null;axis?:MotionAxis; }
export interface ScriptSnapshot {
  loaded:boolean;playing:boolean;paused:boolean;loop:boolean;speed:number;positionMs:number;durationMs:number;actionCount:number;
  fileName:string;currentL0:number;state:string;activityBins:number[];loopRangeActive:boolean;loopStartMs:number|null;loopEndMs:number|null;
}
/** Host-ticked player. Consumers can read snapshots without consuming its final frame. */
export class RuntimeScriptPlayer {
  readonly now: () => number;
  private script:Script|null=null;private fileName='';private loop=false;private speed=1;private positionMs=0;
  private fractionMs=0;private startedAt=0;private playing=false;private current=0;private state='empty';
  private loopStart:number|null=null;private loopEnd:number|null=null;private bins:number[]=[];private pendingFinal=false;private revision=0;private disposed=false;
  readonly onFrame=new Set<(value:number)=>void>();readonly onStopped=new Set<()=>void>();readonly onChanged=new Set<()=>void>();
  constructor(now:()=>number=Date.now) { this.now = now; }
  private changed():void {for(const listener of this.onChanged)listener();}
  private loaded():Script {if(!this.script||this.disposed)throw new Error('Load a script first.');return this.script;}
  load(name:string,input:unknown):ScriptSnapshot {
    const parsed=parseFunscript(input,{normalizeActions:true,maximumActions:500000});
    this.script={...parsed,durationMs:Math.max(1,parsed.durationMs)};this.fileName=name.trim()||'script.funscript';
    this.revision++;this.playing=false;this.pendingFinal=false;this.positionMs=this.fractionMs=0;this.startedAt=0;
    this.current=this.script.actions[0]?.pos ? (this.script.actions[0]?.pos??0)/100 : 0;this.state='stopped';this.loopStart=this.loopEnd=null;
    this.bins=Array<number>(64).fill(0);for(const action of this.script.actions){const i=Math.min(63,Math.floor(action.at/this.script.durationMs*64));this.bins[i]=(this.bins[i]??0)+1;}
    this.changed();return this.getSnapshot();
  }
  configure(options:ScriptOptions={}):ScriptSnapshot {
    if(options.speed!==undefined&&!Number.isFinite(options.speed))throw new Error('Playback speed must be finite.');
    for(const value of [options.loopStartMs,options.loopEndMs])if(value!==undefined&&value!==null&&!Number.isFinite(value))throw new Error('Loop boundary must be finite.');
    this.advance(this.now());if(options.loop!==undefined)this.loop=options.loop;
    if(options.speed!==undefined)this.speed=Math.min(4,Math.max(.1,options.speed));
    if(options.updateLoopRange){const limit=this.script?.durationMs??0;this.loopStart=options.loopStartMs==null?null:Math.min(limit,Math.max(0,Math.trunc(options.loopStartMs)));
      this.loopEnd=options.loopEndMs==null?null:Math.min(limit,Math.max(0,Math.trunc(options.loopEndMs)));if(this.loopStart!==null&&this.loopEnd!==null&&this.loopEnd<this.loopStart)[this.loopStart,this.loopEnd]=[this.loopEnd,this.loopStart];
      const window=this.window();if(this.playing&&this.loop&&window.active&&(this.positionMs<window.start||this.positionMs>=window.end)){this.positionMs=window.start;this.current=this.valueAt(this.positionMs);}}
    if(this.playing)this.startedAt=this.now();this.changed();return this.snapshot();
  }
  play(options:ScriptOptions={}):ScriptSnapshot {
    const script=this.loaded();this.configure(options);const window=this.window();
    if(options.restart||this.positionMs>=script.durationMs)this.positionMs=this.loop&&window.active?window.start:0;
    else if(this.loop&&window.active&&(this.positionMs<window.start||this.positionMs>=window.end))this.positionMs=window.start;
    this.startedAt=this.now();this.playing=true;this.current=this.valueAt(this.positionMs);this.state='playing';this.pendingFinal=false;
    this.publish(this.current,++this.revision);this.changed();return this.snapshot();
  }
  pause():ScriptSnapshot {this.revision++;this.advance(this.now());this.playing=false;this.pendingFinal=false;this.state=this.script?(this.positionMs>0?'paused':'stopped'):'empty';for(const listener of this.onStopped)listener();this.changed();return this.snapshot();}
  stop():ScriptSnapshot {this.revision++;this.playing=false;this.pendingFinal=false;this.positionMs=this.fractionMs=this.startedAt=0;this.current=0;this.state=this.script?'stopped':'empty';for(const listener of this.onStopped)listener();this.changed();return this.snapshot();}
  clear():ScriptSnapshot {this.stop();this.script=null;this.fileName='';this.loopStart=this.loopEnd=null;this.bins=[];this.state='empty';this.changed();return this.snapshot();}
  seek(positionMs:number):ScriptSnapshot {
    const script=this.loaded();if(!Number.isFinite(positionMs))throw new Error('Seek position must be finite.');
    this.positionMs=Math.min(script.durationMs,Math.max(0,Math.trunc(positionMs)));this.fractionMs=0;this.pendingFinal=false;this.startedAt=this.now();this.current=this.valueAt(this.positionMs);
    if(this.positionMs>=script.durationMs){this.playing=false;this.state='finished';}else this.state=this.playing?'playing':this.positionMs>0?'paused':'stopped';
    this.publish(this.current,++this.revision);this.changed();return this.snapshot();
  }
  step(direction:number):ScriptSnapshot {
    const script=this.loaded();const position=this.getSnapshot().positionMs;
    const target=direction>=0?script.actions.find(action=>action.at>position)?.at??script.durationMs:[...script.actions].reverse().find(action=>action.at<position)?.at??0;
    return this.seek(target);
  }
  tick():void {if(this.disposed)return;const wasPlaying=this.playing;this.advance(this.now());const emit=(wasPlaying||this.pendingFinal)&&this.script!==null;this.pendingFinal=false;if(emit)this.publish(this.current,this.revision);if(emit)this.changed();}
  getSnapshot():ScriptSnapshot {this.advance(this.now());return this.snapshot();}
  private window():{active:boolean;start:number;end:number} {const end=this.script?.durationMs??0;return this.loopStart!==null&&this.loopEnd!==null&&this.loopEnd>this.loopStart?{active:true,start:this.loopStart,end:this.loopEnd}:{active:false,start:0,end};}
  private valueAt(position:number):number {return this.script?scriptValue(this.script,position):0;}
  private advance(now:number):void {
    if(!this.script||!this.playing||this.disposed)return;
    const delta=Math.max(0,now-this.startedAt)*this.speed+this.fractionMs,whole=Math.floor(delta);this.fractionMs=delta-whole;
    let position=this.positionMs+whole;const window=this.window();
    if(this.loop&&window.active){if(this.positionMs<window.start||this.positionMs>=window.end)position=window.start;else if(position>=window.end)position=window.start+(position-window.start)%(window.end-window.start);}
    else if(this.loop&&this.script.durationMs>0)position%=this.script.durationMs;
    else if(position>=this.script.durationMs){position=this.script.durationMs;this.playing=false;this.state='finished';this.pendingFinal=true;}
    this.positionMs=position;this.startedAt=now;this.current=this.valueAt(position);
  }
  private snapshot():ScriptSnapshot {return {loaded:Boolean(this.script),playing:this.playing,paused:!this.playing&&this.state==='paused',loop:this.loop,speed:this.speed,
    positionMs:this.positionMs,durationMs:this.script?.durationMs??0,actionCount:this.script?.actions.length??0,fileName:this.fileName,currentL0:this.script?this.current:0,state:this.script?this.state:'empty',
    activityBins:this.bins.slice(),loopRangeActive:this.window().active,loopStartMs:this.loopStart,loopEndMs:this.loopEnd};}
  private publish(value:number,revision:number):void {for(const listener of this.onFrame){if(this.revision!==revision||this.disposed)return;listener(value);}}
  dispose():void {this.revision++;this.playing=false;this.pendingFinal=false;this.disposed=true;this.onFrame.clear();this.onStopped.clear();this.onChanged.clear();}
}
