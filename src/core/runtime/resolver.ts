import { OscParameterStore,oscNumber,matchesOscPath,type OscSnapshotEntry } from '../protocols/osc.ts';
import { sample,invalidSample,type ComputedSignalInputConfig,type ComputedSignalSample,type PointMetric } from './model.ts';
import { observeTracking,observePoses,trackingMatches,poseMatches,getMetric,getPoseMetric,type TrackingObservation,type PoseObservation } from './tracking.ts';
export class ComputedSignalResolver {
  readonly entries:readonly OscSnapshotEntry[];readonly now:number;readonly maxSpatialAge:number;readonly allowSpatial:boolean;readonly scalarMaxAge:number;
  private readonly scalars=new Map<string,ComputedSignalSample>();private points:TrackingObservation[]|null=null;private poses:PoseObservation[]|null=null;
  constructor(entries:readonly OscSnapshotEntry[],sourceKey:string|null,now:number,maxSpatialAge:number,allowSpatial:boolean,scalarMaxAge=0){this.entries=entries.filter(item=>!sourceKey||item.entry.source.key===sourceKey);this.now=now;this.maxSpatialAge=maxSpatialAge;this.allowSpatial=allowSpatial;this.scalarMaxAge=scalarMaxAge;}
  resolve(input:ComputedSignalInputConfig):ComputedSignalSample {
    if(input.sourceMode==='Direct')return this.scalar(input.oscPath);
    if(!this.allowSpatial)return invalidSample('Enable spatial input to use tracking measurements.');
    if(input.sourceMode==='SensaPoint') {
      this.points??=observeTracking(this.entries,null,this.now,this.maxSpatialAge);
      const matches=this.points.filter(point=>point.isMappablePoint&&trackingMatches(point,input.oscPath));
      if(matches.length!==1)return invalidSample(matches.length?'Select one tracking point and OSC source.':'Waiting for complete tracking samples.');
      const point=matches[0];if(!point)return invalidSample('Waiting for tracking samples.');
      if(!point.valid)return invalidSample(point.reason);
      const value=getMetric(point,input.pointMetric);if(value===undefined)return invalidSample('Choose a metric supplied by this tracking method.');
      let frame=point.coordinateFrame==='ReferenceLocal'?point.coordinateFrame+':'+point.prefix:point.coordinateFrame;
      const quantity:Partial<Record<PointMetric,string>>={VelocityX:':Velocity',VelocityY:':Velocity',VelocityZ:':Velocity',Speed:':Velocity',ProximitySpeed:':ProximityRate',RightX:':Basis',RightY:':Basis',RightZ:':Basis',ForwardX:':Basis',ForwardY:':Basis',ForwardZ:':Basis',AvatarScale:':Scale'};
      frame+=quantity[input.pointMetric]??'';return sample(value,point.timestampMs,point.sourceKey,frame,`point:${point.sourceKey}:${point.prefix}:${input.pointMetric}`);
    }
    if(input.sourceMode==='SensaPose') {
      this.poses??=observePoses(this.entries,null,this.now,this.maxSpatialAge);const matches=this.poses.filter(pose=>poseMatches(pose,input.oscPath));
      if(matches.length!==1)return invalidSample(matches.length?'Select one pose rig and OSC source.':'Waiting for complete pose samples.');
      const pose=matches[0];if(!pose)return invalidSample('Waiting for pose samples.');if(!pose.valid||!pose.engaged)return invalidSample(pose.reason);
      const quantity=input.poseMetric==='Depth'?':NormalizedDepth':['Yaw','Pitch','Roll'].includes(input.poseMetric)?':Angle':'';
      return sample(getPoseMetric(pose,input.poseMetric),pose.timestampMs,pose.sourceKey,pose.coordinateFrame+':'+pose.prefix+quantity,`pose:${pose.sourceKey}:${pose.prefix}:${input.poseMetric}`);
    }return invalidSample('Choose a parameter or tracking metric.');
  }
  private scalar(pattern:string):ComputedSignalSample {
    const cached=this.scalars.get(pattern);if(cached)return cached;
    const matches=this.entries.filter(item=>matchesOscPath(pattern,item.path));let result:ComputedSignalSample;
    if(matches.length!==1)result=invalidSample(matches.length?'Select one parameter and OSC source.':'Waiting for parameter: '+pattern);
    else {const item=matches[0];result=!item?invalidSample('Waiting for a parameter.')
      :item.entry.timestampMs>this.now||this.scalarMaxAge>0&&this.now-item.entry.timestampMs>this.scalarMaxAge?invalidSample('A calculation input has expired.')
        :sample(oscNumber(item.entry.value),item.entry.timestampMs,item.entry.source.key,null,`osc:${item.entry.source.key}:${item.path}`);}
    this.scalars.set(pattern,result);return result;
  }
}
interface OgbDepth {parent:string;party:string;socket:boolean;legacy:string;root:string;tip:string;close:string;}
export function ogbDepthAddress(path:string):OgbDepth|null {
  const socket=path.startsWith('OGB/Orf/');if(!socket&&!path.startsWith('OGB/Pen/'))return null;const slash=path.lastIndexOf('/');if(slash<=8)return null;
  const parent=path.slice(0,slash),leaf=path.slice(slash+1);if(parent.slice(8).split('/').some(part=>!part.trim()))return null;
  for(const party of ['Self','Others']){const stem='Pen'+party;if(leaf===stem||socket&&(leaf===stem+'NewRoot'||leaf===stem+'NewTip'||party==='Others'&&leaf===stem+'Close'))return {parent,party,socket,legacy:parent+'/'+stem,root:parent+'/'+stem+'NewRoot',tip:parent+'/'+stem+'NewTip',close:parent+'/'+stem+'Close'};}return null;
}
interface OgbTouch {value:string;close:string;needsClose:boolean;}
export function ogbTouchAddress(path:string):OgbTouch|null {
  const prefix='VFH/Zone/Touch/';if(path.startsWith(prefix)){const slash=path.lastIndexOf('/'),leaf=path.slice(slash+1),parent=path.slice(0,slash);return slash>prefix.length&&!parent.slice(prefix.length).split('/').some(part=>!part.trim())&&['Self','Others'].includes(leaf)?{value:path,close:path+'Close',needsClose:false}:null;}
  const socket=path.startsWith('OGB/Orf/');if(!socket&&!path.startsWith('OGB/Pen/'))return null;const slash=path.lastIndexOf('/');if(slash<=8)return null;const parent=path.slice(0,slash),leaf=path.slice(slash+1);if(parent.slice(8).split('/').some(part=>!part.trim()))return null;
  for(const name of ['TouchSelf','TouchOthers','FrotOthers']){const needsClose=!socket||name!=='FrotOthers';if(leaf===name||needsClose&&leaf===name+'Close')return {value:parent+'/'+name,close:parent+'/'+name+'Close',needsClose};}return null;
}
export { OscParameterStore };
