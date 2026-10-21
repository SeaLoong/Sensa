/* Offline interactive SVG/Three.js views. No network, devices, animation loop or HTML injection.
 * 离线交互 SVG/Three.js：无网络、设备、自动动画或 HTML 注入。 */
(function () {
  'use strict';
  const Model = window.SensaParameterGeometry;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);
  const dictionary = {
    brand: ['参数图解', 'Parameter geometry'], modelTag: ['交互原理演示', 'Interactive guide'],
    language: ['语言', 'Language'], title: ['移动目标，了解何时能够检测', 'Move the target to see where detection works'],
    intro: ['先选择要了解的功能，再拖动橙色目标。图中展示检测范围和参数如何变化；所有读数都是演示，不会控制设备。', 'Choose a feature, then drag the orange target. See its detection range and how values change. All values are simulated; no devices are controlled.'],
    scenario: ['测量场景', 'Scenario'], projection: ['投影', 'Projection'], xz: ['XZ 平面投影', 'XZ projection'], iso: ['立体投影', 'Orthographic 3D'],
    orbit: ['可旋转 3D', 'Orbit 3D'], license: ['Three.js MIT 许可', 'Three.js MIT license'],
    fallback: ['本机 3D 不可用，已切换立体 SVG；读数与 XYZ 滑条仍可使用。', '3D is unavailable here. Using orthographic SVG; values and XYZ sliders still work.'],
    orbitControls: ['拖动橙色目标移动；拖动空白处旋转，滚轮／双指缩放。', 'Drag the orange target to move it; drag empty space to orbit, wheel/pinch to zoom.'],
    dragPlane: ['拖动平面', 'Drag plane'], pathPrefix: ['参数前缀', 'Parameter prefix'],
    pathAssembly: ['将 * 替换为实例名；完整地址 = /avatar/parameters/ + 前缀 + /行名。', 'Replace * with the instance name. Full address = /avatar/parameters/ + prefix + /row name.'],
    reset: ['复位', 'Reset'], receivers: ['接收范围', 'Receivers'], senders: ['目标发出的检测范围', 'Target signal shapes'],
    reference: ['实体外形示意', 'Illustrative outlines'], dimensions: ['半径与尺寸', 'Radii and dimensions'], zoom: ['缩放', 'Zoom'],
    readout: ['参数读数', 'Parameter values'], simulated: ['几何模拟值', 'Simulated geometry'],
    rowHint: ['点击参数名可突出对应的检测形状。“可用值”表示通过本页条件检查后的演示结果；实际应用还需选择输入并启用输出。', 'Select a parameter to highlight its detection shapes. Usable values pass this guide’s checks; the app still needs an input and explicit output activation.'],
    parameter: ['参数', 'Parameter'], raw: ['原始值', 'Raw'], effective: ['可用值', 'Usable value'],
    grid: ['20 × 12 编码图块（边缘用于定位）', '20 × 12 encoded grid with edge markers'], controls: ['调整几何', 'Adjust geometry'],
    dragHint: ['拖动橙色操作点仅改变 X/Z，Y 由滑条控制。方向键：左右 Z、上下 X；Shift 加速。', 'Drag the orange handle in X/Z; use the Y slider for height. Arrow keys: left/right Z, up/down X; Shift moves faster.'],
    x: ['移动对象 · X', 'Moving object · X'], y: ['移动对象 · Y', 'Moving object · Y'], z: ['移动对象 · Z', 'Moving object · Z'],
    length: ['Plug 长度 L', 'Plug length L'], width: ['Plug 半径 W', 'Plug radius W'], depth: ['Socket 区域 D', 'Socket region D'],
    yaw: ['Plug 绕根旋转', 'Plug root rotation'], senderRadius: ['身体 Sender 半径', 'Body Sender radius'],
    zoneRadius: ['Touch Zone 半径', 'Touch Zone radius'], sample: ['活动计数 Sample（0 表示停止）', 'Activity counter Sample (0 means stopped)'],
    ageMs: ['距上次变化时间', 'Age since last change'], frame: ['编码序号 Frame', 'Encoded Frame'],
    valid: ['模拟收到有效样本', 'Simulate a valid sample'],
    coverage: ['可检测区域', 'Detection region'], simulation: ['模拟信号中断与停更', 'Simulate signal loss or a stalled source'],
    validHint: ['此项只改变本页演示：取消后模拟发送端报告无效数据；它不是应用中的发布或输出权限。', 'This only changes the demonstration. Clear it to simulate the source reporting invalid data; it does not grant publishing or device-output permission.'],
    formulaTitle: ['读图时记住', 'Reading the model'], meaningTitle: ['这些量不等价', 'Different quantities'],
    meaning: ['近接值不是 XYZ，根坐标不是姿态，编码分辨率不是实测精度。球／胶囊是 Contact；灰色 Socket／Plug 轮廓仅为示意，不是 Avatar 网格。', 'Proximity is not XYZ, a root position is not orientation, and encoding resolution is not measured accuracy. Spheres/capsules represent Contacts; gray Socket/Plug profiles are illustrations, not Avatar meshes.'],
    sourceNote: ['尺寸依据固定版本上游源码及 Sensa 契约，不推断动态缩放、多个 Sender 或真实客户端行为。', 'Dimensions follow pinned upstream sources and Sensa contracts, without inferring dynamic scale, multiple Senders or actual client behavior.'],
    dictionary: ['参数字典', 'Parameter dictionary'], ogbSources: ['OGB 几何与来源', 'OGB geometry and sources'],
    positioning: ['SPS 定位原理', 'SPS positioning'], offline: ['本地 Three.js · 离线可用', 'Local Three.js · Works offline'],
    'socket-modern': ['Socket · 现代 Root / Tip', 'Socket · Modern Root / Tip'],
    'socket-legacy': ['Socket · 旧近接与 Close', 'Socket · Legacy proximity / Close'],
    'plug-depth': ['Plug · PenOthers', 'Plug · PenOthers'],
    'socket-touch': ['Socket · Touch / Close', 'Socket · Touch / Close'],
    'plug-touch': ['Plug · Touch / Close', 'Plug · Touch / Close'],
    'socket-frot': ['Socket · FrotOthers', 'Socket · FrotOthers'],
    'plug-frot': ['Plug · Frot / Close', 'Plug · Frot / Close'],
    zone: ['独立 Touch Zone', 'Independent Touch Zone'],
    'sensa-sps': ['Sensa SPS · 四点定位', 'Sensa SPS · Four-point positioning'],
    shader: ['Shader · 从画面读取位置', 'Shader · Read position from an image'],
  };
  const scenes = {
    'socket-modern': {
      summary: ['两个 R=1 接收球同心重合；橙色根球 r=0.01，长度球 r=L 也位于根部。', 'Two concentric R=1 receivers overlap. The orange root sphere has r=0.01; the r=L length sphere is also root-centered.'],
      explanation: ['NewTip 不是尖端坐标。已知 L 的理想径向参考仅用于理解几何，不是 Sensa 已完成估长后的输出；倾角与横移仍有歧义。', 'NewTip is not a tip coordinate. The ideal radial reference uses known L; it is not Sensa output after learned-length estimation. Tilt and lateral offset remain ambiguous.'],
      formula: ['p = clamp(1 − max(0,d−r)/R)。两路未饱和时长度估计为 Tip−Root+0.01；理想参考为 clamp(1−d/L)。', 'p = clamp(1 − max(0,d−r)/R). When both channels are unsaturated, length estimate = Tip−Root+0.01; ideal reference = clamp(1−d/L).'],
    },
    'socket-legacy': {
      summary: ['近接球位于 z=−D、R=D；Close 胶囊中心 z=−D/2，r=D/2.5，高 D。', 'The proximity sphere is at z=−D with R=D; Close is a capsule at z=−D/2, r=D/2.5, height D.'],
      explanation: ['原始近接可能非零而 Close 仍关闭。门控后才是此模型可消费的标量，不是 XYZ 或准确插入百分比。', 'Raw proximity may be positive while Close is off. The gated result is a consumable scalar, not XYZ or an accurate insertion percentage.'],
      formula: ['近接按球心到 Sender 表面的距离计算；Close 按球／胶囊最近轴距判断，恰好相切不算开启。', 'Proximity uses receiver-center to Sender-surface distance; Close uses closest sphere/capsule axis distance, with exact tangency excluded.'],
    },
    'plug-depth': {
      summary: ['R=L 接收球随 Plug 根移动；Socket 根部小球 r=0.001 固定在原点。', 'The R=L receiver follows the Plug root; the Socket root sphere, r=0.001, stays at the origin.'],
      explanation: ['这是 Plug 侧的单近接值，Sensa 按原值使用；旋转灰色 Plug 不会让根部球形观测变成轴向深度。', 'This is the Plug-side single proximity value, consumed without universal inversion. Rotating the gray Plug does not turn a root-centered sphere into axial depth.'],
      formula: ['p = clamp(1 − max(0,d−0.001)/L)。灰色尖端只帮助理解朝向，不是本参数的测量点。', 'p = clamp(1 − max(0,d−0.001)/L). The gray tip illustrates direction; it is not this parameter’s measurement point.'],
    },
    'socket-touch': {
      summary: ['身体 Sender 进入 Socket 后方的近接球，并由同区域 Close 胶囊门控。', 'A body Sender enters the proximity sphere behind the Socket; a Close capsule gates that region.'],
      explanation: ['Touch 是近接强度，Close 是接近门控。这里模拟一个匹配的身体 Sender，不把它当作根点定位。', 'Touch is proximity intensity and Close is a presence gate. One matching body Sender is modeled, without root localization.'],
      formula: ['球：p=clamp(1−max(0,d−r)/R)。Close：轴距小于双方半径之和时为 1。', 'Sphere: p=clamp(1−max(0,d−r)/R). Close is 1 when axis distance is less than the sum of radii.'],
    },
    'plug-touch': {
      summary: ['e=min(W,0.08)；近接球 R=L+e，Close 胶囊 r=W+e、高 L+2e。', 'e=min(W,0.08): proximity R=L+e; Close capsule r=W+e, height L+2e.'],
      explanation: ['身体 Sender 的最近表面决定近接；只有同对象的 Close 开启，门控后 Touch 才非零。', 'The nearest body-Sender surface determines proximity. Effective Touch requires that same object’s Close gate.'],
      formula: ['胶囊高度包含端帽，轴段长=max(0,H−2r)；不能把整个高度都画成直轴段。', 'Capsule height includes both caps; axis length=max(0,H−2r). The entire height is not the straight segment.'],
    },
    'socket-frot': {
      summary: ['Socket 前方 z=0.05、R=0.1 的球感知另一 Socket 的 r=0.001 根球。', 'A sphere at z=0.05 with R=0.1 senses another Socket’s r=0.001 root sphere.'],
      explanation: ['Socket FrotOthers 不另设 Close 门控；这里读原始球形近接，不代表正在使用哪个 Plug。', 'Socket FrotOthers has no separate Close gate. It is spherical proximity, not identification of an active Plug.'],
      formula: ['p = clamp(1 − max(0,d−0.001)/0.1)。', 'p = clamp(1 − max(0,d−0.001)/0.1).'],
    },
    'plug-frot': {
      summary: ['近接球 R=L；Close 胶囊 r=W+0.08、高 L；Sender 也是带端帽的 Plug 包络。', 'Proximity R=L; Close capsule r=W+0.08, height L; the Sender is also a capped Plug envelope.'],
      explanation: ['原始 Frot 非零并不保证两个胶囊接近。模型用双方轴段的真实最近距离计算 Close；本示意双方共用 L/W。', 'Positive raw Frot does not prove the two capsules are close. Close uses their nearest axis-segment distance. This illustration shares L/W for both Plugs.'],
      formula: ['Close = [最近轴距 < r_receiver+r_sender]；有效值 = Close × 原始近接。', 'Close = [nearest axis distance < r_receiver+r_sender]; effective value = Close × raw proximity.'],
    },
    zone: {
      summary: ['独立球形 Touch Zone 直接发布匹配 Sender 的近接强度，不要求 Close。', 'An independent spherical Touch Zone publishes matching-Sender proximity directly, without Close.'],
      explanation: ['这是 VFH/Zone/Touch 的独立区域，不是 OGB 版本标志或 Socket 根位置。', 'This is an independent VFH/Zone/Touch region, not an OGB version flag or Socket root position.'],
      formula: ['区域 R 与身体 Sender 半径 r 可独立改变；所有 XYZ 都参与距离。', 'Zone R and body-Sender radius r vary independently; all XYZ components contribute to distance.'],
    },
    'sensa-sps': {
      summary: ['四个固定检测点各有 2 米接收半径；移动目标携带 1 毫米专用标记。绿色区域是四个检测点都能测量的位置。', 'Four fixed points each have a 2 m receiver radius. A 1 mm dedicated marker follows the target. Green shows positions all four points can measure.'],
      explanation: ['目标必须同时处于四个接收范围内，才能由四个距离求出位置。超出范围、贴近检测点导致读数饱和，或活动计数停止变化时，位置不可用。', 'The target must stay within all four receivers so four distances can determine its position. Leaving coverage, saturating a receiver at close range, or a stalled activity counter makes the position unavailable.'],
      formula: ['每路距离 dᵢ=2(1−Pᵢ)+0.001。绿色外形由四球共同覆盖并裁剪到坐标边界得到；检测点旁 3 毫米的饱和区不可用。图形边缘为采样近似，是否有效以读数为准。', 'Each distance is dᵢ=2(1−Pᵢ)+0.001. The green envelope is the four-sphere intersection clipped to coordinate limits, excluding 3 mm saturation regions. Its drawn edge is sampled; the numeric check determines validity.'],
    },
    shader: {
      summary: ['Shader 把目标相对 Avatar 根的位置写进画面，桌面工具再读取图块。绿色方框是可编码范围：中心各方向 2 米。', 'The Shader writes the target’s position relative to the avatar root into an image; the desktop tool reads the grid. The green box is the encodable range: 2 m from its center along each axis.'],
      explanation: ['边缘固定图案帮助找回轻微移动的图块；中间 16×8 位保存坐标等数据。固定像素本来就不随位置变化。校验失败或画面停更会停用位置；边缘标记不能消除渲染延迟。', 'Fixed edge patterns help reacquire a slightly shifted grid; the middle 16×8 bits hold coordinates and other data. Those marker pixels are intentionally constant. Failed checks or a stalled image invalidate the position. Markers cannot remove rendering latency.'],
      formula: ['q=round(clamp((p−center+2)/4)×65535)，每格步长约 0.061 毫米。这只是数字编码的分辨率，不是实测精度。超过绿色方框的坐标会失效。', 'q=round(clamp((p−center+2)/4)×65535), a step of about 0.061 mm. This is numeric encoding resolution, not measured accuracy. Coordinates outside the green box are invalid.'],
    },
  };
  // Keep this small classic-script resolver aligned with src/web/i18n.js; the guide also works from file://.
  // 与应用保持同一优先级；不引入额外资产或模块加载，使独立文件仍可离线打开。
  const LOCALE_STORAGE_KEY = 'sensa.locale';
  function normalizeLocale(value) {
    if (typeof value !== 'string') return null;
    const language = value.trim().replaceAll('_', '-').toLowerCase();
    if (/^zh(?:-[a-z0-9]{1,8})*$/.test(language)) return 'zh-CN';
    if (/^en(?:-[a-z0-9]{1,8})*$/.test(language)) return 'en-US';
    return null;
  }
  function initialLocale() {
    let requested, saved;
    const languages = [];
    try { requested = new URLSearchParams(location.search).get('lang'); } catch { /* Unavailable location. */ }
    try { saved = window.localStorage.getItem(LOCALE_STORAGE_KEY); } catch { /* Restricted file/private storage. */ }
    try { if (Array.isArray(navigator.languages)) languages.push(...navigator.languages); } catch { /* Unavailable preferences. */ }
    try { languages.push(navigator.language); } catch { /* Unavailable fallback preference. */ }
    return [requested, saved, ...languages].map(normalizeLocale).find(Boolean) || 'en-US';
  }
  function rememberLocale(next) {
    try { window.localStorage.setItem(LOCALE_STORAGE_KEY, next); } catch { /* In-memory choice still works. */ }
    try {
      const url = new URL(location.href);
      if (url.searchParams.has('lang')) { url.searchParams.set('lang', next); window.history.replaceState(window.history.state, '', url); }
    } catch { /* A restricted file URL/history does not prevent switching. */ }
  }
  let locale = initialLocale();
  let state = Model.defaultsFor($('scene').value);
  let result, projection, selected = '', dragging = null, annotationRatio = 1;
  let threeView = null, threeUnavailable = false;
  const text = pair => Array.isArray(pair) ? pair[locale === 'en-US' ? 1 : 0] : dictionary[pair]?.[locale === 'en-US' ? 1 : 0] ?? pair;
  const fmt = (value, digits = 3) => Number.isFinite(value) ? (Object.is(Number(value.toFixed(digits)), -0) ? 0 : value).toFixed(digits) : '—';
  const spatial = () => ['sensa-sps', 'shader'].includes(state.scenario);
  const units = () => spatial() ? text(['本地单位', 'local units']) : 'm';
  const anchorIndex = id => { const match = /^receiver-P([0-3])$/.exec(id); return match ? Number(match[1]) : null; };
  function tintAnchor(node, index) {
    if (index === null) return node;
    const color = Model.anchorColors[index];
    node.classList.add('anchor-colored'); node.style.setProperty('--anchor-color', color);
    node.dataset.anchorIndex = String(index); node.dataset.anchorColor = color;
    return node;
  }
  const svg = (tag, attrs = {}, children = []) => {
    const element = document.createElementNS(NS, tag);
    for (const [name, value] of Object.entries(attrs)) if (value !== undefined) element.setAttribute(name, String(value));
    for (const child of children) element.append(child);
    return element;
  };
  const label = (x, y, value, attrs = {}) => {
    const dimension = attrs.class === 'dimension-label', axis = attrs.class === 'grid-axis-label';
    const size = Math.max(axis ? 14 : dimension ? 15 : 16, (axis ? 10 : dimension ? 11 : 12) * annotationRatio);
    const node = svg('text', { x, y, 'font-size': size, ...attrs }); node.textContent = value; return node;
  };
  function corners(box) {
    return Array.from({ length: 8 }, (_, i) => ({ x: box.center.x + (i & 1 ? .5 : -.5) * box.size.x,
      y: box.center.y + (i & 2 ? .5 : -.5) * box.size.y, z: box.center.z + (i & 4 ? .5 : -.5) * box.size.z }));
  }
  function projector() {
    const iso = $('projection').value === 'iso';
    const rows = iso ? { ux: -Math.SQRT1_2, uy: 0, uz: Math.SQRT1_2, vx: 1 / Math.sqrt(6), vy: -Math.sqrt(2 / 3), vz: 1 / Math.sqrt(6) }
      : { ux: 0, uy: 0, uz: 1, vx: -1, vy: 0, vz: 0 };
    const raw = p => ({ x: rows.ux * p.x + rows.uy * p.y + rows.uz * p.z, y: rows.vx * p.x + rows.vy * p.y + rows.vz * p.z });
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    const add = (p, radius = 0) => { const q = raw(p); left = Math.min(left, q.x - radius); right = Math.max(right, q.x + radius); top = Math.min(top, q.y - radius); bottom = Math.max(bottom, q.y + radius); };
    for (const shape of result.shapes) {
      if (shape.type === 'box') corners(shape).forEach(p => add(p));
      else if (!spatial()) { add(shape.a, shape.radius); add(shape.b, shape.radius); }
    }
    for (const body of result.illustrations) for (const point of body.profile) {
      add({ x: body.root.x + body.axis.x * point.t * body.length,
        y: body.root.y + body.axis.y * point.t * body.length,
        z: body.root.z + body.axis.z * point.t * body.length }, point.r * body.radius);
    }
    Object.values(result.points).forEach(p => add(p, .025));
    const width = Math.max(right - left, spatial() ? 3 : .4), height = Math.max(bottom - top, spatial() ? 3 : .4);
    const scale = Math.min(780 / width, 400 / height) * Number($('zoom').value);
    const centerU = (left + right) / 2, centerV = (top + bottom) / 2;
    return { ...rows, scale, centerU, centerV, iso,
      p: p => { const q = raw(p); return { x: 480 + (q.x - centerU) * scale, y: 280 + (q.y - centerV) * scale }; },
      inverse: (x, y, heightValue) => {
        const u = (x - 480) / scale + centerU - rows.uy * heightValue;
        const v = (y - 280) / scale + centerV - rows.vy * heightValue;
        const det = rows.ux * rows.vz - rows.uz * rows.vx;
        return { x: (u * rows.vz - rows.uz * v) / det, z: (rows.ux * v - u * rows.vx) / det };
      } };
  }
  function drawShape(shape, active) {
    const group = svg('g', { 'data-shape-id': shape.id, 'data-shape-type': shape.type,
      'data-radius': shape.radius, 'data-height': shape.height, 'data-effective-height': shape.effectiveHeight,
      'data-world-x': shape.center.x, 'data-world-y': shape.center.y, 'data-world-z': shape.center.z });
    const highlight = selected && active ? ' active-shape' : selected && !active ? ' inactive-shape' : '';
    const index = anchorIndex(shape.id);
    tintAnchor(group, index);
    const attrs = { class: 'shape ' + shape.role + highlight + (index === null ? '' : ' anchor-colored') };
    const tooltip = svg('title'); tooltip.textContent = shape.id + (shape.radius ? ' · R=' + fmt(shape.radius) + ' ' + units() : ''); group.append(tooltip);
    if (shape.type === 'sphere') {
      const p = projection.p(shape.center);
      group.append(svg('circle', { ...attrs, cx: p.x, cy: p.y, r: shape.radius * projection.scale }));
    } else if (shape.type === 'capsule') {
      const a = projection.p(shape.a), b = projection.p(shape.b), r = shape.radius * projection.scale;
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length < .000001) group.append(svg('circle', { ...attrs, cx: a.x, cy: a.y, r }));
      else {
        const nx = -(b.y - a.y) / length * r, ny = (b.x - a.x) / length * r;
        const ex = (b.x - a.x) / length * r, ey = (b.y - a.y) / length * r;
        // Explicit quarter-circle extrema avoid near-diameter arc center cancellation.
        // 显式经过四分之一圆极点，避免直径端点解圆心时的消减误差。
        const d = 'M ' + (a.x + nx) + ' ' + (a.y + ny) + ' L ' + (b.x + nx) + ' ' + (b.y + ny)
          + ' A ' + r + ' ' + r + ' 0 0 0 ' + (b.x + ex) + ' ' + (b.y + ey)
          + ' A ' + r + ' ' + r + ' 0 0 0 ' + (b.x - nx) + ' ' + (b.y - ny) + ' L ' + (a.x - nx) + ' ' + (a.y - ny)
          + ' A ' + r + ' ' + r + ' 0 0 0 ' + (a.x - ex) + ' ' + (a.y - ey)
          + ' A ' + r + ' ' + r + ' 0 0 0 ' + (a.x + nx) + ' ' + (a.y + ny) + ' Z';
        group.append(svg('path', { ...attrs, d }));
      }
    } else {
      const vertices = corners(shape).map(projection.p);
      vertices.forEach((a, i) => [1, 2, 4].forEach(bit => {
        if (!(i & bit)) { const b = vertices[i | bit]; group.append(svg('line', { class: 'box-edge', x1: a.x, y1: a.y, x2: b.x, y2: b.y })); }
      }));
    }
    return group;
  }
  function drawCoverage(layer) {
    if (!result.coverage || !$('show-coverage').checked) return;
    const coverage = result.coverage;
    const path = coverage.slice.map((point, index) => {
      const p = projection.p(point); return (index ? 'L ' : 'M ') + p.x + ' ' + p.y;
    }).join(' ') + ' Z';
    if (coverage.slice.length) layer.append(svg('path', { class: 'coverage-region', d: path,
      'data-coverage-kind': coverage.kind, 'data-slice-y': coverage.sliceY, 'fill-rule': 'evenodd' }));
    for (const hole of coverage.holes) {
      const p = projection.p(hole.center);
      layer.append(svg('circle', { class: 'coverage-exclusion', cx: p.x, cy: p.y, r: hole.radius * projection.scale }));
    }
  }
  function references(layer, annotations) {
    if (!$('show-reference').checked) return;
    const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
    const normalize = value => { const size = Math.hypot(value.x, value.y, value.z) || 1; return { x: value.x / size, y: value.y / size, z: value.z / size }; };
    const viewNormal = cross({ x: projection.ux, y: projection.uy, z: projection.uz }, { x: projection.vx, y: projection.vy, z: projection.vz });
    const path = points => points.map((point, i) => { const p = projection.p(point); return (i ? 'L ' : 'M ') + p.x + ' ' + p.y; }).join(' ') + ' Z';
    for (const body of result.illustrations) {
      const axis = normalize(body.axis);
      let radial = cross(axis, viewNormal);
      if (Math.hypot(radial.x, radial.y, radial.z) < 1e-8) radial = cross(axis, Math.abs(axis.y) < .9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 });
      radial = normalize(radial);
      const other = normalize(cross(axis, radial));
      const point = (t, r, angle = 0) => ({
        x: body.root.x + axis.x * t * body.length + (radial.x * Math.cos(angle) + other.x * Math.sin(angle)) * r * body.radius,
        y: body.root.y + axis.y * t * body.length + (radial.y * Math.cos(angle) + other.y * Math.sin(angle)) * r * body.radius,
        z: body.root.z + axis.z * t * body.length + (radial.z * Math.cos(angle) + other.z * Math.sin(angle)) * r * body.radius,
      });
      const group = svg('g', { 'data-illustration-id': body.id, 'data-illustration-kind': body.kind,
        'data-length': body.length, 'data-radius': body.radius });
      const side = sign => body.profile.map(sample => point(sample.t, sample.r * sign));
      if (body.kind === 'socket') {
        // Mirrored closed wall sections keep the cavity open; rim circles project as ellipses.
        // 两侧闭合壁截面保留孔洞；开口圆按当前视角投影为椭圆。
        for (const sign of [1, -1]) group.append(svg('path', { class: 'reference reference-socket', d: path(side(sign)) }));
        const mouthIndex = body.profile.reduce((best, sample, i, profile) => sample.t > profile[best].t ? i : best, 0);
        for (const sample of [body.profile[mouthIndex], body.profile[Math.min(mouthIndex + 1, body.profile.length - 1)]]) {
          const ring = Array.from({ length: 49 }, (_, i) => point(sample.t, sample.r, i * Math.PI / 24));
          group.append(svg('path', { class: 'reference-rim', d: path(ring) }));
        }
        const p = projection.p(body.root);
        annotations.append(label(p.x, p.y - Math.max(40, 36 * annotationRatio), 'Socket', { 'text-anchor': 'middle' }));
      } else {
        group.append(svg('path', { class: 'reference reference-plug', d: path([...side(1), ...side(-1).reverse()]) }));
        const p = projection.p(body.root), q = projection.p(point(1, 0));
        annotations.append(label(p.x + Math.max(10, 12 * annotationRatio), p.y - Math.max(19, 16 * annotationRatio), 'Root'),
          label(q.x, q.y + Math.max(28, 24 * annotationRatio), 'Tip', { 'text-anchor': 'middle' }));
      }
      layer.append(group);
    }
  }
  function draw() {
    projection = dragging?.projection || projector();
    annotationRatio = 960 / Math.max($('diagram').getBoundingClientRect().width, 1);
    const title = svg('title', { id: 'diagram-title' }); title.textContent = text(state.scenario);
    const desc = svg('desc', { id: 'diagram-description' }); desc.textContent = text(scenes[state.scenario].summary) + ' ' + text('dragHint');
    const layer = svg('g'), annotations = svg('g', { 'pointer-events': 'none' }), handles = svg('g');
    $('diagram').replaceChildren(title, desc, layer, annotations, handles);
    const center = result.points.frameCenter || { x: 0, y: 0, z: 0 };
    const origin = projection.p(center);
    for (const [axis, vector] of [['Z', { x: 0, y: 0, z: 1 }], ['X', { x: 1, y: 0, z: 0 }], ...(projection.iso ? [['Y', { x: 0, y: 1, z: 0 }]] : [])]) {
      const p = projection.p({ x: center.x + vector.x * (spatial() ? 1 : .15), y: center.y + vector.y * (spatial() ? 1 : .15), z: center.z + vector.z * (spatial() ? 1 : .15) });
      layer.append(svg('line', { class: 'axis', x1: origin.x, y1: origin.y, x2: p.x, y2: p.y }));
      const distance = Math.hypot(p.x - origin.x, p.y - origin.y) || 1;
      const ux = (p.x - origin.x) / distance, uy = (p.y - origin.y) / distance;
      const offset = axis === 'X' ? { along: -4, side: 12 } : axis === 'Z' ? { along: 18, side: 18 } : { along: 8, side: 0 };
      const dx = ux * offset.along - uy * offset.side, dy = uy * offset.along + ux * offset.side + (axis === 'Y' ? 3 : 0);
      annotations.append(label(p.x + dx * annotationRatio, p.y + dy * annotationRatio, '+' + axis,
        { class: 'grid-axis-label', 'text-anchor': dx > .2 ? 'start' : dx < -.2 ? 'end' : 'middle' }));
    }
    drawCoverage(layer);
    references(layer, annotations);
    const field = result.values.find(v => v.name === selected);
    for (const shape of result.shapes) {
      if (shape.role === 'receiver' && !$('show-receivers').checked || shape.role === 'sender' && !$('show-senders').checked) continue;
      const active = shape.id === field?.receiverId || shape.id === field?.senderId;
      layer.append(drawShape(shape, active));
      if (shape.id.startsWith('receiver-P')) {
        const p = projection.p(shape.center), i = Number(shape.id.slice(-1));
        layer.append(tintAnchor(svg('circle', { class: 'center', cx: p.x, cy: p.y, r: 4 }), i));
        const dx = Math.max(14, 11 * annotationRatio), dy = i < 2 ? Math.max(24, 20 * annotationRatio) : -Math.max(15, 12 * annotationRatio);
        annotations.append(tintAnchor(label(p.x + (i === 0 || i === 2 ? -dx : dx), p.y + dy, 'P' + i,
          { class: 'anchor-label', 'text-anchor': i === 0 || i === 2 ? 'end' : 'start' }), i));
      }
      if ($('show-dimensions').checked && active && shape.radius) {
        const p = projection.p(shape.center), direction = shape.role === 'sender' ? -1 : 1, end = p.x + direction * shape.radius * projection.scale;
        layer.append(tintAnchor(svg('line', { class: 'dimension', x1: p.x, y1: p.y, x2: end, y2: p.y }), anchorIndex(shape.id)));
        const x = Math.max(36, 12 * annotationRatio), y = shape.role === 'receiver' ? Math.max(30, 18 * annotationRatio) : Math.max(58, 38 * annotationRatio);
        const name = shape.role === 'receiver' ? text(['接收器', 'Receiver']) : 'Sender';
        const size = name + ' · R ' + fmt(shape.radius) + (shape.type === 'capsule' ? ' · H ' + fmt(shape.effectiveHeight) + text(['（含帽）', ' incl. caps']) : '');
        annotations.append(tintAnchor(label(x, y, size, { class: 'dimension-label' }), anchorIndex(shape.id)));
        if (shape.type === 'capsule') {
          const a = projection.p({ x: shape.a.x - shape.axis.x * shape.radius, y: shape.a.y - shape.axis.y * shape.radius, z: shape.a.z - shape.axis.z * shape.radius });
          const b = projection.p({ x: shape.b.x + shape.axis.x * shape.radius, y: shape.b.y + shape.axis.y * shape.radius, z: shape.b.z + shape.axis.z * shape.radius });
          layer.append(svg('line', { class: 'dimension', x1: a.x, y1: a.y, x2: b.x, y2: b.y }));

        }
      }
    }
    const p = projection.p(result.points.movingRoot);
    const ratio = annotationRatio;
    const moving = svg('g', { id: 'moving-root', tabindex: 0, role: 'group',
      'aria-label': text(['移动根点', 'Move root']) + ': X ' + fmt(state.x) + ', Y ' + fmt(state.y) + ', Z ' + fmt(state.z),
      'aria-describedby': 'projection-note', 'aria-roledescription': text(['二维移动控制', 'Two-dimensional movement control']),
      'data-x': state.x, 'data-y': state.y, 'data-z': state.z });
    moving.append(svg('circle', { class: 'moving-hit', cx: p.x, cy: p.y, r: 14 * ratio }),
      svg('circle', { class: 'moving', cx: p.x, cy: p.y, r: 5 * ratio }));
    handles.append(moving);
    $('projection-note').textContent = text(projection.iso
      ? ['正交立体投影；球的投影半径保持同一比例。', 'Orthographic 3D projection; spheres retain the same radius scale.']
      : spatial() ? ['接收球轮廓是 XZ 投影；绿色区域为所选 Y 高度的切片，Y 仍参与全部距离计算。', 'Receiver outlines are XZ projections; green is a slice at the selected Y. Values use all XYZ components.'] : ['XZ 投影，不是 Y 切片；Y 仍参与全部距离计算。', 'XZ projection, not a Y slice; Y still contributes to every distance.'])
      + ' ' + text(['橙色操作柄不是 Sender 半径；灰色外形仅为示意。单位：', 'The orange handle is not the Sender radius; gray outlines are illustrative. Units: ']) + units()
      + (state.scenario === 'sensa-sps' ? ' ' + text(['绿色展示当前 Y 高度的可测切片；彩色接收球轮廓是投影。', 'Green shows the measurable slice at the selected Y; colored receiver outlines are projections.']) : '')
      + (!spatial() ? ' ' + text(['本场景 Socket +Z 向外，Plug 在 yaw=0 时朝 −Z；这不是作者 Plug 原生 +Z 的旋转定义。', 'Here Socket +Z points outward and yaw=0 aims the Plug along −Z; this is not the authored Plug’s native +Z rotation definition.']) : '');
  }
  function readouts() {
    $('values').replaceChildren();
    for (const value of result.values) {
      const row = document.createElement('tr'); row.dataset.name = value.name; row.classList.toggle('selected', selected === value.name);
      if (value.emitted === false) row.title = text(['未发送；仅展示编码计算', 'Not sent; encoding computation only']);
      const name = document.createElement('td'), button = document.createElement('button');
      button.type = 'button'; button.setAttribute('aria-pressed', String(selected === value.name));
      button.title = '/avatar/parameters/' + value.path; button.setAttribute('aria-describedby', 'path-assembly');
      if (state.scenario === 'sensa-sps' && /^P[0-3]$/.test(value.name)) {
        const index = Number(value.name[1]), swatch = document.createElement('span');
        swatch.className = 'anchor-swatch'; swatch.setAttribute('aria-hidden', 'true');
        tintAnchor(row, index); button.append(tintAnchor(swatch, index));
      }
      button.append(document.createTextNode(value.name));
      button.addEventListener('click', () => { selected = value.name; render(); $('values').querySelectorAll('button').forEach(b => { if (b.textContent === value.name) b.focus({ preventScroll: true }); }); });
      name.append(button); row.append(name);
      for (const column of ['raw', 'effective']) {
        const cell = document.createElement('td'); cell.dataset.column = column;
        cell.dataset.value = value[column] === null || value[column] === undefined ? '' : String(value[column]);
        cell.className = 'number'; cell.textContent = typeof value[column] === 'number' ? fmt(value[column], value.name === 'Sample' ? 5 : ['counter', 'constant'].includes(value.type) ? 0 : 4) : '—';
        row.append(cell);
      }
      $('values').append(row);
    }
    const examplePrefix = result.values[0]?.path.slice(0, result.values[0].path.lastIndexOf('/')) || '';
    $('path-prefix').textContent = examplePrefix.slice(0, examplePrefix.lastIndexOf('/')) + '/*';
    $('path-assembly').textContent = text('pathAssembly');
    const list = [], add = (name, value) => list.push([text(name), value]);
    const m = result.metrics, field = result.values.find(v => v.name === selected);
    if (field?.axisDistance !== undefined) add(['最近轴距（完整 XYZ）', 'Nearest axis distance (full XYZ)'], fmt(field.axisDistance) + ' ' + units());
    if (m.centerDistance !== undefined) {
      add(['根中心距离', 'Root-center distance'], fmt(m.centerDistance) + ' m');
      add(['未饱和估长', 'Unsaturated length estimate'], m.unsaturatedLengthEstimate === null ? '—' : fmt(m.unsaturatedLengthEstimate) + ' m');
      add(['已知 L 的理想径向参考', 'Ideal radial reference with known L'], fmt(m.idealKnownLengthRadialRatio * 100, 1) + '%');
    }
    if (state.scenario === 'sensa-sps') {
      add(['当前位置在检测范围内', 'Target inside detection region'], text(result.coverage.containsTarget ? ['是', 'Yes'] : ['否', 'No']));
      add(['中心周围保守覆盖半径', 'Conservative coverage around center'], fmt(m.conservativeCoverageRadius) + ' ' + units());
      add(['拟合 XYZ', 'Fitted XYZ'], m.position ? ['x', 'y', 'z'].map(k => fmt(m.position[k])).join(' / ') : '—');
      add(['拟合残差（非精度）', 'Fit residual (not accuracy)'], fmt(m.residual, 6));
      add(['Sample 内容年龄 / 上限', 'Sample content age / limit'], state.ageMs + ' / ' + m.sampleAgeLimitMs + ' ms');
      add(['活动 / 几何拟合', 'Activity / geometry fit'], String(m.active) + ' / ' + String(m.fitValid));
      for (const shape of result.shapes.filter(s => s.id.startsWith('receiver-P'))) add(shape.id.slice(-2), ['x', 'y', 'z'].map(k => fmt(shape.center[k], 1)).join(' / '));
    }
    if (state.scenario === 'shader') {
      add(['输入 XYZ', 'Input XYZ'], ['x', 'y', 'z'].map(k => fmt(state[k])).join(' / '));
      add(['16 位量化 X / Y / Z', '16-bit quantized X / Y / Z'], ['x', 'y', 'z'].map(k => m.encoded[k]).join(' / '));
      add(['解码 XYZ', 'Decoded XYZ'], ['x', 'y', 'z'].map(k => fmt(m.decodedPosition[k], 5)).join(' / '));
      add(['编码量化误差（非精度）', 'Quantization error (not accuracy)'], fmt(m.quantError.length, 7) + ' ' + units());
      add(['桌面接收年龄上限', 'Desktop intake age ceiling'], m.frameAgeLimitMs + ' ms');
      add(['实际桥默认冻结门限', 'Actual bridge default freeze threshold'], m.bridgeFreezeThresholdMs + ' ms');
      if (state.ageMs > m.bridgeFreezeThresholdMs) add(['实际桥会先行停用', 'Actual bridge would already stop'], 'Valid=0');
    }
    $('metrics').replaceChildren();
    for (const [name, value] of list) {
      const row = document.createElement('div'), dt = document.createElement('span'), dd = document.createElement('strong');
      row.className = 'metric';
      if (state.scenario === 'sensa-sps' && /^P[0-3]$/.test(name)) tintAnchor(row, Number(name[1]));
      dt.textContent = name; dd.textContent = value; row.append(dt, dd); $('metrics').append(row);
    }
    const ownValidity = spatial();
    $('validity').textContent = ownValidity ? state.scenario === 'shader' && state.ageMs > m.bridgeFreezeThresholdMs
      ? text(['桥默认已冻结', 'Bridge default is frozen'])
      : text(m.valid ? ['桌面模型有效', 'Desktop model valid'] : ['模型无效', 'Model invalid'])
      : text(['单 Sender 几何', 'One-Sender geometry']);
    $('validity').dataset.tone = ownValidity && (!m.valid || state.scenario === 'shader' && state.ageMs > m.bridgeFreezeThresholdMs) ? 'bad' : 'good';
    if (ownValidity) $('validity').dataset.valid = String(m.valid); else delete $('validity').dataset.valid;
    $('explanation').textContent = text(scenes[state.scenario].explanation)
      + (state.scenario === 'shader' && !m.valid ? ' ' + text(['失效只发送 Valid=0，表中其余原始值仅为计算预览。', 'Invalidation sends only Valid=0; other raw values here are calculation previews.']) : '');
    $('formula').textContent = text(scenes[state.scenario].formula);
    $('assumptions').textContent = result.assumptions.map(a => locale === 'en-US' ? a.en : a.zh).join(' ');
    $('encoding').hidden = state.scenario !== 'shader';
    if (state.scenario === 'shader') {
      $('bit-grid').replaceChildren();
      for (let column = 0; column < 20; column++) for (let screenRow = 0; screenRow < 12; screenRow++) {
        const row = 11 - screenRow;
        const bit = Model.encodedBit(result.metrics.bytes, column, row);
        const edge = column < 2 || column >= 18 || row < 2 || row >= 10;
        $('bit-grid').append(svg('rect', { x: column * 16, y: screenRow * 16, width: 16, height: 16,
          fill: bit ? '#fff' : edge ? '#075c50' : '#182131', 'data-byte': edge ? undefined : column - 2,
          'data-bit': edge ? undefined : row - 2, 'data-edge': String(edge), 'data-value': bit }));
      }
      const bytes = result.metrics.bytes; $('crc').textContent = 'CRC ' + (bytes[14] | bytes[15] << 8).toString(16).toUpperCase().padStart(4, '0') + ' · ID 42';
    }
  }
  function controls() {
    const allowed = new Set(['x', 'y', 'z']);
    if (['socket-modern', 'socket-legacy', 'plug-depth', 'plug-touch', 'plug-frot'].includes(state.scenario)) allowed.add('L');
    if (['plug-touch', 'plug-frot'].includes(state.scenario)) allowed.add('W');
    if (['socket-legacy', 'socket-touch'].includes(state.scenario)) allowed.add('D');
    if (['socket-modern', 'socket-legacy', 'plug-depth', 'plug-frot'].includes(state.scenario)) allowed.add('yaw');
    if (['socket-touch', 'plug-touch', 'zone'].includes(state.scenario)) allowed.add('senderRadius');
    if (state.scenario === 'zone') allowed.add('zoneRadius');
    if (spatial()) ['ageMs', 'valid'].forEach(k => allowed.add(k));
    $('signal-simulation').hidden = !spatial();
    $('coverage-legend').hidden = !spatial();
    if (state.scenario === 'sensa-sps') allowed.add('sample');
    if (state.scenario === 'shader') allowed.add('frame');
    for (const holder of document.querySelectorAll('[data-control]')) {
      const key = holder.dataset.control, input = $('control-' + key); holder.hidden = !allowed.has(key);
      if (['x', 'y', 'z'].includes(key)) {
        input.min = spatial() ? key === 'y' ? '-1.3' : '-2.3' : key === 'z' ? '-0.4' : '-0.6';
        input.max = spatial() ? key === 'y' ? '3.3' : '2.3' : key === 'z' ? '1.2' : '0.6';
      }
      if (key === 'valid') input.checked = state.valid;
      else {
        input.value = key === 'sample' ? state.sample * 32 : state[key];
        const output = holder.querySelector('output');
        output.textContent = key === 'sample' ? Math.round(state.sample * 32) + '/32'
          : key === 'ageMs' ? state[key] + ' ms' : key === 'frame' ? String(state[key])
          : key === 'yaw' ? state[key] + '°' : fmt(state[key]) + (spatial() ? '' : ' ' + units());
      }
    }
    const receiverKey = $('receiver-key'); receiverKey.replaceChildren();
    receiverKey.classList.toggle('is-multiple', state.scenario === 'sensa-sps');
    if (state.scenario === 'sensa-sps') Model.anchorColors.forEach((_, index) => {
      const swatch = document.createElement('span'); swatch.className = 'anchor-key-color';
      receiverKey.append(tintAnchor(swatch, index));
    });
    $('unit-note').textContent = spatial()
      ? text(['坐标相对 Avatar 根：X 左右、Y 高度、Z 前后；在作者缩放为 1 时单位对应米。绿色是检测范围，灰色框是允许的坐标边界。', 'Coordinates relative to the avatar root: X side-to-side, Y height, Z front-to-back. Units correspond to metres at authored scale 1. Green is detection coverage; the gray box is the coordinate limit.'])
      : text(['米制示意，作者缩放假定为 1；胶囊 H 含端帽，尺寸以模型读数为准。', 'Metre illustration with authored scale assumed one. Capsule H includes caps; use model dimensions.']);
  }
  function localize() {
    document.documentElement.lang = locale; document.title = 'Sensa · ' + text('brand'); $('locale').value = locale;
    for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = text(node.dataset.i18n);
    $('scene-title').textContent = text(state.scenario); $('scene-summary').textContent = text(scenes[state.scenario].summary);
    const suffix = locale === 'en-US' ? '.en.md' : '.md', hosted = /^https?:$/.test(location.protocol);
    const siteRoot = document.querySelector('meta[name="sensa-site-root"]')?.content;
    for (const [selector, path] of [['.brand', 'osc-parameters'], ['#reference-link', 'osc-parameters'], ['#ogb-link', 'ogb-compatibility'], ['#position-link', 'positioning']]) {
      document.querySelector(selector).href = siteRoot
        ? new URL((locale === 'zh-CN' ? 'zh-CN' : 'en') + '/docs/' + path + '.html', new URL(siteRoot, location.href)).href
        : (hosted ? 'https://github.com/SeaLoong/Sensa/blob/main/docs/' : '') + path + suffix;
    }
  }
  function disposeThree() { threeView?.dispose(); threeView = null; }
  function fallbackThree() {
    threeUnavailable = true; disposeThree(); $('three-scene').dataset.renderState = 'fallback'; $('projection').value = 'iso'; drawView();
  }
  function drawView() {
    const orbitOption = $('projection').querySelector('[value="orbit"]');
    orbitOption.hidden = false; orbitOption.disabled = threeUnavailable;
    const orbit = $('projection').value === 'orbit' && !threeUnavailable;
    document.querySelector('.scene-toolbar').classList.toggle('is-orbit', orbit);
    $('three-scene').hidden = !orbit; $('diagram').toggleAttribute('hidden', orbit);
    document.querySelector('.zoom-label').hidden = orbit;
    $('drag-plane-control').hidden = !orbit; $('drag-plane').disabled = !orbit;
    $('three-fallback').hidden = !threeUnavailable;
    $('three-fallback').textContent = text('fallback');
    if (orbit) {
      try {
        if (!threeView) threeView = window.SensaParameterGeometry3D.create($('three-scene'));
        threeView.update({ result, state, locale, selected, onMove: move, dragPlane: $('drag-plane').value, visibility: {
          receivers: $('show-receivers').checked, senders: $('show-senders').checked,
          reference: $('show-reference').checked, coverage: $('show-coverage').checked, dimensions: $('show-dimensions').checked,
        } });
        if (!threeView) return;
        projection = null;
        $('projection-note').textContent = text(['可旋转 3D，标签保持屏幕字号。橙色拖动目标被放大显示，不代表 Sender 半径。单位：', 'Orbit 3D with screen-sized labels. The enlarged orange drag target is not the Sender radius. Units: ']) + units() + '. '
          + (state.scenario === 'sensa-sps' ? text(['绿色外形是四球共同可测区域；检测点附近的微小饱和区除外。', 'The green envelope is the shared measurable region, excluding tiny saturation regions near the anchors.'])
            : state.scenario === 'shader' ? text(['绿色方框是可编码范围，不代表捕获相机看到的空间；输入点与解码点可能重叠。', 'The green box is the encoding range, not the capture camera’s field of view. Input and decoded points may overlap.'])
              : text(['作者缩放假定为 1；灰色外形是示意，不是 Avatar 网格。', 'Authored scale is assumed one; gray profiles illustrate shapes, not Avatar meshes.']));
      } catch { fallbackThree(); return; }
    } else { disposeThree(); draw(); }
    for (const hint of document.querySelectorAll('[data-i18n="dragHint"]')) hint.textContent = text(orbit ? 'orbitControls' : 'dragHint');
  }
  function render() {
    result = Model.evaluate(state);
    if (!result.values.some(v => v.name === selected)) selected = result.values[0]?.name || '';
    localize(); controls(); readouts(); drawView();
  }
  $('three-scene').addEventListener('sensa-3d-unavailable', fallbackThree);
  $('scene').addEventListener('change', () => {
    dragging = null; state = Model.defaultsFor($('scene').value); selected = '';
    $('projection').value = threeUnavailable ? 'iso' : 'orbit'; render();
  });
  $('locale').addEventListener('change', () => { locale = normalizeLocale($('locale').value) || 'en-US'; rememberLocale(locale); render(); });
  $('projection').addEventListener('change', () => { dragging = null; render(); });
  $('drag-plane').addEventListener('change', () => { dragging = null; render(); });
  $('reset').addEventListener('click', () => { state = Model.defaultsFor(state.scenario); selected = ''; $('zoom').value = '1'; render(); threeView?.resetView(); });
  for (const name of ['show-receivers', 'show-senders', 'show-reference', 'show-coverage', 'show-dimensions', 'zoom']) $(name).addEventListener('input', render);
  for (const holder of document.querySelectorAll('[data-control]')) {
    const key = holder.dataset.control, input = $('control-' + key);
    input.addEventListener('input', () => { state[key] = key === 'valid' ? input.checked : Number(input.value) / (key === 'sample' ? 32 : 1); render(); });
  }
  const move = point => {
    if (!['x', 'y', 'z'].every(key => Number.isFinite(point[key]))) return;
    let changed = false;
    for (const key of ['x', 'y', 'z']) {
      // A plane's locked coordinate must retain its exact committed value.
      // 平面锁定的坐标保留原始提交值，不重新量化。
      if (point[key] === state[key]) continue;
      const input = $('control-' + key), step = Number(input.step);
      const value = Math.max(Number(input.min), Math.min(Number(input.max), point[key]));
      const next = Number((Math.round(value / step) * step).toFixed(10));
      if (next !== state[key]) { state[key] = next; changed = true; }
    }
    if (changed) render();
  };
  $('diagram').addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.target.closest('#moving-root')) return;
    event.preventDefault(); dragging = { id: event.pointerId, projection }; $('diagram').setPointerCapture(event.pointerId);
  });
  $('diagram').addEventListener('pointermove', event => {
    if (!dragging || event.pointerId !== dragging.id) return;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform($('diagram').getScreenCTM().inverse());
    const world = dragging.projection.inverse(p.x, p.y, state.y); move({ x: world.x, y: state.y, z: world.z });
  });
  const endDrag = event => { if (dragging?.id === event.pointerId) { dragging = null; render(); } };
  $('diagram').addEventListener('pointerup', endDrag); $('diagram').addEventListener('pointercancel', endDrag);
  $('diagram').addEventListener('lostpointercapture', endDrag);
  window.addEventListener('resize', () => {
    dragging = null;
    const markerFocused = document.activeElement?.id === 'moving-root';
    const rowFocused = document.activeElement?.closest('#values') ? document.activeElement.textContent : null;
    render();
    if (markerFocused) $('moving-root').focus({ preventScroll: true });
    else if (rowFocused) for (const button of $('values').querySelectorAll('button')) if (button.textContent === rowFocused) button.focus({ preventScroll: true });
  });
  $('diagram').addEventListener('keydown', event => {
    if (!event.target.closest('#moving-root') || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); const step = event.shiftKey ? .1 : .01;
    move({ x: state.x + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0),
      y: state.y, z: state.z + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0) });
    $('moving-root').focus({ preventScroll: true });
  });
  function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  Object.defineProperty(window, 'SensaGeometryView', { value: Object.freeze({ snapshot: () =>
    freeze(JSON.parse(JSON.stringify({ locale, state, result, projection, projectionMode: $('projection').value, dragPlane: $('drag-plane').value, three: threeView?.snapshot() || null }))) }), writable: false });
  window.addEventListener('pagehide', disposeThree);
  window.addEventListener('pageshow', event => { if (event.persisted) render(); });
  render();
})();
