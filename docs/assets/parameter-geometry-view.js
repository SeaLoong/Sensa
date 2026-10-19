/* Offline interactive SVG views. No network, devices, animation loop or HTML injection.
 * 离线交互 SVG：无网络、设备、自动动画或 HTML 注入。 */
(function () {
  'use strict';
  const Model = window.SensaParameterGeometry;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);
  const dictionary = {
    brand: ['参数图解', 'Parameter geometry'], modelTag: ['离线几何模型', 'Offline geometry model'],
    language: ['语言', 'Language'], title: ['看见参数背后的形状', 'See the shapes behind the parameters'],
    intro: ['移动橙色操作点，观察接收范围、Sender 与读数。图示只运行离线几何模型，不连接 OSC 或设备。', 'Move the orange handle to explore receivers, Senders and values. This is an offline geometry model with no OSC or device connection.'],
    scenario: ['测量场景', 'Scenario'], projection: ['投影', 'Projection'], xz: ['XZ 平面投影', 'XZ projection'], iso: ['立体投影', 'Orthographic 3D'],
    reset: ['复位', 'Reset'], receivers: ['接收范围', 'Receivers'], senders: ['Sender 范围', 'Senders'],
    reference: ['实体外形示意', 'Illustrative outlines'], dimensions: ['半径与尺寸', 'Radii and dimensions'], zoom: ['缩放', 'Zoom'],
    readout: ['参数读数', 'Parameter values'], simulated: ['几何模拟值', 'Simulated geometry'],
    rowHint: ['选择一行突出对应形状。模型门控不包含运行时估长、映射或设备输出。', 'Select a row to highlight its shapes. Model gate excludes runtime length learning, mappings and device output.'],
    parameter: ['参数', 'Parameter'], raw: ['原始值', 'Raw'], effective: ['模型门控', 'Model gate'],
    grid: ['16 × 8 位编码示意', '16 × 8 encoded bits'], controls: ['调整几何', 'Adjust geometry'],
    dragHint: ['拖动橙色操作点仅改变 X/Z，Y 由滑条控制。方向键：左右 Z、上下 X；Shift 加速。', 'Drag the orange handle in X/Z; use the Y slider for height. Arrow keys: left/right Z, up/down X; Shift moves faster.'],
    x: ['移动对象 · X', 'Moving object · X'], y: ['移动对象 · Y', 'Moving object · Y'], z: ['移动对象 · Z', 'Moving object · Z'],
    length: ['Plug 长度 L', 'Plug length L'], width: ['Plug 半径 W', 'Plug radius W'], depth: ['Socket 区域 D', 'Socket region D'],
    yaw: ['Plug 绕根旋转', 'Plug root rotation'], senderRadius: ['身体 Sender 半径', 'Body Sender radius'],
    zoneRadius: ['Touch Zone 半径', 'Touch Zone radius'], sample: ['Sample 计数步', 'Sample counter step'],
    ageMs: ['距上次变化时间', 'Age since last change'], frame: ['编码序号 Frame', 'Encoded Frame'],
    valid: ['生产端允许发布', 'Producer permits publishing'],
    formulaTitle: ['读图时记住', 'Reading the model'], meaningTitle: ['这些量不等价', 'Different quantities'],
    meaning: ['近接值不是 XYZ，根坐标不是姿态，编码分辨率不是实测精度。球／胶囊是 Contact；灰色外形只是 Socket 与 Plug 的示意。', 'Proximity is not XYZ, a root position is not orientation, and encoding resolution is not measured accuracy. Spheres/capsules represent Contacts; gray Socket/Plug outlines are illustrative.'],
    sourceNote: ['尺寸依据固定版本上游源码及 Sensa 契约，不推断动态缩放、多个 Sender 或真实客户端行为。', 'Dimensions follow pinned upstream sources and Sensa contracts, without inferring dynamic scale, multiple Senders or actual client behavior.'],
    dictionary: ['参数字典', 'Parameter dictionary'], ogbSources: ['OGB 几何与来源', 'OGB geometry and sources'],
    positioning: ['SPS 定位原理', 'SPS positioning'], offline: ['无外部图表库 · 无网络连接', 'No chart library · No network connection'],
    'socket-modern': ['Socket · 现代 Root / Tip', 'Socket · Modern Root / Tip'],
    'socket-legacy': ['Socket · 旧近接与 Close', 'Socket · Legacy proximity / Close'],
    'plug-depth': ['Plug · PenOthers', 'Plug · PenOthers'],
    'socket-touch': ['Socket · Touch / Close', 'Socket · Touch / Close'],
    'plug-touch': ['Plug · Touch / Close', 'Plug · Touch / Close'],
    'socket-frot': ['Socket · FrotOthers', 'Socket · FrotOthers'],
    'plug-frot': ['Plug · Frot / Close', 'Plug · Frot / Close'],
    zone: ['独立 Touch Zone', 'Independent Touch Zone'],
    'sensa-sps': ['Sensa SPS · 固定 P0–P3', 'Sensa SPS · Fixed P0–P3'],
    shader: ['Shader · 坐标与编码', 'Shader · Coordinates and encoding'],
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
      summary: ['四锚点固定在 Avatar 根下；专用 r=0.001 标记移动，Receiver R=2.5。', 'Four anchors stay fixed under the avatar root; a dedicated r=0.001 marker moves, with Receiver R=2.5.'],
      explanation: ['Sample=0 或超时使输出无效。静止 P 值可缓存，活动计数必须变化；低残差不证明身份、原子采样或实际定位精度。', 'Sample=0 or expiry invalidates output. Stationary P values may be cached, but the activity counter must change. Low residual proves neither identity, atomic sampling nor actual accuracy.'],
      formula: ['dᵢ=2.5(1−Pᵢ)+0.001。四个已知非共面锚点还原一个局部点；有效区是四球交集扣除饱和区，并非整个方框。', 'dᵢ=2.5(1−Pᵢ)+0.001. Four known noncoplanar anchors recover one local point. Valid space is their shared coverage minus saturation regions, not the entire box.'],
    },
    shader: {
      summary: ['没有 Contact 或触发半径：将根坐标量化为 16 位，编码为带 ID、Frame 与 CRC 的图块。', 'No Contact or trigger radius: quantize root coordinates to 16 bits and encode a grid with ID, Frame and CRC.'],
      explanation: ['这里只模拟编码与桌面 500 ms 接收上限。实际桥默认 350 ms 就先发 Valid=0；下方 16×8 图不是实际捕获像素或客户端验收。', 'This models encoding and the desktop’s 500 ms intake ceiling. The actual bridge normally sends Valid=0 after 350 ms. The 16×8 grid is not captured pixels or client acceptance.'],
      formula: ['q=round(clamp((p−center+1.5)/3)×65535)；步长=3/65535。越界不因量化夹紧变成有效；Frame/X/Y/Z/Valid 按顺序提交。', 'q=round(clamp((p−center+1.5)/3)×65535); step=3/65535. Clamping does not validate an out-of-bounds source. Frame/X/Y/Z/Valid commit in order.'],
    },
  };
  let locale = new URLSearchParams(location.search).get('lang') === 'en-US' ? 'en-US' : 'zh-CN';
  let state = Model.defaultsFor($('scene').value);
  let result, projection, selected = '', dragging = null;
  const text = pair => Array.isArray(pair) ? pair[locale === 'en-US' ? 1 : 0] : dictionary[pair]?.[locale === 'en-US' ? 1 : 0] ?? pair;
  const fmt = (value, digits = 3) => Number.isFinite(value) ? (Object.is(Number(value.toFixed(digits)), -0) ? 0 : value).toFixed(digits) : '—';
  const spatial = () => ['sensa-sps', 'shader'].includes(state.scenario);
  const units = () => spatial() ? text(['本地单位', 'local units']) : 'm';
  const svg = (tag, attrs = {}, children = []) => {
    const element = document.createElementNS(NS, tag);
    for (const [name, value] of Object.entries(attrs)) if (value !== undefined) element.setAttribute(name, String(value));
    for (const child of children) element.append(child);
    return element;
  };
  const label = (x, y, value, attrs = {}) => {
    const node = svg('text', { x, y, ...attrs }); node.textContent = value; return node;
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
    const attrs = { class: 'shape ' + shape.role + highlight };
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
        const d = 'M ' + (a.x + nx) + ' ' + (a.y + ny) + ' L ' + (b.x + nx) + ' ' + (b.y + ny)
          + ' A ' + r + ' ' + r + ' 0 0 0 ' + (b.x - nx) + ' ' + (b.y - ny) + ' L ' + (a.x - nx) + ' ' + (a.y - ny)
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
  function references(layer) {
    if (!$('show-reference').checked) return;
    const polygon = points => svg('polygon', { class: 'reference', points: points.map(p => { const q = projection.p(p); return q.x + ',' + q.y; }).join(' ') });
    const root = result.points.socketRoot;
    if (root) {
      const w = .07, d = Math.min(state.D, .22);
      layer.append(polygon([{ x: root.x - w, y: root.y, z: root.z + .012 }, { x: root.x - w, y: root.y, z: root.z - d },
        { x: root.x + w, y: root.y, z: root.z - d }, { x: root.x + w, y: root.y, z: root.z + .012 },
        { x: root.x + w * .66, y: root.y, z: root.z + .012 }, { x: root.x + w * .66, y: root.y, z: root.z - d * .7 },
        { x: root.x - w * .66, y: root.y, z: root.z - d * .7 }, { x: root.x - w * .66, y: root.y, z: root.z + .012 }]));
      const p = projection.p(root); layer.append(label(p.x, p.y - 40, 'Socket', { 'text-anchor': 'middle' }));
    }
    for (const prefix of ['plug', 'sender']) {
      const a = result.points[prefix + 'Root'], b = result.points[prefix + 'Tip'];
      if (!a || !b) continue;
      const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz) || 1, w = state.W;
      const offset = { x: -dz / length * w, z: dx / length * w };
      layer.append(polygon([{ x: a.x + offset.x, y: a.y, z: a.z + offset.z }, { x: b.x + offset.x * .6, y: b.y, z: b.z + offset.z * .6 },
        { x: b.x - offset.x * .6, y: b.y, z: b.z - offset.z * .6 }, { x: a.x - offset.x, y: a.y, z: a.z - offset.z }]));
      const p = projection.p(a), q = projection.p(b);
      layer.append(label(p.x + 10, p.y - 19, 'Root'), label(q.x, q.y + 28, 'Tip', { 'text-anchor': 'middle' }));
    }
  }
  function draw() {
    projection = dragging?.projection || projector();
    const title = svg('title', { id: 'diagram-title' }); title.textContent = text(state.scenario);
    const desc = svg('desc', { id: 'diagram-description' }); desc.textContent = text(scenes[state.scenario].summary) + ' ' + text('dragHint');
    const layer = svg('g');
    $('diagram').replaceChildren(title, desc, layer);
    const center = result.points.frameCenter || { x: 0, y: 0, z: 0 };
    const origin = projection.p(center);
    for (const [axis, vector] of [['Z', { x: 0, y: 0, z: 1 }], ['X', { x: 1, y: 0, z: 0 }], ...(projection.iso ? [['Y', { x: 0, y: 1, z: 0 }]] : [])]) {
      const p = projection.p({ x: center.x + vector.x * (spatial() ? 1 : .15), y: center.y + vector.y * (spatial() ? 1 : .15), z: center.z + vector.z * (spatial() ? 1 : .15) });
      layer.append(svg('line', { class: 'axis', x1: origin.x, y1: origin.y, x2: p.x, y2: p.y }), label(p.x + 8, p.y + 7, '+' + axis, { class: 'grid-axis-label' }));
    }
    references(layer);
    const field = result.values.find(v => v.name === selected);
    for (const shape of result.shapes) {
      if (shape.role === 'receiver' && !$('show-receivers').checked || shape.role === 'sender' && !$('show-senders').checked) continue;
      const active = shape.id === field?.receiverId || shape.id === field?.senderId;
      layer.append(drawShape(shape, active));
      if (shape.id.startsWith('receiver-P')) {
        const p = projection.p(shape.center), i = Number(shape.id.slice(-1));
        layer.append(svg('circle', { class: 'center', cx: p.x, cy: p.y, r: 4 }));
        layer.append(label(p.x + (i === 0 || i === 2 ? -14 : 14), p.y + (i < 2 ? 24 : -15), 'P' + i, { class: 'anchor-label', 'text-anchor': i === 0 || i === 2 ? 'end' : 'start' }));
      }
      if ($('show-dimensions').checked && active && shape.radius) {
        const p = projection.p(shape.center), direction = shape.role === 'sender' ? -1 : 1, end = p.x + direction * shape.radius * projection.scale;
        layer.append(svg('line', { class: 'dimension', x1: p.x, y1: p.y, x2: end, y2: p.y }));
        const x = 36, y = shape.role === 'receiver' ? 30 : 58;
        const name = shape.role === 'receiver' ? text(['接收器', 'Receiver']) : 'Sender';
        const size = name + ' · R ' + fmt(shape.radius) + (shape.type === 'capsule' ? ' · H ' + fmt(shape.effectiveHeight) + text(['（含帽）', ' incl. caps']) : '');
        layer.append(label(x, y, size, { class: 'dimension-label' }));
        if (shape.type === 'capsule') {
          const a = projection.p({ x: shape.a.x - shape.axis.x * shape.radius, y: shape.a.y - shape.axis.y * shape.radius, z: shape.a.z - shape.axis.z * shape.radius });
          const b = projection.p({ x: shape.b.x + shape.axis.x * shape.radius, y: shape.b.y + shape.axis.y * shape.radius, z: shape.b.z + shape.axis.z * shape.radius });
          layer.append(svg('line', { class: 'dimension', x1: a.x, y1: a.y, x2: b.x, y2: b.y }));

        }
      }
    }
    const p = projection.p(result.points.movingRoot);
    const ratio = 960 / Math.max($('diagram').getBoundingClientRect().width, 200);
    const moving = svg('g', { id: 'moving-root', tabindex: 0, role: 'group',
      'aria-label': text(['移动根点', 'Move root']) + ': X ' + fmt(state.x) + ', Y ' + fmt(state.y) + ', Z ' + fmt(state.z),
      'aria-describedby': 'projection-note', 'aria-roledescription': text(['二维移动控制', 'Two-dimensional movement control']),
      'data-x': state.x, 'data-y': state.y, 'data-z': state.z });
    moving.append(svg('circle', { class: 'moving-hit', cx: p.x, cy: p.y, r: 14 * ratio }),
      svg('circle', { class: 'moving', cx: p.x, cy: p.y, r: 5 * ratio }));
    layer.append(moving);
    $('projection-note').textContent = text(projection.iso
      ? ['正交立体投影；球的投影半径保持同一比例。', 'Orthographic 3D projection; spheres retain the same radius scale.']
      : ['XZ 投影，不是 Y 切片；Y 仍参与全部距离计算。', 'XZ projection, not a Y slice; Y still contributes to every distance.'])
      + ' ' + text(['橙色操作柄不是 Sender 半径；灰色外形仅为示意。单位：', 'The orange handle is not the Sender radius; gray outlines are illustrative. Units: ']) + units()
      + (state.scenario === 'sensa-sps' ? ' ' + text(['R=2.5 接收球可能超出放大视口；方框不代表全部可测。', 'R=2.5 receivers may extend beyond this enlarged view; the box is not all measurable.']) : '')
      + (!spatial() ? ' ' + text(['本场景 Socket +Z 向外，Plug 在 yaw=0 时朝 −Z；这不是作者 Plug 原生 +Z 的旋转定义。', 'Here Socket +Z points outward and yaw=0 aims the Plug along −Z; this is not the authored Plug’s native +Z rotation definition.']) : '');
  }
  function readouts() {
    $('values').replaceChildren();
    for (const value of result.values) {
      const row = document.createElement('tr'); row.dataset.name = value.name; row.classList.toggle('selected', selected === value.name);
      if (value.emitted === false) row.title = text(['未发送；仅展示编码计算', 'Not sent; encoding computation only']);
      const name = document.createElement('td'), button = document.createElement('button');
      button.type = 'button'; button.textContent = value.name; button.setAttribute('aria-pressed', String(selected === value.name));
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
    $('path-prefix').textContent = result.values[0]?.path.slice(0, result.values[0].path.lastIndexOf('/')) || '';
    const list = [], add = (name, value) => list.push([text(name), value]);
    const m = result.metrics, field = result.values.find(v => v.name === selected);
    if (field?.axisDistance !== undefined) add(['最近轴距（完整 XYZ）', 'Nearest axis distance (full XYZ)'], fmt(field.axisDistance) + ' ' + units());
    if (m.centerDistance !== undefined) {
      add(['根中心距离', 'Root-center distance'], fmt(m.centerDistance) + ' m');
      add(['未饱和估长', 'Unsaturated length estimate'], m.unsaturatedLengthEstimate === null ? '—' : fmt(m.unsaturatedLengthEstimate) + ' m');
      add(['已知 L 的理想径向参考', 'Ideal radial reference with known L'], fmt(m.idealKnownLengthRadialRatio * 100, 1) + '%');
    }
    if (state.scenario === 'sensa-sps') {
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
      for (let column = 0; column < 16; column++) for (let row = 0; row < 8; row++) {
        const bit = result.metrics.bytes[column] >> (7 - row) & 1;
        $('bit-grid').append(svg('rect', { x: column * 20, y: row * 20, width: 20, height: 20, fill: bit ? '#fff' : '#182131', 'data-byte': column, 'data-bit': 7 - row, 'data-value': bit }));
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
    if (state.scenario === 'sensa-sps') allowed.add('sample');
    if (state.scenario === 'shader') allowed.add('frame');
    for (const holder of document.querySelectorAll('[data-control]')) {
      const key = holder.dataset.control, input = $('control-' + key); holder.hidden = !allowed.has(key);
      if (['x', 'y', 'z'].includes(key)) {
        input.min = spatial() ? key === 'y' ? '-0.8' : '-1.8' : key === 'z' ? '-0.4' : '-0.6';
        input.max = spatial() ? key === 'y' ? '2.8' : '1.8' : key === 'z' ? '1.2' : '0.6';
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
    $('unit-note').textContent = spatial()
      ? text(['Avatar 根局部单位；共同世界平移不会改变这些坐标。图中方框为编码／显示边界，不是 Contact 共同覆盖保证。', 'Avatar-root local units; common world movement does not change these coordinates. The box is an encoding/display boundary, not guaranteed Contact coverage.'])
      : text(['米制示意，作者缩放假定为 1；胶囊 H 含端帽，尺寸以模型读数为准。', 'Metre illustration with authored scale assumed one. Capsule H includes caps; use model dimensions.']);
  }
  function localize() {
    document.documentElement.lang = locale; document.title = 'Sensa · ' + text('brand'); $('locale').value = locale;
    for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = text(node.dataset.i18n);
    $('scene-title').textContent = text(state.scenario); $('scene-summary').textContent = text(scenes[state.scenario].summary);
    const suffix = locale === 'en-US' ? '.en.md' : '.md', hosted = /^https?:$/.test(location.protocol);
    for (const [selector, path] of [['.brand', 'osc-parameters'], ['#reference-link', 'osc-parameters'], ['#ogb-link', 'ogb-compatibility'], ['#position-link', 'positioning']]) {
      document.querySelector(selector).href = (hosted ? 'https://github.com/SeaLoong/Sensa/blob/main/docs/' : '') + path + suffix;
    }
  }
  function render() {
    result = Model.evaluate(state);
    if (!result.values.some(v => v.name === selected)) selected = result.values[0]?.name || '';
    localize(); controls(); draw(); readouts();
  }
  $('scene').addEventListener('change', () => { dragging = null; state = Model.defaultsFor($('scene').value); selected = ''; render(); });
  $('locale').addEventListener('change', () => { locale = $('locale').value; render(); });
  $('projection').addEventListener('change', render);
  $('reset').addEventListener('click', () => { state = Model.defaultsFor(state.scenario); selected = ''; $('zoom').value = '1'; render(); });
  for (const name of ['show-receivers', 'show-senders', 'show-reference', 'show-dimensions', 'zoom']) $(name).addEventListener('input', render);
  for (const holder of document.querySelectorAll('[data-control]')) {
    const key = holder.dataset.control, input = $('control-' + key);
    input.addEventListener('input', () => { state[key] = key === 'valid' ? input.checked : Number(input.value) / (key === 'sample' ? 32 : 1); render(); });
  }
  const move = (x, z) => {
    for (const [key, value] of [['x', x], ['z', z]]) {
      const input = $('control-' + key), step = Number(input.step);
      state[key] = Math.max(Number(input.min), Math.min(Number(input.max), Math.round(value / step) * step));
    }
    render();
  };
  $('diagram').addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.target.closest('#moving-root')) return;
    event.preventDefault(); dragging = { id: event.pointerId, projection }; $('diagram').setPointerCapture(event.pointerId);
  });
  $('diagram').addEventListener('pointermove', event => {
    if (!dragging || event.pointerId !== dragging.id) return;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform($('diagram').getScreenCTM().inverse());
    const world = dragging.projection.inverse(p.x, p.y, state.y); move(world.x, world.z);
  });
  const endDrag = event => { if (dragging?.id === event.pointerId) { dragging = null; render(); } };
  $('diagram').addEventListener('pointerup', endDrag); $('diagram').addEventListener('pointercancel', endDrag);
  $('diagram').addEventListener('lostpointercapture', endDrag);
  window.addEventListener('resize', () => { const focused = document.activeElement?.id === 'moving-root'; render(); if (focused) $('moving-root').focus({ preventScroll: true }); });
  $('diagram').addEventListener('keydown', event => {
    if (!event.target.closest('#moving-root') || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); const step = event.shiftKey ? .1 : .01;
    move(state.x + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0), state.z + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0));
    $('moving-root').focus({ preventScroll: true });
  });
  function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  Object.defineProperty(window, 'SensaGeometryView', { value: Object.freeze({ snapshot: () =>
    freeze(JSON.parse(JSON.stringify({ locale, state, result, projection }))) }), writable: false });
  render();
})();
