import type { ComputedSignalOperation, ComputedSignalSample } from './model.ts';
export type Vector3 = readonly [number, number, number];
const at = (values: readonly number[], start: number): Vector3 => [values[start] ?? 0,values[start+1] ?? 0,values[start+2] ?? 0];
const sub = (a: Vector3,b: Vector3): Vector3 => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const multiply = (a: Vector3,k: number): Vector3 => [a[0]*k,a[1]*k,a[2]*k];
const dot = (a: Vector3,b: Vector3): number => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const length = (a: Vector3): number => Math.hypot(...a);
const cross = (a: Vector3,b: Vector3): Vector3 => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function normalize(value: Vector3): Vector3 { const size=length(value); if (!(size>0) || !Number.isFinite(size)) throw new Error('A geometric direction must be non-zero and finite.'); return multiply(value,1/size); }
export function geometryValue(operation: ComputedSignalOperation, values: readonly number[]): number {
  const first=at(values,0),second=at(values,3);
  if (operation === 'PointDistance') return length(sub(first,second));
  if (operation === 'VectorAngle' || operation === 'PlaneAngle') {
    const a=normalize(first),b=normalize(second),d=dot(a,b),c=length(cross(a,b));
    return (operation === 'VectorAngle' ? Math.atan2(c,d) : Math.atan2(d,c))*180/Math.PI;
  }
  let normal=at(values,6);
  if (operation === 'PlaneDepthFromAxes' || operation === 'PlaneOffsetFromAxes') {
    const perpendicular=cross(normalize(normal),normalize(at(values,9)));
    if (length(perpendicular)<=1e-4) throw new Error('Plane axes are nearly collinear.');
    normal=normalize(perpendicular);
  } else normal=normalize(normal);
  const delta=sub(first,second),depth=dot(delta,normal);
  return operation === 'PlaneDepth' || operation === 'PlaneDepthFromAxes' ? depth : length(sub(delta,multiply(normal,depth)));
}
interface VectorFrame { coordinate: string | null; quantity: string; }
function readFrame(samples: readonly ComputedSignalSample[], start: number, direction: boolean): VectorFrame {
  const frames=[...new Set(samples.slice(start,start+3).map(item=>item.coordinateFrame).filter((value):value is string=>Boolean(value)))];
  if (frames.length>1) throw new Error('XYZ components use incompatible coordinate frames.');
  const tagged=frames[0]; if (!tagged) return {coordinate:null,quantity:''};
  if (tagged==='Basis' || tagged==='Velocity') {
    if (!direction) throw new Error('A position cannot use a direction or velocity quantity.');
    return {coordinate:null,quantity:tagged};
  }
  const index=tagged.indexOf(':',tagged.startsWith('ReferenceLocal:') ? 'ReferenceLocal:'.length : 0);
  const coordinate=index<0 ? tagged : tagged.slice(0,index),quantity=index<0 ? '' : tagged.slice(index+1);
  if (!['AvatarRootLocal','AvatarRootMeters'].includes(coordinate)
    && !(coordinate.startsWith('ReferenceLocal:') && coordinate.length > 'ReferenceLocal:'.length)) throw new Error('Unsupported spatial coordinate frame.');
  if (quantity && !(direction && ['Basis','Velocity'].includes(quantity))) throw new Error('Spatial calculation uses an incompatible quantity.');
  return {coordinate,quantity};
}
export function geometryFrame(operation: ComputedSignalOperation,samples: readonly ComputedSignalSample[]): string | null {
  const positions=!['VectorAngle','PlaneAngle'].includes(operation); let frame: string | null=null;
  if (positions) {
    const point=readFrame(samples,0,false),origin=readFrame(samples,3,false);
    if (point.coordinate && origin.coordinate && point.coordinate!==origin.coordinate) throw new Error('Point and origin use different coordinate frames.');
    frame=point.coordinate ?? origin.coordinate; if (operation==='PointDistance') return frame;
  }
  const directions: VectorFrame[]=[];
  for (let i=positions ? 6 : 0;i<samples.length;i+=3) directions.push(readFrame(samples,i,true));
  frame ??= directions.find(item=>item.coordinate && item.quantity!=='Basis')?.coordinate ?? directions.find(item=>item.coordinate)?.coordinate ?? null;
  for (const direction of directions) {
    if (!direction.coordinate || direction.coordinate===frame) continue;
    if (direction.quantity==='Basis' && ['AvatarRootLocal','AvatarRootMeters'].includes(frame ?? '') && ['AvatarRootLocal','AvatarRootMeters'].includes(direction.coordinate)) continue;
    throw new Error('Spatial directions use incompatible coordinate frames.');
  }
  return frame;
}
