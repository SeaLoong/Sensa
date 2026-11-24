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

const centered = { L0:500, L1:500, L2:500, R0:500, R1:500, R2:500 };
export const sr6PhotoReference = 'https://yourhobbiescustomized.com/products/sr6-with-a-twist';
const rotate = (a, b, angle) => [a*Math.cos(angle)-b*Math.sin(angle), a*Math.sin(angle)+b*Math.cos(angle)];

export function platformPoint(local, counts, twist = true) {
  const axis = name => (counts[name] - 500) / 500;
  let [x,y,z] = local;
  // The geared insert rotates inside the carrier, about its own tilted normal.
  if (twist) [x,z] = rotate(x,z,axis('R0') * Math.PI * .75);
  [y,z] = rotate(y,z,axis('R2') * Math.PI/6);
  [x,y] = rotate(x,y,axis('R1') * Math.PI/6);
  return point(x - axis('L2')*.28, y + .91 + axis('L0')*.56, z + .87 - axis('L1')*.28);
}

// Paired upper/lower main arms and the two inboard pitch arms.
// Pivot and lug coordinates are estimated from the front and side product photographs.
function linkage(pivot, lug, radius, restAngle) {
  const neutralLug = platformPoint(lug, centered, false);
  const elbow = add(pivot,[0,radius*Math.sin(restAngle),radius*Math.cos(restAngle)]);
  const length = Math.hypot(...sub(neutralLug,elbow));
  const restDirection = Math.atan2(neutralLug[1]-pivot[1],neutralLug[2]-pivot[2]);
  return { pivot, lug, radius, length, branch: Math.sign(restAngle-restDirection) };
}

const links = [-1,1].flatMap(side => [
  linkage([side*.64,1.12,-.94], [side*.64,-.035,-.17], .53, 1.36),
  linkage([side*.70,.68,-.93], [side*.70,-.035,.03], .54, -1.47),
  linkage([side*.13,1.60,-.95], [side*.68,.44,.04], .53, 1.42),
]);

function solveLinks(counts) {
  const result = [];
  for (const link of links) {
    const socket = platformPoint(link.lug,counts,false);
    const [dx,dy,dz] = sub(socket,link.pivot);
    // Intersect the servo's crank circle (in its YZ plane) with the fixed rod's sphere.
    const distance = Math.hypot(dy,dz);
    const cosine = (dx*dx+distance*distance+link.radius**2-link.length**2)/(2*link.radius*distance);
    if (!Number.isFinite(cosine) || Math.abs(cosine)>1+1e-10) return null;
    const angle = Math.atan2(dy,dz) + link.branch*Math.acos(Math.max(-1,Math.min(1,cosine)));
    const elbow = add(link.pivot,[0,link.radius*Math.sin(angle),link.radius*Math.cos(angle)]);
    result.push({ pivot:link.pivot, elbow, socket });
  }
  return result;
}

export function receiverPose(counts) {
  const direct = solveLinks(counts);
  if (direct) return { counts, links:direct, limited:false };
  // Combined extremes may be outside the model's envelope. Keep every rod rigid.
  let low=0, high=1, pose=centered, reachable=solveLinks(centered);
  for (let i=0;i<18;i++) {
    const fraction=(low+high)/2;
    const candidate=Object.fromEntries(Object.keys(centered).map(axis =>
      [axis, axis==='R0' ? counts.R0 : 500+(counts[axis]-500)*fraction]));
    const solved=solveLinks(candidate);
    if (solved) { low=fraction; pose=candidate; reachable=solved; } else high=fraction;
  }
  return { counts:pose, links:reachable, limited:true };
}

export function drawPlatform(ctx, width, height, pose, view) {
  const faces = [], yaw = view.yaw, elevation = view.elevation;
  const zoom = Math.min(width / 4.15, height / 3.45);
  const project = ([x, y, z]) => {
    y -= 1.10;
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
  const charcoal=[49,57,67], black=[34,40,49], navy=[39,68,101], blue=[58,96,140], silver=[211,219,224];
  const identity = p => p;
  const carrier = p => platformPoint(p,pose.counts,false);
  const rotor = p => platformPoint(p,pose.counts,true);
  function box(center, size, color, transform=identity) {
    const corners = Array.from({length:8}, (_,i) => transform(center.map((v,k) => v + ((i>>k)&1 ? .5 : -.5)*size[k])));
    for (const indices of [[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]])
      face(indices.map(index=>corners[index]),color);
  }
  function flatLink(a,b,width,thickness,color) {
    const axis=unit(sub(b,a)), wide=unit(cross(axis,[1,0,0])), thin=cross(wide,axis);
    const corners = [a,b].flatMap(end => [[-1,-1],[1,-1],[1,1],[-1,1]].map(([w,h]) =>
      add(end,add(scale(wide,w*width/2),scale(thin,h*thickness/2)))));
    for (const indices of [[0,1,2,3],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]])
      face(indices.map(i=>corners[i]),color);
  }
  function sidePin(center, side, radius) {
    const at = distance => add(center,[side*distance,0,0]);
    tube(at(-.075),at(.085),radius,charcoal);
    tube(at(.085),at(.106),radius*.76,silver);
    tube(at(.106),at(.109),radius*.33,black,6);
  }
  function annulus(transform,section,colors,marked=false) {
    const n=40;
    for(let i=0;i<n;i++) for(let j=0;j<section.length;j++) {
      const k=(j+1)%section.length;
      const vertices=[[i,j],[i+1,j],[i+1,k],[i,k]].map(([s,h])=>transform(ring(section[h][0],section[h][1],s*tau/n)));
      face(vertices,marked && j===2 && (i===9 || i===10) ? [241,165,77] : colors[j]);
    }
  }

  // Rear mounting plate, electronics enclosure, split servo banks and front fan grille.
  box([0,.97,-1.38],[1.38,1.47,.09],charcoal);
  box([0,.94,-1.13],[1.17,1.56,.48],navy);
  box([0,.94,-.87],[1.12,1.43,.09],blue);
  for(const side of [-1,1]) {
    box([side*.31,1.49,-.99],[.50,.52,.51],charcoal);
    for(const y of [.65,1.09]) {
      box([side*.56,y,-.96],[.23,.38,.43],black);
      box([side*.682,y,-.96],[.017,.15,.18],[143,77,64]);
    }
    for(const y of [.31,1.62]) tube([side*.60,y,-1.445],[side*.60,y,-1.425],.035,silver,8);
  }
  box([0,.86,-.79],[.57,.57,.09],charcoal);
  tube([0,.86,-.755],[0,.86,-.735],.22,black,24);
  for(let i=-2;i<=2;i++) box([0,.86+i*.065,-.725],[.37-Math.abs(i)*.035,.026,.025],[91,106,118]);

  // The forward cantilever carries a cup-shaped receiver and a small rear twist-drive housing.
  box([0,.10,-.57],[.45,.38,.36],navy,carrier);
  box([0,.30,-.58],[.40,.11,.31],charcoal,carrier);
  annulus(carrier,[[.54,-.13],[.75,-.13],[.77,-.045],[.74,.065],[.60,.10],[.54,.065]],
    [charcoal,black,blue,navy,blue,charcoal]);
  annulus(rotor,[[.49,-.10],[.58,-.10],[.58,.105],[.49,.105]],[black,black,[102,116,128],charcoal],true);
  for(const side of [-1,1]) {
    flatLink(carrier([side*.59,.02,-.22]),carrier([side*.68,.44,.04]),.19,.11,blue);
    flatLink(carrier([side*.69,-.035,.03]),carrier([side*.68,.44,.04]),.14,.11,navy);
  }
  for(const {pivot,elbow,socket} of pose.links) {
    const side=Math.sign(pivot[0]);
    flatLink(pivot,elbow,.16,.105,charcoal);
    flatLink(elbow,socket,.115,.09,blue);
    sidePin(pivot,side,.112);
    sidePin(elbow,side,.073);
    sidePin(socket,side,.070);
  }
  faces.sort((a,b)=>a.depth-b.depth);
  for (const {points,color} of faces) {
    ctx.beginPath(); ctx.moveTo(points[0][0],points[0][1]);
    for(const [x,y] of points.slice(1)) ctx.lineTo(x,y);
    ctx.closePath(); ctx.fillStyle=color; ctx.fill();
    ctx.strokeStyle=color; ctx.lineWidth=.55; ctx.stroke();
  }
}
