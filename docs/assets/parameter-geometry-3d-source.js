/* Offline, on-demand Three.js spatial view. / 离线、按需绘制的 Three.js 空间视图。
 * API checked against installed three@0.186.1:
 * https://threejs.org/docs/pages/WebGLRenderer.html
 * https://threejs.org/docs/pages/OrbitControls.html
 * Damping/autoRotate stay off: controls change, data and resize are the only render triggers.
 * Geometry/materials, controls, observers and WebGL context are released on dispose.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const lifecycle = { created: 0, disposed: 0 };
const instances = new Set();
const blue = 0x0052d9, orange = 0xc76a0a, gray = 0x748096;
const words = {
  camera: ['三维相机', '3D camera'], rotate: ['旋转视角', 'Rotate view'], zoom: ['缩放视角', 'Zoom view'],
  left: ['向左旋转', 'Rotate left'], right: ['向右旋转', 'Rotate right'],
  up: ['向上旋转', 'Rotate up'], down: ['向下旋转', 'Rotate down'],
  'zoom-in': ['放大视角', 'Zoom in'], 'zoom-out': ['缩小视角', 'Zoom out'], reset: ['复位视角', 'Reset view'],
  canvas: ['可旋转三维几何；方向键旋转，加减键缩放，Home 复位。', 'Rotatable 3D geometry; arrow keys rotate, plus/minus zoom, Home resets.'],
  hint: ['拖动旋转 · 滚轮／双指缩放；坐标只由下方 XYZ 滑条改变。', 'Drag to orbit · wheel/pinch to zoom; only the XYZ sliders change coordinates.'],
  input: ['输入点', 'Input'], decoded: ['解码预览', 'Decoded preview'], marker: ['移动标记', 'Moving marker'],
  origin: ['局部原点', 'Local origin'],
};
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const vector = point => new THREE.Vector3(point.x, point.y, point.z);
const coordinates = point => ({ x: point.x, y: point.y, z: point.z });
const element = (tag, className) => { const node = document.createElement(tag); if (className) node.className = className; return node; };

function create(host) {
  if (!(host instanceof HTMLElement)) throw new TypeError('A 3D host element is required');
  const canvas = element('canvas', 'three-canvas');
  const context = canvas.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'low-power' });
  if (!context) throw new Error('WebGL2 unavailable');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, alpha: false, preserveDrawingBuffer: true });
  } catch (error) {
    context.getExtension('WEBGL_lose_context')?.loseContext();
    throw error;
  }
  renderer.setClearColor(0xfcfdff, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(42, 1, .05, 100);
  const objects = new THREE.Group(); scene.add(objects);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false; controls.autoRotate = false; controls.enablePan = false;
  controls.minPolarAngle = .12; controls.maxPolarAngle = Math.PI - .12;
  controls.rotateSpeed = .65; controls.zoomSpeed = .8;
  controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
  const viewport = element('div', 'three-viewport'), overlay = element('div', 'three-labels');
  overlay.setAttribute('aria-hidden', 'true');
  const toolbar = element('div', 'three-controls'), rotateGroup = element('div', 'three-control-group'), zoomGroup = element('div', 'three-control-group');
  toolbar.setAttribute('role', 'group'); rotateGroup.setAttribute('role', 'group'); zoomGroup.setAttribute('role', 'group');
  const hint = element('p', 'three-hint'); hint.id = host.id + '-hint';
  const buttons = new Map();
  for (const [action, glyph] of [['left', '←'], ['right', '→'], ['up', '↑'], ['down', '↓'], ['zoom-out', '−'], ['zoom-in', '+'], ['reset', '↺']]) {
    const button = element('button'); button.type = 'button'; button.textContent = glyph; button.dataset.cameraAction = action;
    (['left', 'right', 'up', 'down'].includes(action) ? rotateGroup : zoomGroup).append(button);
    buttons.set(action, button);
  }
  toolbar.append(rotateGroup, zoomGroup);
  canvas.tabIndex = 0; canvas.setAttribute('role', 'group'); canvas.setAttribute('aria-describedby', hint.id);
  viewport.append(canvas, overlay); host.replaceChildren(viewport, toolbar, hint);
  host.dataset.renderState = 'ready';
  let latest = null, scenario = '', locale = 'zh-CN', disposed = false, lost = false, notifying = false;
  const frameCenter = new THREE.Vector3(0, 1, 0);
  let framingRadius = 0, fitDistance = 0;
  const labels = new Map(), shapeObjects = new Map(), visualObjects = new Map();
  const t = key => words[key][locale === 'en-US' ? 1 : 0];
  let api;
  const instanceId = ++lifecycle.created;
  const notifyUnavailable = reason => {
    if (disposed || notifying) return;
    lost = true; notifying = true; host.dataset.renderState = 'fallback';
    host.dispatchEvent(new CustomEvent('sensa-3d-unavailable', { detail: { reason } }));
  };
  const clearObjects = () => {
    const geometries = new Set(), materials = new Set();
    objects.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material) materials.add(material);
    });
    objects.clear(); geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
    shapeObjects.clear(); visualObjects.clear(); labels.clear(); overlay.replaceChildren();
  };
  const addLabel = (id, object, text, className, preferred = [12, -18]) => {
    const node = element('span', 'three-label ' + (className || '')); node.dataset.labelId = id; node.textContent = text;
    overlay.append(node); labels.set(id, { node, object, preferred });
  };
  const line = (name, a, b, color, dashed = false) => {
    const geometry = new THREE.BufferGeometry().setFromPoints([a, b]);
    const material = dashed ? new THREE.LineDashedMaterial({ color, dashSize: .09, gapSize: .06, transparent: true, opacity: .8 })
      : new THREE.LineBasicMaterial({ color, transparent: true, opacity: .65 });
    const object = new THREE.Line(geometry, material); object.name = name;
    if (dashed) object.computeLineDistances();
    objects.add(object); return object;
  };
  const pointMarker = (id, point, color, size) => {
    const object = new THREE.Points(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3()]),
      new THREE.PointsMaterial({ color, size, sizeAttenuation: false, depthTest: false, transparent: true }));
    object.name = id; object.position.copy(vector(point)); object.renderOrder = 20;
    objects.add(object); visualObjects.set(id, object); return object;
  };
  const circle = radius => Array.from({ length: 97 }, (_, i) => new THREE.Vector3(Math.cos(i * Math.PI / 48) * radius, Math.sin(i * Math.PI / 48) * radius, 0));
  function build(result) {
    clearObjects(); scenario = result.scenario;
    frameCenter.copy(vector(result.points.frameCenter || { x: 0, y: 1, z: 0 }));
    framingRadius = 0;
    for (const shape of result.shapes) {
      if (shape.type === 'sphere') framingRadius = Math.max(framingRadius, vector(shape.center).distanceTo(frameCenter) + shape.radius);
      else if (shape.type === 'box') for (let corner = 0; corner < 8; corner++) {
        const point = new THREE.Vector3(shape.center.x + (corner & 1 ? .5 : -.5) * shape.size.x,
          shape.center.y + (corner & 2 ? .5 : -.5) * shape.size.y, shape.center.z + (corner & 4 ? .5 : -.5) * shape.size.z);
        framingRadius = Math.max(framingRadius, point.distanceTo(frameCenter));
      }
    }
    for (const shape of result.shapes) {
      const group = new THREE.Group(); group.name = shape.id; group.position.copy(vector(shape.center));
      group.userData.role = shape.role;
      if (shape.type === 'sphere') {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(shape.radius, 48, 24),
          new THREE.MeshBasicMaterial({ color: shape.role === 'receiver' ? blue : orange, transparent: true, opacity: .035, depthWrite: false, side: THREE.DoubleSide }));
        mesh.name = shape.id + ':surface'; group.add(mesh);
        if (shape.role === 'receiver') {
          for (let i = 0; i < 3; i++) {
            const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(circle(shape.radius)),
              new THREE.LineBasicMaterial({ color: blue, transparent: true, opacity: .25, depthWrite: false }));
            if (i === 1) ring.rotation.x = Math.PI / 2;
            if (i === 2) ring.rotation.y = Math.PI / 2;
            ring.name = shape.id + ':outline-' + i; group.add(ring);
          }
          const anchor = pointMarker('anchor-' + shape.id.slice(-2), shape.center, blue, 5);
          addLabel('anchor-' + shape.id.slice(-2), anchor, shape.id.slice(-2), 'three-label--anchor',
            [[-36, 10], [14, 12], [-36, -24], [14, -24]][Number(shape.id.slice(-1))]);
        }
      } else if (shape.type === 'box') {
        const box = new THREE.BoxGeometry(shape.size.x, shape.size.y, shape.size.z);
        const geometry = new THREE.EdgesGeometry(box); box.dispose();
        const edges = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: gray, transparent: true, opacity: .65 }));
        edges.name = shape.id + ':edges'; group.add(edges);
      }
      objects.add(group); shapeObjects.set(shape.id, group);
    }
    const root = pointMarker('moving-root', result.points.movingRoot, orange, 8);
    addLabel('moving-root', root, t(scenario === 'shader' ? 'input' : 'marker'), 'three-label--moving', [14, -22]);
    if (scenario === 'shader') {
      const decoded = pointMarker('decoded-root', result.metrics.decodedPosition, blue, 4);
      addLabel('decoded-root', decoded, t('decoded'), 'three-label--decoded', [14, 9]);
    }
    const origin = pointMarker('local-origin', { x: 0, y: 0, z: 0 }, gray, 3);
    addLabel('local-origin', origin, '(0, 0, 0)', 'three-label--origin', [-58, 12]);
    for (const [axis, point] of [['X', { x: .8, y: 0, z: 0 }], ['Y', { x: 0, y: .8, z: 0 }], ['Z', { x: 0, y: 0, z: .8 }]]) {
      line('axis-' + axis, new THREE.Vector3(), vector(point), gray);
      const endpoint = new THREE.Object3D(); endpoint.name = 'axis-' + axis + '-end'; endpoint.position.copy(vector(point)); objects.add(endpoint);
      addLabel('axis-' + axis, endpoint, '+' + axis, 'three-label--axis', axis === 'Y' ? [10, -18] : [10, 6]);
    }
    resetView();
  }
  function fittedDistance(aspect) {
    const vertical = THREE.MathUtils.degToRad(camera.fov / 2), horizontal = Math.atan(Math.tan(vertical) * aspect);
    // A bounding sphere subtends asin(radius / distance); use the narrower field with a 15% framing margin.
    // 用较窄视场容纳包围球，并留 15% 构图边距；不改变几何半径。
    return framingRadius / Math.sin(Math.min(vertical, horizontal)) * 1.15;
  }
  function resetView() {
    if (disposed || lost || !latest) return;
    camera.aspect = Math.max(viewport.clientWidth, 1) / Math.max(viewport.clientHeight, 1); camera.updateProjectionMatrix();
    fitDistance = fittedDistance(camera.aspect); controls.target.copy(frameCenter);
    camera.position.copy(new THREE.Vector3(1.1, .85, 1.35).normalize().multiplyScalar(fitDistance).add(controls.target));
    camera.up.set(0, 1, 0); controls.minDistance = scenario === 'sensa-sps' ? 4.5 : 2.5; controls.maxDistance = Math.max(22, fitDistance * 2);
    controls.update(); controls.saveState(); render();
  }
  function positionLabels(width, height) {
    const occupied = [], projected = new THREE.Vector3();
    const priority = id => id === 'moving-root' ? 0 : id === 'decoded-root' ? 1 : id.startsWith('anchor-') ? 2 : 3;
    for (const [id, item] of [...labels].sort((a, b) => priority(a[0]) - priority(b[0]))) {
      const objectVisible = item.object.visible && item.object.parent !== null;
      item.object.getWorldPosition(projected); projected.project(camera);
      const inView = objectVisible && projected.z >= -1 && projected.z <= 1 && Math.abs(projected.x) < 1.2 && Math.abs(projected.y) < 1.2;
      item.node.hidden = !inView;
      if (!inView) continue;
      const x = (projected.x + 1) * width / 2, y = (1 - projected.y) * height / 2;
      const w = item.node.offsetWidth, h = item.node.offsetHeight;
      const options = [item.preferred, [14, -24], [14, 12], [-w - 14, -24], [-w - 14, 12], [-w / 2, -42], [-w / 2, 30]];
      const at = (dx, dy) => {
        const left = Math.max(8, Math.min(width - w - 8, x + dx)), top = Math.max(8, Math.min(height - h - 8, y + dy));
        return { left, top, right: left + w, bottom: top + h };
      };
      const free = rect => !occupied.some(other => rect.left < other.right + 5 && rect.right > other.left - 5 && rect.top < other.bottom + 4 && rect.bottom > other.top - 4);
      let rect = options.map(([dx, dy]) => at(dx, dy)).find(free);
      if (!rect) {
        const candidates = [];
        for (let top = 8; top <= height - h - 8; top += h + 6) for (let left = 8; left <= width - w - 8; left += 24) candidates.push({ left, top, right: left + w, bottom: top + h });
        rect = candidates.filter(free).sort((a, b) => Math.hypot(a.left - x, a.top - y) - Math.hypot(b.left - x, b.top - y))[0] || at(...item.preferred);
      }
      item.node.style.left = rect.left + 'px'; item.node.style.top = rect.top + 'px'; occupied.push(rect);
    }
  }
  function render() {
    if (disposed || lost || !latest) return;
    try {
      scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
      renderer.render(scene, camera);
      positionLabels(viewport.clientWidth, viewport.clientHeight);
    } catch {
      notifyUnavailable('render-failed');
    }
  }
  function resize() {
    if (disposed || lost) return;
    const width = Math.max(viewport.clientWidth, 1), height = Math.max(viewport.clientHeight, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setSize(width, height, false);
    camera.aspect = width / height; camera.updateProjectionMatrix();
    if (fitDistance > 0) {
      const nextFit = fittedDistance(camera.aspect), ratio = nextFit / fitDistance;
      if (Math.abs(ratio - 1) > 1e-8) {
        camera.position.sub(controls.target).multiplyScalar(ratio).add(controls.target);
        controls.minDistance *= ratio; controls.maxDistance *= ratio; fitDistance = nextFit; controls.update();
      }
    }
    render();
  }
  function update(options) {
    if (disposed || lost) return;
    latest = options; locale = options.locale === 'en-US' ? 'en-US' : 'zh-CN';
    const { result, selected, visibility = {} } = options;
    if (!['sensa-sps', 'shader'].includes(result.scenario)) throw new RangeError('Only spatial scenarios have an orbit view');
    if (result.scenario !== scenario) build(result);
    const field = result.values.find(value => value.name === selected);
    for (const shape of result.shapes) {
      const group = shapeObjects.get(shape.id);
      group.position.copy(vector(shape.center));
      group.visible = shape.role === 'receiver' ? visibility.receivers !== false : shape.role === 'sender' ? visibility.senders !== false : visibility.reference !== false;
      const active = shape.id === field?.receiverId || shape.id === field?.senderId;
      group.traverse(object => {
        if (!object.material || shape.type !== 'sphere') return;
        object.material.opacity = object.isMesh ? shape.role === 'sender' ? .9 : active ? .045 : .008 : active ? .55 : .13;
      });
      if (shape.role === 'receiver') {
        const anchor = visualObjects.get('anchor-' + shape.id.slice(-2)); anchor.visible = visibility.reference !== false;
        labels.get('anchor-' + shape.id.slice(-2)).node.classList.toggle('three-label--active', active);
      }
    }
    visualObjects.get('moving-root').position.copy(vector(result.points.movingRoot));
    labels.get('moving-root').node.textContent = t(scenario === 'shader' ? 'input' : 'marker');
    if (scenario === 'shader') {
      visualObjects.get('decoded-root').position.copy(vector(result.metrics.decodedPosition));
      labels.get('decoded-root').node.textContent = t('decoded');
    }
    if (visualObjects.has('radius-line')) {
      const old = visualObjects.get('radius-line'); objects.remove(old); old.geometry.dispose(); old.material.dispose(); visualObjects.delete('radius-line');
      const label = labels.get('radius'); label?.node.remove(); labels.delete('radius');
      const endpoint = visualObjects.get('radius-end'); objects.remove(endpoint); visualObjects.delete('radius-end');
    }
    const receiver = result.shapes.find(shape => shape.id === field?.receiverId && shape.role === 'receiver');
    if (receiver && visibility.dimensions !== false && visibility.receivers !== false) {
      const a = vector(receiver.center), b = a.clone().add(new THREE.Vector3(receiver.radius, 0, 0));
      visualObjects.set('radius-line', line('radius-line', a, b, gray, true));
      const endpoint = new THREE.Object3D(); endpoint.name = 'radius-end'; endpoint.position.copy(b); objects.add(endpoint); visualObjects.set('radius-end', endpoint);
      addLabel('radius', endpoint, receiver.id.slice(-2) + ' · R ' + receiver.radius.toFixed(3), 'three-label--dimension', [12, -22]);
    }
    for (const [action, button] of buttons) { button.setAttribute('aria-label', t(action)); button.title = t(action); }
    toolbar.setAttribute('aria-label', t('camera')); rotateGroup.setAttribute('aria-label', t('rotate')); zoomGroup.setAttribute('aria-label', t('zoom'));
    canvas.setAttribute('aria-label', t('canvas')); hint.textContent = t('hint');
    resize(); if (!disposed && !lost) host.dataset.renderState = 'ready';
  }
  function action(name) {
    if (disposed || lost) return;
    if (name === 'left') controls.rotateLeft(.2);
    else if (name === 'right') controls.rotateLeft(-.2);
    else if (name === 'up') controls.rotateUp(.15);
    else if (name === 'down') controls.rotateUp(-.15);
    else if (name === 'zoom-in') controls.dollyIn(1 / 1.2);
    else if (name === 'zoom-out') controls.dollyOut(1 / 1.2);
    else resetView();
  }
  const click = event => { const name = event.target.closest('[data-camera-action]')?.dataset.cameraAction; if (name) action(name); };
  const keydown = event => {
    const name = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', '+': 'zoom-in', '=': 'zoom-in', '-': 'zoom-out', Home: 'reset' }[event.key];
    if (!name) return; event.preventDefault(); action(name);
  };
  const contextLost = event => { event.preventDefault(); notifyUnavailable('context-lost'); };
  canvas.addEventListener('webglcontextlost', contextLost);
  canvas.addEventListener('keydown', keydown); toolbar.addEventListener('click', click); controls.addEventListener('change', render);
  const observer = new ResizeObserver(resize); observer.observe(viewport);
  function snapshot() {
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    const snapshotObject = group => {
      const geometry = group.children.find(child => child.geometry && child.material?.visible !== false)?.geometry;
      geometry?.computeBoundingBox();
      return { id: group.name, uuid: group.uuid, type: group.type, role: group.userData.role, visible: group.visible, scale: group.scale.toArray(),
        position: coordinates(group.position), worldPosition: coordinates(group.getWorldPosition(new THREE.Vector3())), matrixWorld: group.matrixWorld.toArray(),
        geometry: geometry ? { type: geometry.type,
          parameters: Object.fromEntries(Object.entries(geometry.parameters || {}).filter(([, value]) => ['number', 'boolean', 'string'].includes(typeof value))),
          vertices: geometry.getAttribute('position').count,
          bounds: { min: coordinates(geometry.boundingBox.min), max: coordinates(geometry.boundingBox.max) } } : null };
    };
    return freeze({
      status: disposed ? 'disposed' : lost ? 'fallback' : 'ready', scenario,
      camera: { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), target: controls.target.toArray(),
        matrixWorld: camera.matrixWorld.toArray(), projectionMatrix: camera.projectionMatrix.toArray(), zoom: camera.zoom, fov: camera.fov, aspect: camera.aspect },
      objects: [...shapeObjects.values()].map(snapshotObject),
      markers: [...visualObjects.values()].filter(object => object.isPoints).map(object => ({ id: object.name, visible: object.visible,
        position: coordinates(object.position), worldPosition: coordinates(object.getWorldPosition(new THREE.Vector3())), matrixWorld: object.matrixWorld.toArray() })),
      renderer: { instanceId, width: canvas.width, height: canvas.height, pixelRatio: renderer.getPixelRatio(), contextLost: context.isContextLost(),
        render: { ...renderer.info.render }, memory: { ...renderer.info.memory }, preserveDrawingBuffer: renderer.getContextAttributes()?.preserveDrawingBuffer },
      labels: [...labels].map(([id, item]) => ({ id, text: item.node.textContent, hidden: item.node.hidden })),
      lifecycle: { ...lifecycle, live: instances.size },
    });
  }
  function dispose() {
    if (disposed) return;
    disposed = true; observer.disconnect();
    canvas.removeEventListener('webglcontextlost', contextLost); canvas.removeEventListener('keydown', keydown);
    toolbar.removeEventListener('click', click); controls.removeEventListener('change', render); controls.dispose();
    clearObjects(); renderer.dispose(); renderer.forceContextLoss(); host.replaceChildren();
    host.dataset.renderState = 'idle'; instances.delete(api); lifecycle.disposed++;
  }
  api = Object.freeze({ update, resize, resetView, dispose, snapshot }); instances.add(api);
  return api;
}
Object.defineProperty(globalThis, 'SensaParameterGeometry3D', {
  value: Object.freeze({ create, snapshot: () => [...instances].at(-1)?.snapshot() || freeze({ status: 'idle', lifecycle: { ...lifecycle, live: instances.size } }) }),
  writable: false,
});
