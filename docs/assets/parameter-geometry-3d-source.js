/* Offline, on-demand Three.js geometry and target manipulation. / 离线按需三维几何与目标操作。
 * Checked against three@0.186.1 and its installed source:
 * https://threejs.org/docs/pages/Raycaster.html
 * https://threejs.org/docs/pages/Plane.html
 * https://threejs.org/docs/pages/LatheGeometry.html
 * https://threejs.org/docs/pages/CapsuleGeometry.html
 * CapsuleGeometry.height is the straight segment, not the full capped height.
 * Points.threshold uses world units; target depth converts a fixed CSS-pixel hit area.
 * Target drags freeze camera/plane. Only onMove emits intent; the view owns clamp, step and model evaluation.
 * No damping, autoRotate or RAF. All GPU resources, controls, capture and listeners are disposed.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const lifecycle = { created: 0, disposed: 0 }, instances = new Set();
const blue = '#0052d9', orange = '#c76a0a', gray = '#748096', up = new THREE.Vector3(0, 1, 0);
const words = {
  camera: ['三维相机', '3D camera'], rotate: ['旋转视角', 'Rotate view'], zoom: ['缩放视角', 'Zoom view'],
  left: ['向左旋转', 'Rotate left'], right: ['向右旋转', 'Rotate right'], up: ['向上旋转', 'Rotate up'], down: ['向下旋转', 'Rotate down'],
  'zoom-in': ['放大视角', 'Zoom in'], 'zoom-out': ['缩小视角', 'Zoom out'], reset: ['复位视角', 'Reset view'],
  canvas: ['拖动目标移动，拖动空白旋转；方向键旋转，加减键缩放，Home 复位，Escape 结束拖动。', 'Drag the target to move it; drag the background to orbit. Arrow keys rotate, plus/minus zoom, Home resets, Escape ends a target drag.'],
  hint: ['拖动橙色目标在所选平面移动；拖动空白旋转，滚轮／双指缩放。', 'Drag the orange target in the selected plane; drag the background to orbit, wheel/pinch to zoom.'],
  input: ['输入点 · 拖动', 'Input · drag'], decoded: ['解码预览', 'Decoded preview'], marker: ['目标 · 拖动', 'Target · drag'],
  rootDrag: ['Root · 拖动', 'Root · drag'], socketDrag: ['Socket · 拖动', 'Socket · drag'],
  receiver: ['接收器', 'Receiver'], sender: ['Sender', 'Sender'],
};
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const vector = p => new THREE.Vector3(p.x, p.y, p.z), coordinates = p => ({ x: p.x, y: p.y, z: p.z });
const element = (tag, className) => { const node = document.createElement(tag); if (className) node.className = className; return node; };
const rounded = value => Number(value.toPrecision(12));
const anchorIndex = shape => /^receiver-P[0-3]$/.test(shape.id) ? Number(shape.id.slice(-1)) : -1;
const shapeColor = shape => anchorIndex(shape) >= 0 ? globalThis.SensaParameterGeometry.anchorColors[anchorIndex(shape)] : shape.role === 'sender' ? orange : blue;
const capsuleLength = shape => vector(shape.a).distanceTo(vector(shape.b));
const shapeSignature = shape => JSON.stringify(shape.type === 'box' ? ['box', shape.size.x, shape.size.y, shape.size.z]
  : [shape.type, shape.radius, shape.type === 'capsule' ? rounded(capsuleLength(shape)) : 0]);
const illustrationSignature = item => JSON.stringify([item.length, item.radius, item.profile]);
const boxCorners = shape => Array.from({ length: 8 }, (_, i) => new THREE.Vector3(
  shape.center.x + (i & 1 ? .5 : -.5) * shape.size.x, shape.center.y + (i & 2 ? .5 : -.5) * shape.size.y, shape.center.z + (i & 4 ? .5 : -.5) * shape.size.z));

function create(host) {
  if (!(host instanceof HTMLElement)) throw new TypeError('A 3D host element is required');
  const canvas = element('canvas', 'three-canvas');
  const context = canvas.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'low-power' });
  if (!context) throw new Error('WebGL2 unavailable');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, alpha: false, preserveDrawingBuffer: true }); }
  catch (error) { context.getExtension('WEBGL_lose_context')?.loseContext(); throw error; }
  renderer.setClearColor(0xfcfdff, 1); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(42, 1, .001, 100);
  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const light = new THREE.DirectionalLight(0xffffff, 2.1); light.position.set(4, 7, 6); scene.add(light);
  const objects = new THREE.Group(); scene.add(objects);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false; controls.autoRotate = false; controls.enablePan = false;
  controls.minPolarAngle = .12; controls.maxPolarAngle = Math.PI - .12;
  controls.rotateSpeed = .65; controls.zoomSpeed = .8; controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
  const viewport = element('div', 'three-viewport'), overlay = element('div', 'three-labels');
  overlay.setAttribute('aria-hidden', 'true');
  const toolbar = element('div', 'three-controls'), rotateGroup = element('div', 'three-control-group'), zoomGroup = element('div', 'three-control-group');
  toolbar.setAttribute('role', 'group'); rotateGroup.setAttribute('role', 'group'); zoomGroup.setAttribute('role', 'group');
  const hint = element('p', 'three-hint'); hint.id = host.id + '-hint';
  const buttons = new Map();
  for (const [action, glyph] of [['left', '←'], ['right', '→'], ['up', '↑'], ['down', '↓'], ['zoom-out', '−'], ['zoom-in', '+'], ['reset', '↺']]) {
    const button = element('button'); button.type = 'button'; button.textContent = glyph; button.dataset.cameraAction = action;
    (['left', 'right', 'up', 'down'].includes(action) ? rotateGroup : zoomGroup).append(button); buttons.set(action, button);
  }
  toolbar.append(rotateGroup, zoomGroup);
  canvas.tabIndex = 0; canvas.setAttribute('role', 'group'); canvas.setAttribute('aria-describedby', hint.id);
  viewport.append(canvas, overlay); host.replaceChildren(viewport, toolbar, hint); host.dataset.renderState = 'ready';
  let latest = null, scenario = '', locale = 'zh-CN', disposed = false, lost = false, notifying = false, drag = null;
  let dragPlane = 'xz', fitDistance = 0, framingRadius = 1, width = 0, height = 0, axes = null;
  const frameCenter = new THREE.Vector3(), raycaster = new THREE.Raycaster();
  const labels = new Map(), shapeObjects = new Map(), illustrations = new Map(), markers = new Map(), dimensions = new Map();
  const t = key => words[key][locale === 'en-US' ? 1 : 0];
  let api;
  const instanceId = ++lifecycle.created;
  const disposeObject = object => {
    if (!object) return;
    const geometries = new Set(), materials = new Set();
    object.traverse(child => {
      if (child.geometry) geometries.add(child.geometry);
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) if (material) materials.add(material);
    });
    object.removeFromParent(); geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
  };
  const removeLabel = id => { labels.get(id)?.node.remove(); labels.delete(id); };
  const label = (id, object, text, className = '', preferred = [12, -20], color) => {
    let item = labels.get(id);
    if (!item) { item = { node: element('span') }; item.node.dataset.labelId = id; overlay.append(item.node); labels.set(id, item); }
    Object.assign(item, { object, preferred }); item.node.className = 'three-label ' + className; item.node.textContent = text;
    item.node.style.color = color || ''; return item.node;
  };
  const pointMarker = (id, position, color, size) => {
    let object = markers.get(id);
    if (!object) {
      object = new THREE.Points(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3()]),
        new THREE.PointsMaterial({ color, size, sizeAttenuation: false, depthTest: false, transparent: true }));
      object.name = id; object.renderOrder = 20; objects.add(object); markers.set(id, object);
    }
    object.position.copy(vector(position)); object.material.color.set(color); return object;
  };
  const referencePoint = (id, position) => {
    let object = markers.get(id);
    if (!object) { object = new THREE.Object3D(); object.name = id; objects.add(object); markers.set(id, object); }
    object.position.copy(vector(position)); return object;
  };
  const clearObjects = () => {
    objects.children.slice().forEach(disposeObject); shapeObjects.clear(); illustrations.clear(); markers.clear(); dimensions.clear();
    labels.clear(); overlay.replaceChildren(); axes = null;
  };
  function endDrag() {
    if (!drag) return;
    const previous = drag; drag = null; controls.enabled = previous.controlsEnabled; canvas.style.cursor = 'grab';
    if (canvas.hasPointerCapture(previous.id)) canvas.releasePointerCapture(previous.id);
  }
  const notifyUnavailable = reason => {
    if (disposed || notifying) return;
    endDrag(); lost = true; notifying = true; host.dataset.renderState = 'fallback';
    host.dispatchEvent(new CustomEvent('sensa-3d-unavailable', { detail: { reason } }));
  };
  const circle = radius => Array.from({ length: 96 }, (_, i) => new THREE.Vector3(Math.cos(i * Math.PI / 48) * radius, Math.sin(i * Math.PI / 48) * radius, 0));
  function addOutlines(group, shape, color) {
    const length = shape.type === 'capsule' ? capsuleLength(shape) : 0;
    for (let i = 0; i < (shape.type === 'capsule' ? 2 : 3); i++) {
      const points = shape.type === 'capsule' ? Array.from({ length: 98 }, (_, index) => {
        const theta = index < 49 ? index * Math.PI / 48 : Math.PI + (index - 49) * Math.PI / 48;
        return new THREE.Vector3(Math.cos(theta) * shape.radius, Math.sin(theta) * shape.radius + (index < 49 ? length / 2 : -length / 2), 0);
      }) : circle(shape.radius);
      const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, transparent: true, opacity: .25, depthWrite: false }));
      if (shape.type === 'capsule') { if (i === 1) ring.rotation.y = Math.PI / 2; }
      else { if (i === 1) ring.rotation.x = Math.PI / 2; if (i === 2) ring.rotation.y = Math.PI / 2; }
      ring.name = shape.id + ':outline-' + i; group.add(ring);
    }
  }
  function syncShapes(result, selected, visibility) {
    const ids = new Set(result.shapes.map(shape => shape.id)), field = result.values.find(value => value.name === selected);
    for (const [id, group] of shapeObjects) if (!ids.has(id)) { disposeObject(group); shapeObjects.delete(id); }
    for (const shape of result.shapes) {
      const signature = shapeSignature(shape), color = shapeColor(shape);
      let group = shapeObjects.get(shape.id);
      if (!group || group.userData.signature !== signature) {
        disposeObject(group); group = new THREE.Group(); group.name = shape.id; group.userData = { signature, role: shape.role };
        if (shape.type === 'box') {
          const box = new THREE.BoxGeometry(shape.size.x, shape.size.y, shape.size.z), geometry = new THREE.EdgesGeometry(box); box.dispose();
          const edges = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: gray, transparent: true, opacity: .65 }));
          edges.name = shape.id + ':edges'; group.add(edges);
        } else {
          const geometry = shape.type === 'capsule' ? new THREE.CapsuleGeometry(shape.radius, capsuleLength(shape), 12, 32) : new THREE.SphereGeometry(shape.radius, 48, 24);
          const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .035, depthWrite: false, side: THREE.DoubleSide }));
          mesh.name = shape.id + ':surface'; group.add(mesh); addOutlines(group, shape, color);
        }
        objects.add(group); shapeObjects.set(shape.id, group);
      }
      group.position.copy(vector(shape.center)); group.quaternion.identity();
      if (shape.type === 'capsule') {
        const axis = vector(shape.b).sub(vector(shape.a)); group.position.copy(vector(shape.a).add(vector(shape.b)).multiplyScalar(.5));
        if (axis.lengthSq() > 1e-20) group.quaternion.setFromUnitVectors(up, axis.normalize());
      }
      group.visible = shape.role === 'receiver' ? visibility.receivers !== false : shape.role === 'sender' ? visibility.senders !== false : visibility.reference !== false;
      const active = shape.id === field?.receiverId || shape.id === field?.senderId;
      group.traverse(object => {
        if (!object.material || shape.type === 'box') return;
        object.material.color.set(color); object.material.opacity = object.isMesh ? active ? .075 : selected ? .012 : .03 : active ? .55 : .15;
      });
      if (anchorIndex(shape) >= 0) {
        const id = 'anchor-P' + anchorIndex(shape), anchor = pointMarker(id, shape.center, color, 5); anchor.visible = visibility.reference !== false;
        label(id, anchor, 'P' + anchorIndex(shape), 'three-label--anchor', [[-36, 10], [14, 12], [-36, -24], [14, -24]][anchorIndex(shape)], color).classList.toggle('three-label--active', active);
      }
    }
  }
  function syncIllustrations(result, visibility) {
    const ids = new Set((result.illustrations || []).map(item => item.id));
    for (const [id, group] of illustrations) if (!ids.has(id)) {
      disposeObject(group); illustrations.delete(id);
      for (const suffix of ['root', 'tip']) { const key = 'illustration-' + id + '-' + suffix; disposeObject(markers.get(key)); markers.delete(key); removeLabel(key); }
    }
    for (const item of result.illustrations || []) {
      const signature = illustrationSignature(item);
      let group = illustrations.get(item.id);
      if (!group || group.userData.signature !== signature) {
        disposeObject(group); group = new THREE.Group(); group.name = item.id; group.userData = { signature, kind: item.kind };
        const profile = item.profile.map(point => new THREE.Vector2(point.r * item.radius, point.t * item.length));
        const mesh = new THREE.Mesh(new THREE.LatheGeometry(profile, 64), new THREE.MeshStandardMaterial({
          color: gray, roughness: .52, metalness: .05, transparent: true, opacity: .74, side: THREE.DoubleSide, depthWrite: false,
        }));
        mesh.name = item.id + ':surface'; group.add(mesh); objects.add(group); illustrations.set(item.id, group);
      }
      group.position.copy(vector(item.root)); group.quaternion.setFromUnitVectors(up, vector(item.axis).normalize()); group.visible = visibility.reference !== false;
      const rootId = 'illustration-' + item.id + '-root', point = referencePoint(rootId, item.root); point.visible = group.visible;
      if (vector(item.root).distanceTo(vector(result.points.movingRoot)) > 1e-8) label(rootId, point, item.kind === 'socket' ? 'Socket' : 'Root', '', [-28, -26]);
      else removeLabel(rootId);
      if (item.kind === 'plug') {
        const tipId = 'illustration-' + item.id + '-tip', tip = vector(item.axis).multiplyScalar(item.length).add(vector(item.root));
        const point = referencePoint(tipId, tip); point.visible = group.visible; label(tipId, point, 'Tip', '', [12, 10]);
      }
    }
  }
  function syncMarkers(result) {
    const target = pointMarker('moving-root', result.points.movingRoot, orange, 9);
    const coincident = (result.illustrations || []).find(item => vector(item.root).distanceTo(vector(result.points.movingRoot)) < 1e-8);
    label('moving-root', target, t(result.scenario === 'shader' ? 'input' : coincident ? coincident.kind === 'socket' ? 'socketDrag' : 'rootDrag' : 'marker'), 'three-label--moving', [14, -24]);
    if (result.scenario === 'shader') {
      const decoded = pointMarker('decoded-root', result.metrics.decodedPosition, blue, 4);
      label('decoded-root', decoded, t('decoded'), 'three-label--decoded', [14, 9]);
    }
  }
  function framing() {
    const bounds = new THREE.Box3();
    for (const shape of latest.result.shapes) {
      if (shape.type === 'box') boxCorners(shape).forEach(point => bounds.expandByPoint(point));
      else for (const position of shape.type === 'capsule' ? [shape.a, shape.b] : [shape.center]) {
        const center = vector(position), radius = new THREE.Vector3(shape.radius, shape.radius, shape.radius);
        bounds.expandByPoint(center.clone().sub(radius)); bounds.expandByPoint(center.clone().add(radius));
      }
    }
    objects.updateMatrixWorld(true);
    for (const group of illustrations.values()) bounds.union(new THREE.Box3().setFromObject(group));
    bounds.expandByPoint(vector(latest.result.points.movingRoot)); bounds.expandByPoint(new THREE.Vector3());
    if (latest.result.points.frameCenter) frameCenter.copy(vector(latest.result.points.frameCenter)); else bounds.getCenter(frameCenter);
    framingRadius = 0;
    for (const shape of latest.result.shapes) {
      if (shape.type === 'box') for (const point of boxCorners(shape)) framingRadius = Math.max(framingRadius, point.distanceTo(frameCenter));
      else for (const position of shape.type === 'capsule' ? [shape.a, shape.b] : [shape.center]) framingRadius = Math.max(framingRadius, vector(position).distanceTo(frameCenter) + shape.radius);
    }
    for (const group of illustrations.values()) {
      const mesh = group.children[0], positions = mesh.geometry.getAttribute('position'), point = new THREE.Vector3();
      for (let i = 0; i < positions.count; i++) { point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld); framingRadius = Math.max(framingRadius, point.distanceTo(frameCenter)); }
    }
    framingRadius = Math.max(framingRadius, vector(latest.result.points.movingRoot).distanceTo(frameCenter), 1e-4);
  }
  function syncAxes() {
    disposeObject(axes); axes = new THREE.Group(); axes.name = 'local-axes'; objects.add(axes);
    const length = latest.result.points.frameCenter ? .8 : framingRadius * .45;
    const origin = pointMarker('local-origin', { x: 0, y: 0, z: 0 }, gray, 3); label('local-origin', origin, '(0, 0, 0)', 'three-label--origin', [-58, 12]);
    for (const [axis, position] of [['X', { x: length, y: 0, z: 0 }], ['Y', { x: 0, y: length, z: 0 }], ['Z', { x: 0, y: 0, z: length }]]) {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), vector(position)]), new THREE.LineBasicMaterial({ color: gray, transparent: true, opacity: .65 }));
      line.name = 'axis-' + axis; axes.add(line);
      const point = referencePoint('axis-' + axis + '-end', position); label('axis-' + axis, point, '+' + axis, 'three-label--axis', axis === 'Y' ? [10, -18] : [10, 6]);
    }
  }
  function fittedDistance(aspect) {
    const vertical = THREE.MathUtils.degToRad(camera.fov / 2), horizontal = Math.atan(Math.tan(vertical) * aspect);
    return framingRadius / Math.sin(Math.min(vertical, horizontal)) * 1.15;
  }
  function resetView() {
    if (disposed || lost || !latest) return;
    endDrag(); framing(); syncAxes();
    camera.aspect = Math.max(viewport.clientWidth, 1) / Math.max(viewport.clientHeight, 1); fitDistance = fittedDistance(camera.aspect); controls.target.copy(frameCenter);
    camera.position.copy(new THREE.Vector3(1.1, .85, 1.35).normalize().multiplyScalar(fitDistance).add(controls.target));
    camera.up.copy(up); camera.near = Math.max(framingRadius / 5000, 1e-6); camera.far = fitDistance * 12;
    camera.updateProjectionMatrix(); controls.minDistance = framingRadius * .12; controls.maxDistance = fitDistance * 4;
    controls.update(); controls.saveState(); render();
  }
  function positionLabels(w, h) {
    const occupied = [], projected = new THREE.Vector3(), priority = id => id === 'moving-root' ? 0 : id === 'decoded-root' ? 1 : id.startsWith('anchor-') ? 2 : 3;
    for (const [id, item] of [...labels].sort((a, b) => priority(a[0]) - priority(b[0]))) {
      item.object.getWorldPosition(projected); projected.project(camera);
      item.node.hidden = !item.object.visible || item.object.parent === null || projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1.2 || Math.abs(projected.y) > 1.2;
      if (item.node.hidden) continue;
      const x = (projected.x + 1) * w / 2, y = (1 - projected.y) * h / 2, labelWidth = item.node.offsetWidth, labelHeight = item.node.offsetHeight;
      const at = (dx, dy) => { const left = Math.max(8, Math.min(w - labelWidth - 8, x + dx)), top = Math.max(8, Math.min(h - labelHeight - 8, y + dy)); return { left, top, right: left + labelWidth, bottom: top + labelHeight }; };
      const free = rect => !occupied.some(other => rect.left < other.right + 5 && rect.right > other.left - 5 && rect.top < other.bottom + 4 && rect.bottom > other.top - 4);
      let rect = [item.preferred, [14, -24], [14, 12], [-labelWidth - 14, -24], [-labelWidth - 14, 12], [-labelWidth / 2, -42], [-labelWidth / 2, 30]].map(offset => at(...offset)).find(free);
      if (!rect) {
        const candidates = [];
        for (let top = 8; top <= h - labelHeight - 8; top += labelHeight + 6) for (let left = 8; left <= w - labelWidth - 8; left += 24) candidates.push({ left, top, right: left + labelWidth, bottom: top + labelHeight });
        rect = candidates.filter(free).sort((a, b) => Math.hypot(a.left - x, a.top - y) - Math.hypot(b.left - x, b.top - y))[0] || at(...item.preferred);
      }
      item.node.style.left = rect.left + 'px'; item.node.style.top = rect.top + 'px'; occupied.push(rect);
    }
  }
  function render() {
    if (disposed || lost || !latest) return;
    try { scene.updateMatrixWorld(true); camera.updateMatrixWorld(true); renderer.render(scene, camera); positionLabels(viewport.clientWidth, viewport.clientHeight); }
    catch { notifyUnavailable('render-failed'); }
  }
  function resize() {
    if (disposed || lost) return;
    const nextWidth = Math.max(viewport.clientWidth, 1), nextHeight = Math.max(viewport.clientHeight, 1); if (nextWidth !== width || nextHeight !== height) endDrag();
    width = nextWidth; height = nextHeight; renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setSize(width, height, false);
    camera.aspect = width / height; camera.updateProjectionMatrix();
    if (fitDistance > 0) {
      const nextFit = fittedDistance(camera.aspect), ratio = nextFit / fitDistance;
      if (Math.abs(ratio - 1) > 1e-8) {
        camera.position.sub(controls.target).multiplyScalar(ratio).add(controls.target); controls.minDistance *= ratio; controls.maxDistance *= ratio;
        fitDistance = nextFit; camera.far = fitDistance * 12; camera.updateProjectionMatrix(); controls.update();
      }
    }
    render();
  }
  function syncDimensions(result, selected, visibility) {
    const field = result.values.find(value => value.name === selected), ids = new Set();
    for (const [id, shapeId, role] of [['radius', field?.receiverId, 'receiver'], ['sender-radius', field?.senderId, 'sender']]) {
      const shape = result.shapes.find(item => item.id === shapeId);
      if (!shape?.radius || visibility.dimensions === false || visibility[role === 'receiver' ? 'receivers' : 'senders'] === false) continue;
      ids.add(id); let line = dimensions.get(id);
      if (!line) {
        line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineDashedMaterial({ color: shapeColor(shape), dashSize: .05, gapSize: .03, transparent: true, opacity: .8 }));
        line.name = id; objects.add(line); dimensions.set(id, line);
      }
      const a = vector(shape.center), b = a.clone().add(new THREE.Vector3(shape.radius, 0, 0)), positions = line.geometry.getAttribute('position');
      positions.setXYZ(0, a.x, a.y, a.z); positions.setXYZ(1, b.x, b.y, b.z); positions.needsUpdate = true;
      line.geometry.computeBoundingSphere(); line.material.color.set(shapeColor(shape)); line.material.dashSize = framingRadius * .03; line.material.gapSize = framingRadius * .02; line.computeLineDistances();
      const point = referencePoint(id + '-end', b), name = anchorIndex(shape) >= 0 ? 'P' + anchorIndex(shape) : t(role);
      label(id, point, name + ' · R ' + shape.radius.toFixed(3), 'three-label--dimension', [12, -22], shapeColor(shape));
    }
    for (const [id, line] of dimensions) if (!ids.has(id)) { disposeObject(line); dimensions.delete(id); disposeObject(markers.get(id + '-end')); markers.delete(id + '-end'); removeLabel(id); }
  }
  function update(options) {
    if (disposed || lost) return;
    const nextPlane = ['xz', 'xy', 'yz'].includes(options.dragPlane) ? options.dragPlane : 'xz', changed = options.result.scenario !== scenario;
    if (changed || nextPlane !== dragPlane) endDrag(); latest = options; locale = options.locale === 'en-US' ? 'en-US' : 'zh-CN'; dragPlane = nextPlane;
    if (changed) { clearObjects(); scenario = options.result.scenario; }
    syncShapes(options.result, options.selected, options.visibility || {}); syncIllustrations(options.result, options.visibility || {}); syncMarkers(options.result);
    if (changed) resetView(); if (disposed || lost) return;
    syncDimensions(options.result, options.selected, options.visibility || {});
    for (const [name, button] of buttons) { button.setAttribute('aria-label', t(name)); button.title = t(name); }
    toolbar.setAttribute('aria-label', t('camera')); rotateGroup.setAttribute('aria-label', t('rotate')); zoomGroup.setAttribute('aria-label', t('zoom'));
    canvas.setAttribute('aria-label', t('canvas')); hint.textContent = t('hint'); resize(); if (!disposed && !lost) host.dataset.renderState = 'ready';
  }
  function action(name) {
    if (disposed || lost || drag) return;
    if (name === 'left') controls.rotateLeft(.2); else if (name === 'right') controls.rotateLeft(-.2);
    else if (name === 'up') controls.rotateUp(.15); else if (name === 'down') controls.rotateUp(-.15);
    else if (name === 'zoom-in') controls.dollyIn(1 / 1.2); else if (name === 'zoom-out') controls.dollyOut(1 / 1.2); else resetView();
  }
  const click = event => { const name = event.target.closest('[data-camera-action]')?.dataset.cameraAction; if (name) action(name); };
  const keydown = event => {
    if (event.key === 'Escape' && drag) { event.preventDefault(); endDrag(); return; }
    const name = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', '+': 'zoom-in', '=': 'zoom-in', '-': 'zoom-out', Home: 'reset' }[event.key];
    if (name) { event.preventDefault(); action(name); }
  };
  const setRay = (event, rect, viewCamera) => raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2), viewCamera);
  function targetHit(event) {
    const target = markers.get('moving-root'); if (!target || !latest?.onMove) return false;
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    const rect = canvas.getBoundingClientRect(), point = target.getWorldPosition(new THREE.Vector3()), depth = -point.clone().applyMatrix4(camera.matrixWorldInverse).z;
    if (depth <= camera.near || rect.width <= 0 || rect.height <= 0) return false;
    raycaster.params.Points.threshold = 14 * 2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / rect.height;
    setRay(event, rect, camera); return raycaster.intersectObject(target, false).length > 0;
  }
  const pointerdown = event => {
    if (disposed || lost || drag || event.button !== 0 || event.isPrimary === false || !targetHit(event)) return;
    const startPoint = vector(latest.result.points.movingRoot), lockedAxis = { xz: 'y', xy: 'z', yz: 'x' }[dragPlane];
    const normal = new THREE.Vector3(lockedAxis === 'x' ? 1 : 0, lockedAxis === 'y' ? 1 : 0, lockedAxis === 'z' ? 1 : 0);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, startPoint), viewCamera = camera.clone(), rect = canvas.getBoundingClientRect();
    setRay(event, rect, viewCamera); if (Math.abs(raycaster.ray.direction.dot(normal)) < .02) return;
    const hit = raycaster.ray.intersectPlane(plane, new THREE.Vector3()); if (!hit) return;
    event.preventDefault(); event.stopImmediatePropagation(); canvas.focus({ preventScroll: true });
    drag = { id: event.pointerId, plane, planeName: dragPlane, lockedAxis, startPoint, camera: viewCamera, rect, offset: startPoint.clone().sub(hit), controlsEnabled: controls.enabled };
    controls.enabled = false; canvas.setPointerCapture(event.pointerId); canvas.style.cursor = 'grabbing';
  };
  const pointermove = event => {
    if (!drag || event.pointerId !== drag.id) { if (!drag && !disposed && !lost) canvas.style.cursor = targetHit(event) ? 'move' : 'grab'; return; }
    event.preventDefault(); event.stopImmediatePropagation(); setRay(event, drag.rect, drag.camera);
    if (Math.abs(raycaster.ray.direction.dot(drag.plane.normal)) < .02) return;
    const point = raycaster.ray.intersectPlane(drag.plane, new THREE.Vector3()); if (!point) return;
    point.add(drag.offset); point[drag.lockedAxis] = drag.startPoint[drag.lockedAxis];
    if ([point.x, point.y, point.z].every(Number.isFinite)) latest.onMove?.(coordinates(point));
  };
  const pointerend = event => { if (drag?.id === event.pointerId) { event.preventDefault(); event.stopImmediatePropagation(); endDrag(); } };
  const contextLost = event => { event.preventDefault(); notifyUnavailable('context-lost'); };
  canvas.addEventListener('pointerdown', pointerdown, true); canvas.addEventListener('pointermove', pointermove, true);
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(name, pointerend, true);
  canvas.addEventListener('webglcontextlost', contextLost); canvas.addEventListener('keydown', keydown);
  toolbar.addEventListener('click', click); controls.addEventListener('change', render);
  const observer = new ResizeObserver(resize); observer.observe(viewport);
  function snapshotObject(group) {
    const object = group.children.find(child => child.geometry && child.material?.visible !== false), geometry = object?.geometry; geometry?.computeBoundingBox();
    const parameters = {};
    for (const [name, value] of Object.entries(geometry?.parameters || {})) {
      if (['number', 'boolean', 'string'].includes(typeof value)) parameters[name] = value;
      else if (name === 'points') parameters.points = value.map(point => ({ x: point.x, y: point.y }));
    }
    return { id: group.name, uuid: group.uuid, type: group.type, role: group.userData.role, kind: group.userData.kind, visible: group.visible,
      scale: group.scale.toArray(), position: coordinates(group.position), quaternion: group.quaternion.toArray(),
      worldPosition: coordinates(group.getWorldPosition(new THREE.Vector3())), matrixWorld: group.matrixWorld.toArray(),
      material: object?.material ? { color: '#' + object.material.color.getHexString(), opacity: object.material.opacity, type: object.material.type } : null,
      geometry: geometry ? { type: geometry.type, parameters, vertices: geometry.getAttribute('position').count,
        bounds: { min: coordinates(geometry.boundingBox.min), max: coordinates(geometry.boundingBox.max) },
        ...(geometry.type === 'LatheGeometry' ? { positions: Array.from(geometry.getAttribute('position').array) } : {}) } : null };
  }
  function snapshot() {
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true); const rect = canvas.getBoundingClientRect();
    return freeze({
      status: disposed ? 'disposed' : lost ? 'fallback' : 'ready', scenario,
      camera: { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), target: controls.target.toArray(), matrixWorld: camera.matrixWorld.toArray(),
        projectionMatrix: camera.projectionMatrix.toArray(), zoom: camera.zoom, fov: camera.fov, aspect: camera.aspect, near: camera.near, far: camera.far },
      objects: [...shapeObjects.values()].map(snapshotObject), illustrations: [...illustrations.values()].map(snapshotObject),
      markers: [...markers.values()].filter(object => object.isPoints).map(object => ({ id: object.name, visible: object.visible, position: coordinates(object.position),
        worldPosition: coordinates(object.getWorldPosition(new THREE.Vector3())), matrixWorld: object.matrixWorld.toArray(), color: '#' + object.material.color.getHexString(),
        material: { color: '#' + object.material.color.getHexString(), type: object.material.type, size: object.material.size } })),
      canvas: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      drag: { active: !!drag, plane: dragPlane, pointerId: drag?.id ?? null, lockedAxis: drag?.lockedAxis ?? null, startPoint: drag ? coordinates(drag.startPoint) : null,
        cameraMatrixWorld: drag?.camera.matrixWorld.toArray() ?? null, planeNormal: drag ? coordinates(drag.plane.normal) : null },
      renderer: { instanceId, width: canvas.width, height: canvas.height, pixelRatio: renderer.getPixelRatio(), contextLost: context.isContextLost(),
        render: { ...renderer.info.render }, memory: { ...renderer.info.memory }, preserveDrawingBuffer: renderer.getContextAttributes()?.preserveDrawingBuffer },
      labels: [...labels].map(([id, item]) => ({ id, text: item.node.textContent, hidden: item.node.hidden })), lifecycle: { ...lifecycle, live: instances.size },
    });
  }
  function dispose() {
    if (disposed) return;
    endDrag(); disposed = true; observer.disconnect();
    canvas.removeEventListener('pointerdown', pointerdown, true); canvas.removeEventListener('pointermove', pointermove, true);
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.removeEventListener(name, pointerend, true);
    canvas.removeEventListener('webglcontextlost', contextLost); canvas.removeEventListener('keydown', keydown);
    toolbar.removeEventListener('click', click); controls.removeEventListener('change', render); controls.dispose();
    clearObjects(); renderer.dispose(); renderer.forceContextLoss(); host.replaceChildren(); host.dataset.renderState = 'idle';
    instances.delete(api); lifecycle.disposed++;
  }
  api = Object.freeze({ update, resize, resetView, dispose, snapshot }); instances.add(api); return api;
}
Object.defineProperty(globalThis, 'SensaParameterGeometry3D', {
  value: Object.freeze({ create, snapshot: () => [...instances].at(-1)?.snapshot() || freeze({ status: 'idle', lifecycle: { ...lifecycle, live: instances.size } }) }), writable: false,
});
