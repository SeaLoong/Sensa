// Y is vertical, X points right and Z points toward the front of the base.
// Dimensions are schematic. The six inputs describe a platform pose.
const tau = Math.PI * 2;
const point = (x, y, z) => [x, y, z];
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const scale = (a, k) => a.map(v => v * k);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const unit = a => scale(a, 1 / (Math.hypot(...a) || 1));
const ring = (radius, y, angle) => point(radius * Math.cos(angle), y, radius * Math.sin(angle));

export function platformPoint(local, counts) {
  const axis = name => (counts[name] - 500) / 500;
  const rotate = (a, b, angle) => [a*Math.cos(angle)-b*Math.sin(angle), a*Math.sin(angle)+b*Math.cos(angle)];
  let [x, y, z] = local;
  [y, z] = rotate(y, z, axis('R2') * .45);
  [x, y] = rotate(x, y, axis('R1') * .45);
  [x, z] = rotate(x, z, axis('R0') * Math.PI / 2);
  return point(x - axis('L2') * .55, y + 1.45 + axis('L0') * .65, z - axis('L1') * .55);
}

export function drawPlatform(ctx, width, height, counts, view) {
  const faces = [], yaw = view.yaw, elevation = view.elevation;
  const zoom = Math.min(width / 3.9, height / 3.65);
  const project = ([x, y, z]) => {
    y -= 1.03;
    const forward = x*Math.sin(yaw) + z*Math.cos(yaw);
    return [width/2 + zoom*(x*Math.cos(yaw)-z*Math.sin(yaw)),
      height/2 - zoom*(y*Math.cos(elevation)-forward*Math.sin(elevation)),
      forward*Math.cos(elevation) + y*Math.sin(elevation)];
  };
  function line(a, b, color) {
    const [x, y] = project(a), [u, v] = project(b);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(u, v);
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
  }
  function face(vertices, rgb) {
    const normal = unit(cross(sub(vertices[1],vertices[0]),sub(vertices[2],vertices[0])));
    const light = .72 + .28 * Math.abs(normal[0]*-.34 + normal[1]*.86 + normal[2]*.38);
    const points = vertices.map(project);
    faces.push({ points, depth: points.reduce((sum, p) => sum+p[2], 0)/points.length,
      color: 'rgb(' + rgb.map(channel => Math.round(channel*light)).join(',') + ')' });
  }
  function tube(a, b, radius, rgb, sides = 12) {
    const direction = unit(sub(b,a));
    const u = scale(unit(cross(direction, Math.abs(direction[1]) < .9 ? [0,1,0] : [1,0,0])),radius);
    const v = cross(direction,u);
    const offsets = Array.from({length:sides}, (_, i) => add(scale(u, Math.cos(i*tau/sides)), scale(v, Math.sin(i*tau/sides))));
    const bottom = offsets.map(o => add(a,o)), top = offsets.map(o => add(b,o));
    for (let i=0; i<sides; i++) {
      const j=(i+1)%sides;
      face([bottom[i],bottom[j],top[j],top[i]],rgb);
    }
    face(top,rgb);
  }

  ctx.clearRect(0,0,width,height);
  for (let i=-6;i<=6;i++) {
    const s=i*.36;
    line([s,0,-2.16],[s,0,2.16],'#d9e4ed');
    line([-2.16,0,s],[2.16,0,s],'#d9e4ed');
  }
  // A fixed base and six paired links make motion relative to the chassis visible.
  const chassis=[54,75,94], steel=[198,215,225], alloy=[101,128,151], accent=[24,112,188];
  tube([0,.025,0],[0,.18,0],1.12,chassis,6);
  tube([0,.18,0],[0,.22,0],1.06,alloy,6);
  for (let i=0;i<6;i++) {
    const pair=Math.floor(i/2)*tau/3, side=i%2===0?-1:1;
    const foot=ring(.93,.31,pair+side*.20);
    const socket=platformPoint(ring(.75,-.10,pair+side*.78),counts);
    tube(add(foot,[0,-.10,0]),add(foot,[0,.025,0]),.135,chassis);
    tube(foot,socket,.035,steel);
    tube(foot,add(foot,scale(sub(socket,foot),.52)),.068,alloy);
    tube(add(socket,[0,-.033,0]),add(socket,[0,.033,0]),.078,chassis);
  }
  // Segmented annulus with a visible bore, beveled rim and a front orientation mark.
  const segments=36;
  const section=[[.55,-.10],[.80,-.10],[.84,-.045],[.84,.065],[.79,.11],[.55,.11]];
  const colors=[alloy,chassis,accent,steel,[227,238,245],chassis];
  for (let i=0;i<segments;i++) {
    for (let j=0;j<section.length;j++) {
      const next=(j+1)%section.length;
      const vertices=[[i,j],[i+1,j],[i+1,next],[i,next]].map(([angle,k]) =>
        platformPoint(ring(section[k][0],section[k][1],angle*tau/segments),counts));
      face(vertices, j===4 && (i===8 || i===9) ? [255,159,58] : colors[j]);
    }
  }
  faces.sort((a,b)=>a.depth-b.depth);
  for (const {points,color} of faces) {
    ctx.beginPath(); ctx.moveTo(points[0][0],points[0][1]);
    for(const [x,y] of points.slice(1)) ctx.lineTo(x,y);
    ctx.closePath(); ctx.fillStyle=color; ctx.fill();
    ctx.strokeStyle=color; ctx.lineWidth=.55; ctx.stroke();
  }
}
