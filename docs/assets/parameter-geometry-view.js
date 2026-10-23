/* Offline interactive SVG/Three.js views. No network, devices, animation loop or HTML injection.
 * 离线交互 SVG/Three.js：无网络、设备、自动动画或 HTML 注入。 */
(function () {
  'use strict';
  const Model = window.SensaParameterGeometry;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);
  const dictionary = {
    brand: ['参数图解', 'Parameter geometry'], modelTag: ['交互指南', 'Interactive guide'],
    skipToExplorer: ['跳到交互图示', 'Skip to the interactive guide'],
    chooseParameters: ['选择要了解的参数', 'Choose your parameters'],
    chooseHint: ['按 VRChat 或 Sensa 中显示的参数名查找。', 'Start with the names you see in VRChat or Sensa.'],
    navExplore: ['观察动作', 'Explore movement'], navAdjust: ['调整位置', 'Adjust position'], navRead: ['理解参数', 'Read parameters'],
    quickTerms: ['先认识这两个名称', 'Two useful terms'],
    socketMeaning: ['接收一侧，以入口位置作为参照。', 'The receiving area, with its entrance as the reference point.'],
    plugMeaning: ['靠近接收区域的一侧，以根部作为参照。', 'The approaching part, measured from its root.'],
    interactiveLabel: ['移动目标 · 观察读数 · 理解用途', 'MOVE · OBSERVE · UNDERSTAND'],
    viewHeading: ['观察动作与检测范围', 'Explore the movement'],
    calculationSummary: ['展开计算方法与测量细节', 'Calculation details'],
    language: ['语言', 'Language'], title: ['看懂参数怎样随动作变化', 'See what each parameter responds to'],
    intro: ['拖动橙色目标，比较位置与读数。点选参数名，可以看到它对应的检测范围；下方说明介绍这些数值怎样用于联动。', 'Move the orange target and watch the values change. Select a parameter to see its detection area, then read how to use the value below.'],
    scenario: ["参数组", "Parameter group"], projection: ['观察视角', 'View'], xz: ['XZ 平面投影', 'XZ projection'], iso: ['立体投影', 'Orthographic 3D'],
    orbit: ['可旋转 3D', 'Orbit 3D'], license: ['Three.js MIT 许可', 'Three.js MIT license'],
    fallback: ['本机 3D 不可用，已切换立体 SVG；读数与 XYZ 滑条仍可使用。', '3D is unavailable here. Using orthographic SVG; values and XYZ sliders still work.'],
    orbitControls: ['拖动橙色目标移动；拖动空白处旋转，滚轮／双指缩放。', 'Drag the orange target to move it; drag empty space to orbit, wheel/pinch to zoom.'],
    dragPlane: ['拖动平面', 'Drag plane'], pathPrefix: ['参数前缀', 'Parameter prefix'],
    pathAssembly: ['将 * 替换为实例名；完整地址 = /avatar/parameters/ + 前缀 + /行名。', 'Replace * with the instance name. Full address = /avatar/parameters/ + prefix + /row name.'],
    reset: ['重置位置', 'Reset'], receivers: ['接收范围', 'Receivers'], senders: ["目标检测形状", "Target detection shapes"],
    reference: ['实体外形示意', 'Illustrative outlines'], dimensions: ['半径与尺寸', 'Radii and dimensions'], zoom: ['缩放', 'Zoom'],
    readout: ['参数读数', 'Parameter values'], simulated: ['几何模拟值', 'Simulated geometry'],
    rowHint: ['点选参数，图中会突出对应的检测范围。可用读数结合了接触状态和信号更新情况。', 'Select a parameter to highlight its detection area. Usable values also account for contact and signal updates.'],
    parameter: ['参数', 'Parameter'], raw: ['模拟读数', 'Reading'], effective: ['可用读数', 'Usable value'],
    grid: ['QR Code · 当前测量', 'QR Code · live measurement'], controls: ['调整位置与尺寸', 'Adjust position and size'],
    encodingHint: ['三个角标帮助识别图块。外围白色区域容纳小幅画面位移，内部纠错数据帮助还原受损内容。', 'Three corner markers identify the code. The white border leaves room for small image shifts; error correction helps restore damaged content.'],
    shaderComponents: ['调整目标方向与 Avatar 缩放', 'Target direction and Avatar scale'],
    shaderStatistics: ['画面怎样成为测量值', 'From image to measurement'],
    measurementDetails: ['展开测量数字与精度', 'Measurement values and precision'],
    qrLocate: ['找到角标', 'Find the corner markers'], qrLocateHint: ['三个角标帮助确定图块的位置和朝向。', 'They identify the code’s position and orientation.'],
    qrRestore: ['恢复数据', 'Restore the data'], qrRestoreHint: ['纠错信息帮助补回缺失或读错的内容。', 'Error correction reconstructs damaged data within its capacity.'],
    qrVerify: ['核对完整性', 'Check the complete measurement'], qrVerifyHint: ['校验码、目标编号和更新序号共同确认本次测量。', 'A checksum, target ID and sequence keep the reading together.'],
    qrRead: ['读取位置', 'Read position and direction'], qrReadHint: ['还原的位置、方向与缩放通过 OSC 送到 Sensa。', 'Sensa receives restored position, direction and scale through OSC.'],
    shaderRowHint: ['点选参数了解用途。左列显示编码后的测量值，右列显示当前可供计算使用的值。', 'Select a parameter to read its use. Readings show encoded measurements; usable values show what calculations can currently use.'],
    shaderMeaning: ['XYZ 表示目标在 Avatar 根局部坐标中的位置。RightXYZ 与 ForwardXYZ 给出目标 X、Z 轴的方向和单位轴长，两者共同描述目标平面。AvatarScale 将根局部位移换算为世界米数；Frame 是编码时钟，Valid=1 提交完整的 12 字段更新。联动与计算通过定位测量读取这些指标。', 'XYZ locate the target in Avatar-root local coordinates. RightXYZ and ForwardXYZ give the directions and lengths per unit of the target X/Z axes, together describing its plane. AvatarScale converts root-local displacement to world metres. Frame is the encoder clock; Valid=1 commits a complete 12-field update. Read these metrics through Tracking measurement for outputs and calculations.'],
    shaderComponentsHint: ['RightXYZ 与 ForwardXYZ 分别表示目标 X、Z 轴在根坐标系中的方向和单位轴长。AvatarScale 表示每个根局部单位对应的世界米数。', 'RightXYZ and ForwardXYZ describe target X/Z directions and lengths per local unit in the root frame. AvatarScale gives world metres per root-local unit.'],
    rightX: ['目标 X 轴 · 根 X 分量', 'Target X axis · root X'], rightY: ['目标 X 轴 · 根 Y 分量', 'Target X axis · root Y'], rightZ: ['目标 X 轴 · 根 Z 分量', 'Target X axis · root Z'],
    forwardX: ['目标 Z 轴 · 根 X 分量', 'Target Z axis · root X'], forwardY: ['目标 Z 轴 · 根 Y 分量', 'Target Z axis · root Y'], forwardZ: ['目标 Z 轴 · 根 Z 分量', 'Target Z axis · root Z'],
    avatarScale: ['根单位对应的世界米数', 'World metres per root unit'],
    dragHint: ['拖动橙色操作点仅改变 X/Z，Y 由滑条控制。方向键：左右 Z、上下 X；Shift 加速。', 'Drag the orange handle in X/Z; use the Y slider for height. Arrow keys: left/right Z, up/down X; Shift moves faster.'],
    x: ['左右位置 · X', 'Side-to-side · X'], y: ['高度 · Y', 'Height · Y'], z: ['前后位置 · Z', 'Front-to-back · Z'],
    vx: ['SDK 相对速度 · X', 'SDK relative velocity · X'], vy: ['SDK 相对速度 · Y', 'SDK relative velocity · Y'], vz: ['SDK 相对速度 · Z', 'SDK relative velocity · Z'],
    proximitySpeed: ['接近值变化率', 'Proximity change rate'],
    length: ['Plug 长度 L', 'Plug length L'], width: ['Plug 半径 W', 'Plug radius W'], depth: ['Socket 区域 D', 'Socket region D'],
    yaw: ['Plug 绕根旋转', 'Plug root rotation'], senderRadius: ["触碰对象半径", "Touching object radius"],
    zoneRadius: ['Touch Zone 半径', 'Touch Zone radius'], sample: ['活动计数 Sample（0 表示停止）', 'Activity counter Sample (0 means stopped)'],
    ageMs: ['距上次变化时间', 'Age since last change'], frame: ['编码序号 Frame', 'Encoded Frame'],
    valid: ['模拟收到有效样本', 'Simulate a valid sample'],
    coverage: ['可检测区域', 'Detection region'], simulation: ['观察信号暂停时的读数', 'When the signal pauses'],
    validHint: ["勾选表示收到有效样本；取消可观察信号失效后的读数。调整停更时间，可比较正常更新与信号停更的效果。", "Select this to receive a valid sample; clear it to explore signal loss. Adjust the age to compare fresh and stalled signals."],
    formulaTitle: ["数值怎样算出", "How values are calculated"], meaningTitle: ["怎样理解这些数值", "Understanding the values"],
    meaning: ["0–1 的接近值描述匹配对象由远到近的变化，Close=1 表示进入对应接触范围。X/Y/Z 给出目标相对参考点的位置。彩色球或胶囊画出检测范围，灰色轮廓帮助辨认 Socket、Plug 与朝向。", "A 0–1 proximity value follows a matching object as it moves closer. Close=1 marks entry into its contact region. X/Y/Z locate a target relative to its reference. Colored spheres or capsules show detection shapes; gray outlines identify the Socket, Plug and direction."],
    sourceNote: ["尺寸与计算依据来自引用的上游实现及 Sensa 定义，详细参数地址和来源见下方链接。", "Dimensions and calculations follow the cited upstream implementations and Sensa definitions. Follow the links below for full addresses and sources."],
    dictionary: ['参数字典', 'Parameter dictionary'], ogbSources: ['OGB 几何与来源', 'OGB geometry and sources'],
    parameterReferenceTitle: ['每个参数代表什么', 'What each parameter means'],
    parameterReferenceIntro: ['逐项查看参数含义、测量规则与联动用法。来源分别注明 VRChat SDK 报告、VRCFury 生成参数与 Sensa 自有协议字段。', 'Read each parameter’s meaning, measurement definition and interaction use. Sources identify VRChat SDK reports, VRCFury-generated parameters and Sensa’s own protocol fields.'],
    parameterReferenceRange: ['数值范围', 'Range'], parameterReferenceUnit: ['单位', 'Unit'], parameterReferenceType: ['参数类型', 'Parameter type'],
    parameterReferenceUsage: ['联动用法', 'Interaction use'], parameterReferenceSources: ['说明来源', 'Sources'],
    parameterReferenceSelected: ['当前选中：', 'Selected: '],
    positioning: ['定位原理', 'Positioning'], offline: ['本地 Three.js · 离线可用', 'Local Three.js · Works offline'],
    exploreTopics: ['继续了解', 'More help'], positionTopic: ['位置追踪', 'Position tracking'], depthTopic: ['进入与靠近', 'Depth and approach'], touchTopic: ['触碰响应', 'Touch response'],
    'socket-modern': ["SPS2 · PenOthersNewRoot / PenOthersNewTip", "SPS2 · PenOthersNewRoot / PenOthersNewTip"],
    'socket-legacy': ["SPS1 · PenOthers / PenOthersClose", "SPS1 · PenOthers / PenOthersClose"],
    'plug-depth': ['Plug · PenOthers', 'Plug · PenOthers'],
    'socket-touch': ["Socket · TouchOthers / TouchOthersClose", "Socket · TouchOthers / TouchOthersClose"],
    'plug-touch': ["Plug · TouchOthers / TouchOthersClose", "Plug · TouchOthers / TouchOthersClose"],
    'socket-frot': ['Socket · FrotOthers', 'Socket · FrotOthers'],
    'plug-frot': ["Plug · FrotOthers / FrotOthersClose", "Plug · FrotOthers / FrotOthersClose"],
    zone: ["Touch Zone · Others", "Touch Zone · Others"],
    'contact-sdk': ['Contact 直接定位（SDK Beta）', 'Contact direct tracking (SDK Beta)'],
    'sensa-sps': ['SPS 四点定位', 'SPS four-anchor tracking'],
    shader: ["Shader · X / Y / Z", "Shader · X / Y / Z"],
  };
  const scenes = {
    'socket-modern': {
      summary: ["NewRoot 随 Plug 根部靠近 Socket 入口而增大；NewTip 与它配合，提供长度辅助信息。", "NewRoot increases as the Plug root approaches the Socket entrance. NewTip pairs with it to provide length information."],
      explanation: ["两路配合用于估算进入程度：NewRoot 反映根部距离，NewTip 观测同一根部的长度球。下方径向参考采用滑块中的已知长度 L；侧向偏移也会改变这个距离。", "The pair helps estimate entry: NewRoot reflects root distance, while NewTip observes a length sphere at the same root. The radial reference below uses the known slider length L; sideways movement also changes this distance."],
      formula: ["两只接收球 R=1，根球 r=0.01，长度球 r=L。p=clamp(1−max(0,d−r)/R)；两路未饱和时，估长=NewTip−NewRoot+0.01，已知 L 的径向参考=clamp(1−d/L)。", "Both receivers have R=1; the root sphere has r=0.01 and the length sphere r=L. p=clamp(1−max(0,d−r)/R). With both channels unsaturated, estimated length=NewTip−NewRoot+0.01; the radial reference for known L is clamp(1−d/L)."],
    },
    'socket-legacy': {
      summary: ["PenOthers 可用来观察进入 Socket 区域的深浅趋势；PenOthersClose=1 表示同一目标已进入入口附近的接触范围。", "PenOthers follows the depth trend as a Plug enters the Socket region. PenOthersClose=1 means that target has entered the contact region near the entrance."],
      explanation: ["沿入口方向靠近时，PenOthers 通常逐渐增大。Close 为 1 时，本页把接近值作为联动参考；横向距离、Plug 长度和区域 D 也会影响读数。", "PenOthers usually rises when approaching along the entrance direction. While Close is 1, the proximity value becomes the interaction reference. Lateral distance, Plug length and region D also affect the reading."],
      formula: ["接近检测球中心 z=−D、R=D；Close 胶囊中心 z=−D/2、r=D/2.5、高 D。接近值按球心到目标表面的距离计算；Close=[最近轴距 < 双方半径之和]。", "The proximity sphere is centered at z=−D with R=D; the Close capsule is centered at z=−D/2 with r=D/2.5 and height D. Proximity uses distance to the target surface; Close=[nearest axis distance < sum of radii]."],
    },
    'plug-depth': {
      summary: ["Plug 一侧的 PenOthers 感知 Socket 入口：Plug 根部越靠近入口，读数越大。", "On the Plug side, PenOthers senses the Socket entrance: the reading rises as the Plug root approaches it."],
      explanation: ["这个值可作为进入程度的联动参考，再把实际动作两端的读数校准为设备行程。它随根部到入口的直线距离变化，轴向和侧向移动都会参与。", "Use this value as an entry reference, then calibrate the readings at the ends of the intended movement to the device travel. It follows the straight-line distance from root to entrance, including movement along and across the axis."],
      formula: ["R=L 的接收球跟随 Plug 根部，入口标记球 r=0.001 位于 Socket 根部。p=clamp(1−max(0,d−0.001)/L)；灰色尖端帮助辨认 Plug 朝向。", "An R=L receiver follows the Plug root; an r=0.001 entrance marker sits at the Socket root. p=clamp(1−max(0,d−0.001)/L). The gray tip shows Plug direction."],
    },
    'socket-touch': {
      summary: ["TouchOthers 描述手指、手等触碰 Socket 附近区域时的接近程度；TouchOthersClose 确认进入同一接触范围。", "TouchOthers describes a finger, hand or similar body contact approaching the Socket region. TouchOthersClose confirms entry into that contact region."],
      explanation: ["可把 TouchOthers 理解为触碰强度的参考，Close 负责确认接触区域。调整 D，可观察入口附近的触碰范围怎样随深度一起变化。", "Treat TouchOthers as a touch-intensity reference, with Close confirming the contact region. Adjust D to see how the region near the entrance grows with its depth."],
      formula: ["接近检测球中心 z=−D、R=D，Close 胶囊中心 z=−D/2。p=clamp(1−max(0,d−r)/R)；最近轴距小于双方半径之和时 Close=1。", "The proximity sphere is centered at z=−D with R=D; the Close capsule is centered at z=−D/2. p=clamp(1−max(0,d−r)/R). Close=1 when nearest axis distance is smaller than the sum of radii."],
    },
    'plug-touch': {
      summary: ["TouchOthers 描述身体与 Plug 触碰区域的接近程度；TouchOthersClose 确认目标进入包围 Plug 的胶囊范围。", "TouchOthers describes body contact approaching the Plug’s touch region. TouchOthersClose confirms entry into the capsule around the Plug."],
      explanation: ["贴近并沿外形移动时，TouchOthers 的变化可用于调节联动强度。半径 W 影响外侧覆盖，长度 L 影响沿 Plug 轴线的覆盖。", "As contact approaches and moves along the shape, TouchOthers can guide interaction intensity. Radius W affects the outer reach; length L affects coverage along the Plug axis."],
      formula: ["e=min(W,0.08)；接近检测球 R=L+e，Close 胶囊 r=W+e、高 L+2e。胶囊高度包含两端半球，直轴段长=max(0,H−2r)。", "e=min(W,0.08). The proximity sphere has R=L+e; the Close capsule has r=W+e and height L+2e. Capsule height includes both rounded caps; straight-axis length=max(0,H−2r)."],
    },
    'socket-frot': {
      summary: ["FrotOthers 反映两个 Socket 入口附近区域贴近的程度。", "FrotOthers reflects how closely the areas near two Socket entrances approach each other."],
      explanation: ["对方入口越靠近前置检测球，读数越大。Sensa 直接使用该接近值，作为贴近或摩擦时的强度参考。", "The reading rises as the other entrance approaches the forward detection sphere. Sensa uses this proximity value directly as an intensity reference for close contact or rubbing."],
      formula: ["接收球中心 z=0.05、R=0.1；对方入口标记半径 r=0.001。p=clamp(1−max(0,d−0.001)/0.1)。", "The receiver is centered at z=0.05 with R=0.1; the other entrance marker has r=0.001. p=clamp(1−max(0,d−0.001)/0.1)."],
    },
    'plug-frot': {
      summary: ["FrotOthers 描述两个 Plug 外形贴近时的接近程度；FrotOthersClose 确认双方检测包络已经相交。", "FrotOthers describes two Plug shapes approaching each other. FrotOthersClose confirms that their detection envelopes overlap."],
      explanation: ["这组参数可作为表面摩擦的联动参考：Close 确定接触范围，再用 FrotOthers 调节强度。旋转或侧向移动会改变双方最近距离。", "Use this pair as a reference for surface rubbing: Close confirms the contact region, then FrotOthers guides intensity. Rotation and sideways movement change the nearest distance between the shapes."],
      formula: ["接近检测球 R=L；Close 胶囊 r=W+0.08、高 L。Close=[最近轴距 < 双方半径之和]；可用值=Close×原始接近值。此图双方共用 L/W。", "The proximity sphere has R=L; the Close capsule has r=W+0.08 and height L. Close=[nearest axis distance < sum of radii]; usable value=Close×raw proximity. Both Plugs share L/W in this illustration."],
    },
    'zone': {
      summary: ["Others 显示他人触碰指定 Touch Zone 时的接近程度。", "Others reports proximity when another avatar touches the selected Touch Zone."],
      explanation: ["Touch Zone 可放在希望响应触碰的位置，例如身体表面的一小块区域。调整半径，可观察触碰开始生效的范围；数值可直接作为触碰强度参考。", "Place a Touch Zone wherever contact should create a response, such as a small area on the body surface. Adjust its radius to explore the reach, then use the value directly as a touch-intensity reference."],
      formula: ["接收区域为半径 R 的球；触碰对象半径 r 可独立调整。p=clamp(1−max(0,d−r)/R)，距离由完整 XYZ 计算。", "The receiver is a sphere of radius R; the touching object’s radius r varies independently. p=clamp(1−max(0,d−r)/R), using full XYZ distance."],
    },
    'contact-sdk': {
      summary: ['图示使用作者缩放 1：Avatar 根原点的接收球半径为 2 m，目标 Sender 半径为 1 mm。XYZ 直接报告 Sender 形状中点，绿色区域表示检测覆盖。', 'This example uses authored scale 1: a 2 m receiver at the Avatar root and a target Sender with a 1 mm radius. XYZ directly reports the Sender shape midpoint; green shows coverage.'],
      explanation: ['XYZ 以米描述身体部位或目标相对 Avatar 根的位置，可用于位置、进入程度与接触联动。SDK 选择接近值最大的自身标记；SenderType=1 且 Sample 持续更新时位置可用，原点与零速度均有效。速度与接近值变化率可单独调整，帮助观察不同动作信号。', 'XYZ in metres locates a body part or target relative to the Avatar root, for position, depth and contact interaction. The SDK selects the self marker with the highest positive proximity. Position is usable with SenderType=1 and updating Sample; the origin and zero velocity are valid. Adjust velocity and proximity change rate independently to explore different motion signals.'],
      formula: ['d 为双方形状中点距离，p=clamp(1−max(0,d−0.001)/2)。p>0 时选择 Sender，实际覆盖延伸到距原点小于 2.001 m。XYZ 为双方形状中点之差乘 Receiver 逆旋转，以米保留世界尺度；SDK 速度包含近似接触点的旋转影响，速度大小=√(Vx²+Vy²+Vz²)，ProximitySpeed 单位为 1/s。', 'With d the distance between shape midpoints, p=clamp(1−max(0,d−0.001)/2). A Sender is selected at p>0, extending coverage to a distance strictly below 2.001 m. XYZ is the difference between shape midpoints with inverse Receiver rotation, in metres retaining world scale. SDK velocity includes angular effects at an approximate contact point; its magnitude is √(Vx²+Vy²+Vz²), while ProximitySpeed uses 1/s.'],
    },
    'sensa-sps': {
      summary: ["P0–P3 的接收半径为 2 个根局部单位，跟随 SPS 根点的标记半径为 0.001。图示缩放 1 时分别对应 2 m 与 1 mm；绿色区域表示四路共同可测的位置。", "P0–P3 have a receiver radius of 2 root-local units; the marker following the SPS root has a radius of 0.001. At the illustrated scale of 1, these equal 2 m and 1 mm. Green shows their shared coverage."],
      explanation: ["P0–P3 提供四个方向的距离线索，Sample 持续变化表示测量仍在更新。解算出的 X/Y/Z 可用于左右、高低、前后的联动；目标越过绿色范围时，可用位置暂停。", "P0–P3 provide distance clues from four directions; a changing Sample shows continued measurement updates. The reconstructed X/Y/Z can guide side-to-side, height and forward/back interaction. Usable position pauses when the target leaves coverage."],
      formula: ["每路距离 dᵢ=2(1−Pᵢ)+0.001。绿色外形由四球交集与坐标边界共同决定，并避开测量点旁 0.003 个根局部单位的饱和区。边缘采用采样绘制，有效性由数值检查判定。", "Each distance is dᵢ=2(1−Pᵢ)+0.001. The green envelope combines the four-sphere intersection with coordinate bounds and excludes saturation regions of 0.003 root-local units near the anchors. Its edge is sampled; numeric checks determine validity."],
    },
    'shader': {
      summary: ['把目标的位置、方向和缩放写入 QR Code。桌面程序读取这个图块，再把测量值送到 Sensa。', 'The Shader writes position, direction and scale into a QR Code. A desktop reader turns the image into measurements for Sensa.'],
      explanation: ['绿色方框表示每轴前后各 2 个根局部单位的编码范围。二维码使用标准定位图案、自动选择的黑白掩码和分块纠错；桌面程序还原数据后，再检查 CRC32、目标编号与更新序号。', 'The green box spans two root-local units on either side of the center along each axis. Standard markers, a selected black-and-white mask and block error correction carry the measurements. The desktop reader then verifies CRC32, target ID and update sequence.'],
      formula: ['位置按 16 位整数保存，每级约 0.000061 个根局部单位。QR Version 4 / H 将 32 字节测量放入 4 个纠错块，每块含 9 个数据字节和 16 个校验字节；每块可纠正最多 8 个错误字节，已知缺失位置可占用更少的纠错容量。AvatarScale 把根局部位移换算为世界米数。', 'Position uses 16-bit integers, about 0.000061 root-local units per step. QR Version 4 / H carries the 32-byte measurement in four blocks, each with nine data bytes and sixteen parity bytes. Each block corrects up to eight wrong bytes; known missing locations consume less correction capacity. AvatarScale converts root-local displacement to world metres.'],

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
  function isFilePage() {
    try { return new URL(location.href).protocol === 'file:'; } catch { return false; }
  }
  function initialLocale() {
    let saved;
    const languages = [];
    try { saved = normalizeLocale(window.sessionStorage.getItem(LOCALE_STORAGE_KEY)); } catch { /* Restricted file/private storage. */ }
    // A file URL can lose its storage namespace when a legacy query is removed.
    // The current history entry keeps a manual choice across that entry's reload.
    if (!saved && isFilePage()) {
      try { saved = normalizeLocale(window.history.state?.[LOCALE_STORAGE_KEY]); } catch { /* Restricted history. */ }
      if (saved) try { window.sessionStorage.setItem(LOCALE_STORAGE_KEY, saved); } catch { /* History remains the file-page fallback. */ }
    }
    try { if (Array.isArray(navigator.languages)) languages.push(...navigator.languages); } catch { /* Unavailable preferences. */ }
    try { languages.push(navigator.language); } catch { /* Unavailable fallback preference. */ }
    return [saved, ...languages].map(normalizeLocale).find(Boolean) || 'en-US';
  }
  function clearLocaleQuery() {
    try {
      const url = new URL(location.href);
      if (url.searchParams.has('lang')) { url.searchParams.delete('lang'); window.history.replaceState(window.history.state, '', url); }
    } catch { /* A restricted file URL/history does not prevent switching. */ }
  }
  function rememberLocale(next) {
    next = normalizeLocale(next);
    if (!next) return;
    try { window.sessionStorage.setItem(LOCALE_STORAGE_KEY, next); } catch { /* In-memory choice still works. */ }
    if (isFilePage()) {
      try {
        const previous = window.history.state;
        const state = previous && typeof previous === 'object' ? previous : {};
        window.history.replaceState({ ...state, [LOCALE_STORAGE_KEY]: next }, '');
      } catch { /* In-memory and available session storage still work. */ }
    }
    clearLocaleQuery();
  }
  clearLocaleQuery();
  let locale = initialLocale();
  let state = Model.defaultsFor($('scene').value);
  let result, projection, selected = '', dragging = null, annotationRatio = 1;
  let threeView = null, threeUnavailable = false;
  let referenceKey = '', referenceSelection = '';
  const referenceCards = new Map();
  const text = pair => Array.isArray(pair) ? pair[locale === 'en-US' ? 1 : 0] : dictionary[pair]?.[locale === 'en-US' ? 1 : 0] ?? pair;
  const fmt = (value, digits = 3) => Number.isFinite(value) ? (Object.is(Number(value.toFixed(digits)), -0) ? 0 : value).toFixed(digits) : '—';
  const spatial = () => ['contact-sdk', 'sensa-sps', 'shader'].includes(state.scenario);
  function placeShaderDetails() {
    const shader = state.scenario === 'shader';
    $('workbench').classList.toggle('is-shader', shader);
    $('shader-technical').hidden = !shader;
    const destinations = shader ? [[$('metrics'), $('shader-statistics')], [$('explanation'), $('shader-statistics')], [$('encoding'), $('shader-encoded-preview')]]
      : [[$('metrics'), document.querySelector('.readout-panel')], [$('encoding'), document.querySelector('.readout-panel')], [$('explanation'), document.querySelector('.readout-panel')]];
    for (const [node, destination] of destinations) if (node.parentElement !== destination) destination.append(node);
    $('row-hint').textContent = text(shader ? 'shaderRowHint' : 'rowHint');
    $('values-meaning').textContent = text(shader ? 'shaderMeaning' : 'meaning');
  }
  const units = () => state.scenario === 'contact-sdk' ? 'm' : spatial() ? text(['本地单位', 'local units']) : 'm';
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
      else if (!spatial() || state.scenario === 'contact-sdk') { add(shape.a, shape.radius); add(shape.b, shape.radius); }
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
        const dx = Math.max(14, 11 * annotationRatio);
        const below = projection.iso ? i < 2 : i === 0 || i === 3;
        const dy = below ? Math.max(24, 20 * annotationRatio) : -Math.max(15, 12 * annotationRatio);
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
    $('projection-note').textContent = text(state.scenario === 'shader'
      ? projection.iso
        ? ['立体方框显示可编码的坐标范围；橙色点表示目标位置，编码保留完整 XYZ。', 'The 3D box shows the coordinate encoding range. The orange point locates the target, retaining full XYZ in the encoded measurement.']
        : ['绿色方框显示编码范围的 XZ 截面；橙色点表示目标位置，高度 Y 由滑条调整。', 'The green box shows the XZ section of the encoding range. The orange point locates the target; adjust height Y with its slider.']
      : projection.iso
      ? ['正交立体投影；球的投影半径保持同一比例。', 'Orthographic 3D projection; spheres retain the same radius scale.']
      : spatial() ? ['接收球轮廓是 XZ 投影；绿色区域为所选 Y 高度的切片，Y 仍参与全部距离计算。', 'Receiver outlines are XZ projections; green is a slice at the selected Y. Values use all XYZ components.'] : ['完整 XYZ 关系投影到 XZ 平面；Y 仍参与距离计算。', 'Full XYZ geometry projected onto the XZ plane; Y still contributes to distance.'])
      + ' ' + text(['橙色操作点为便于拖动而放大；灰色轮廓帮助辨认外形。单位：', 'The orange handle is enlarged for dragging; gray outlines identify the shapes. Units: ']) + units()
      + (state.scenario === 'sensa-sps' ? ' ' + text(['绿色展示当前 Y 高度的可测切片；彩色接收球轮廓是投影。', 'Green shows the measurable slice at the selected Y; colored receiver outlines are projections.']) : '')
      + (!spatial() ? ' ' + text(['此图 Socket +Z 朝外，yaw=0 时 Plug 朝向 −Z，便于观察入口与靠近方向。', 'Here Socket +Z points outward; at yaw=0 the Plug points toward −Z to show its approach to the entrance.']) : '');
  }
  function readouts() {
    $('values').replaceChildren();
    for (const value of result.values) {
      const row = document.createElement('tr'); row.dataset.name = value.name; row.classList.toggle('selected', selected === value.name);
      if (value.emitted === false) row.title = text(['未发送；仅展示编码计算', 'Not sent; encoding computation only']);
      const name = document.createElement('td'), button = document.createElement('button');
      button.type = 'button'; button.setAttribute('aria-pressed', String(selected === value.name));
      button.title = '/avatar/parameters/' + value.path;
      button.setAttribute('aria-describedby', selected === value.name ? 'path-assembly parameter-meaning' : 'path-assembly');
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
    const meaning = field?.meaning ? field.name + ' · ' + text(field.meaning) : text('rowHint');
    if ($('parameter-meaning').textContent !== meaning) $('parameter-meaning').textContent = meaning;
    if (field?.axisDistance !== undefined) add(['检测轴之间的最近距离', 'Nearest distance between detection axes'], fmt(field.axisDistance) + ' ' + units());
    if (m.centerDistance !== undefined) {
      add(['根部到入口的距离', 'Root-to-entrance distance'], fmt(m.centerDistance) + ' m');
      add(['两路读数估算的长度', 'Length estimated from both readings'], m.unsaturatedLengthEstimate === null ? '—' : fmt(m.unsaturatedLengthEstimate) + ' m');
      add(['按当前长度计算的进入参考', 'Entry reference using the selected length'], fmt(m.idealKnownLengthRadialRatio * 100, 1) + '%');
    }
    if (state.scenario === 'sensa-sps') {
      add(['当前位置在检测范围内', 'Target inside detection region'], text(result.coverage.containsTarget ? ['是', 'Yes'] : ['否', 'No']));
      add(['中心周围保守覆盖半径', 'Conservative coverage around center'], fmt(m.conservativeCoverageRadius) + ' ' + units());
      add(['算出的位置 X / Y / Z', 'Calculated X / Y / Z'], m.position ? ['x', 'y', 'z'].map(k => fmt(m.position[k])).join(' / ') : '—');
      add(['四路测量的吻合误差', 'Error between the four measurements'], fmt(m.residual, 6));
      add(['距上次更新 / 等待上限', 'Time since update / limit'], state.ageMs + ' / ' + m.sampleAgeLimitMs + ' ms');
      add(['持续更新 / 距离吻合', 'Updating / distances agree'], text(m.active ? ['是', 'Yes'] : ['否', 'No']) + ' / ' + text(m.fitValid ? ['是', 'Yes'] : ['否', 'No']));
      for (const shape of result.shapes.filter(s => s.id.startsWith('receiver-P'))) add(shape.id.slice(-2), ['x', 'y', 'z'].map(k => fmt(shape.center[k], 1)).join(' / '));
    }
    if (state.scenario === 'contact-sdk') {
      add(['选中自身 Sender', 'Selected self Sender'], text(m.selected ? ['是', 'Yes'] : ['否', 'No']));
      add(['可用 XYZ（米）', 'Usable XYZ (metres)'], m.position ? ['x', 'y', 'z'].map(k => fmt(m.position[k])).join(' / ') : '—');
      add(['距上次更新 / 等待上限', 'Time since update / limit'], state.ageMs + ' / ' + m.sampleAgeLimitMs + ' ms');
      add(['当前检测半径', 'Current detection radius'], fmt(m.worldRadius) + ' m');
    }
    if (state.scenario === 'shader') {
      add(['二维码格式', 'QR format'], 'Version 4 · H · 49 × 49');
      add(['本帧使用的黑白掩码', 'Selected mask'], String(m.qrMask));
      add(['每块纠错容量', 'Correction capacity per block'], text(['最多 8 个错误字节，或 16 个已知缺失字节', 'Up to 8 wrong bytes, or 16 known missing bytes']));
      add(['外围白边', 'White border'], text(['4 格静区 + 4 格位移余量', '4-cell quiet zone + 4-cell movement margin']));
      add(['编码前的位置 X / Y / Z', 'Position before encoding X / Y / Z'], ['x', 'y', 'z'].map(k => fmt(state[k])).join(' / '));
      add(['保存到图块的位置整数', 'Position integers stored in the code'], ['x', 'y', 'z'].map(k => m.encoded[k]).join(' / '));
      add(['还原的位置 X / Y / Z', 'Restored X / Y / Z'], ['x', 'y', 'z'].map(k => fmt(m.decodedPosition[k], 5)).join(' / '));
      add(['编码前后位置差', 'Position difference after encoding'], fmt(m.quantError.length, 7) + ' ' + units());
      add(['Sensa 接收等待上限', 'Sensa input timeout'], m.frameAgeLimitMs + ' ms');
      add(['图像停止更新后的等待时间', 'Time allowed without a new image'], m.bridgeFreezeThresholdMs + ' ms');
      add(['目标 X 轴向量 Right', 'Target X-axis vector Right'], ['x', 'y', 'z'].map(k => fmt(m.right[k])).join(' / '));
      add(['目标 Z 轴向量 Forward', 'Target Z-axis vector Forward'], ['x', 'y', 'z'].map(k => fmt(m.forward[k])).join(' / '));
      add(['根单位缩放 AvatarScale', 'Root-unit scale AvatarScale'], fmt(m.avatarScale) + ' m/unit');
      if (state.ageMs > m.bridgeFreezeThresholdMs) add(['桥接程序暂停位置更新', 'Bridge pauses position updates'], 'Valid=0');
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
      ? text(['信号已停更', 'Signal paused'])
      : text(m.valid ? ['位置可用', 'Position available'] : ['等待有效位置', 'Awaiting position'])
      : text(['模拟中', 'Simulation']);
    $('validity').dataset.tone = ownValidity && (!m.valid || state.scenario === 'shader' && state.ageMs > m.bridgeFreezeThresholdMs) ? 'bad' : 'good';
    if (ownValidity) $('validity').dataset.valid = String(m.valid); else delete $('validity').dataset.valid;
    $('explanation').textContent = text(scenes[state.scenario].explanation)
      + (state.scenario === 'shader' && !m.valid ? ' ' + text(['当前图像会报告 Valid=0；恢复有效更新后，位置继续参与计算。', 'This image reports Valid=0. Position participates again after valid updates resume.']) : '');
    $('formula').textContent = text(scenes[state.scenario].formula);
    $('assumptions').textContent = result.assumptions.map(a => locale === 'en-US' ? a.en : a.zh).join(' ');
    $('encoding').hidden = state.scenario !== 'shader';
    if (state.scenario === 'shader') {
      const encoding = Model.shaderEncoding, encoded = Model.encodeQr(result.metrics.bytes);
      const grid = $('bit-grid'), cellCount = encoding.width * encoding.height;
      grid.setAttribute('viewBox', `0 0 ${encoding.width * 16} ${encoding.height * 16}`);
      grid.dataset.mask = String(encoded.mask);
      if (grid.children.length !== cellCount) {
        const cells = document.createDocumentFragment();
        for (let screenRow = 0; screenRow < encoding.height; screenRow++) for (let column = 0; column < encoding.width; column++) {
          const cell = Model.encodedCell(column, encoding.height - 1 - screenRow);
          cells.append(svg('rect', { x: column * 16, y: screenRow * 16, width: 16, height: 16,
            'data-codeword': cell.codeword, 'data-block': cell.block, 'data-block-byte': cell.blockByte,
            'data-bit': cell.bit, 'data-region': cell.region, 'data-buffer': cell.buffer,
            'data-edge': String(!['data', 'ecc'].includes(cell.region)) }));
        }
        grid.replaceChildren(cells);
      }
      for (let screenRow = 0; screenRow < encoding.height; screenRow++) for (let column = 0; column < encoding.width; column++) {
        const qrX = column - encoding.quiet, qrY = screenRow - encoding.quiet;
        const white = qrX < 0 || qrY < 0 || qrX >= encoded.matrix.length || qrY >= encoded.matrix.length
          ? 1 : 1 - encoded.matrix[qrY][qrX];
        const cell = grid.children[screenRow * encoding.width + column];
        if (cell.dataset.value !== String(white)) {
          cell.dataset.value = String(white); cell.setAttribute('fill', white ? '#fff' : '#000');
        }
      }
      const facts = $('encoding-facts');
      facts.replaceChildren(...[['定位角标', 'Corner markers'], ['数据与纠错', 'Data and correction'], ['位移留白', 'Movement margin']].map(pair => {
        const chip = document.createElement('span'); chip.textContent = text(pair); return chip;
      }));
      $('crc').textContent = 'CRC32 ' + result.metrics.crc32.toString(16).toUpperCase().padStart(8, '0') + ' · ID 42';
    }
  }
  function parameterReferences() {
    // Descriptions are static for a parameter group. Preserve details state and
    // keyboard focus while pointer drags update the geometric values above.
    // 参数组说明保持静态；拖动只更新上方几何，保留展开状态和键盘焦点。
    const key = state.scenario + '|' + locale;
    if (referenceKey !== key) {
      referenceKey = key; referenceSelection = ''; referenceCards.clear();
      const cards = document.createDocumentFragment();
      const paragraph = (parent, value, testId) => {
        if (!value) return;
        const node = document.createElement('p'); node.textContent = value;
        node.dataset.testid = testId; parent.append(node);
      };
      for (const field of result.values) {
        const reference = window.SensaOscParameterReference?.lookup(field.path, locale);
        const card = document.createElement('details'); card.className = 'parameter-reference-card';
        card.dataset.testid = 'parameter-reference-card'; card.dataset.parameterName = field.name;
        card.dataset.referencePath = field.path;
        const summary = document.createElement('summary'), name = document.createElement('code');
        name.className = 'parameter-reference-name'; name.textContent = field.name; summary.append(name);
        if (reference?.title && reference.title !== field.name) {
          const title = document.createElement('span'); title.className = 'parameter-reference-subtitle';
          title.textContent = reference.title; summary.append(title);
        }
        card.append(summary);
        const body = document.createElement('div'); body.className = 'parameter-reference-body';
        paragraph(body, reference?.summary || text(field.meaning || ''), 'parameter-reference-summary');
        if (reference?.definition) {
          const label = document.createElement('h3'); label.textContent = reference.definitionLabel;
          label.dataset.testid = 'parameter-reference-definition-label'; body.append(label);
          paragraph(body, reference.definition, 'parameter-reference-definition');
        }
        const facts = document.createElement('dl'); facts.className = 'parameter-reference-facts';
        for (const [property, label, testId] of [
          ['range', 'parameterReferenceRange', 'range'], ['unit', 'parameterReferenceUnit', 'unit'],
          ['valueType', 'parameterReferenceType', 'type'],
        ]) {
          if (!reference?.[property]) continue;
          const fact = document.createElement('div'), term = document.createElement('dt'), value = document.createElement('dd');
          term.textContent = text(label); value.textContent = reference[property];
          value.dataset.testid = 'parameter-reference-' + testId; fact.append(term, value); facts.append(fact);
        }
        if (facts.childElementCount) body.append(facts);
        if (reference?.usage) {
          const heading = document.createElement('h3'); heading.textContent = text('parameterReferenceUsage'); body.append(heading);
          paragraph(body, reference.usage, 'parameter-reference-usage');
        }
        const sourceHeading = document.createElement('h3'); sourceHeading.textContent = text('parameterReferenceSources'); body.append(sourceHeading);
        const sources = document.createElement('ul'); sources.className = 'parameter-reference-sources';
        sources.dataset.testid = 'parameter-reference-sources';
        const fallbackDocument = spatial() ? 'osc-parameters' : 'ogb-compatibility';
        const references = reference?.sources?.length ? reference.sources : [{
          label: text(spatial() ? 'dictionary' : 'ogbSources'),
          url: 'https://github.com/SeaLoong/Sensa/blob/main/docs/' + fallbackDocument + (locale === 'en-US' ? '.en' : '') + '.md',
        }];
        for (const source of references) {
          if (!/^https:\/\//.test(source.url || '')) continue;
          const item = document.createElement('li'), link = document.createElement('a');
          link.href = source.url; link.textContent = source.label; link.target = '_blank'; link.rel = 'noreferrer';
          if (source.kind) item.dataset.sourceKind = source.kind;
          item.append(link); sources.append(item);
        }
        body.append(sources); card.append(body); cards.append(card); referenceCards.set(field.name, card);
      }
      $('parameter-reference-cards').replaceChildren(cards);
    }
    if (referenceSelection !== selected) {
      referenceSelection = selected;
      for (const [name, card] of referenceCards) card.dataset.selected = String(name === selected);
      const card = referenceCards.get(selected);
      if (card) card.open = true;
      $('parameter-reference-selection').textContent = text('parameterReferenceSelected') + selected;
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
    if (['contact-sdk', 'sensa-sps'].includes(state.scenario)) allowed.add('sample');
    if (state.scenario === 'contact-sdk') ['vx', 'vy', 'vz', 'proximitySpeed'].forEach(k => allowed.add(k));
    $('shader-components').hidden = state.scenario !== 'shader';
    if (state.scenario === 'shader') ['frame', 'rightX', 'rightY', 'rightZ', 'forwardX', 'forwardY', 'forwardZ', 'avatarScale'].forEach(key => allowed.add(key));
    for (const holder of document.querySelectorAll('[data-control]')) {
      const key = holder.dataset.control, input = $('control-' + key); holder.hidden = !allowed.has(key);
      if (['x', 'y', 'z'].includes(key)) {
        input.min = state.scenario === 'contact-sdk' ? '-2.3' : spatial() ? key === 'y' ? '-1.3' : '-2.3' : key === 'z' ? '-0.4' : '-0.6';
        input.max = state.scenario === 'contact-sdk' ? '2.3' : spatial() ? key === 'y' ? '3.3' : '2.3' : key === 'z' ? '1.2' : '0.6';
      }
      if (key === 'valid') input.checked = state.valid;
      else {
        input.value = key === 'sample' ? state.sample * 32 : state[key];
        const output = holder.querySelector('output');
        output.textContent = key === 'sample' ? Math.round(state.sample * 32) + '/32'
          : key === 'ageMs' ? state[key] + ' ms' : key === 'frame' ? String(state[key])
          : key === 'yaw' ? state[key] + '°' : fmt(state[key]) + (key === 'avatarScale' ? ' m/unit' : ['vx', 'vy', 'vz'].includes(key) ? ' m/s' : key === 'proximitySpeed' ? ' 1/s' : state.scenario === 'contact-sdk' ? ' m' : spatial() ? '' : ' ' + units());
      }
    }
    const receiverKey = $('receiver-key'); receiverKey.replaceChildren();
    receiverKey.classList.toggle('is-multiple', state.scenario === 'sensa-sps');
    if (state.scenario === 'sensa-sps') Model.anchorColors.forEach((_, index) => {
      const swatch = document.createElement('span'); swatch.className = 'anchor-key-color';
      receiverKey.append(tintAnchor(swatch, index));
    });
    $('control-ageMs').closest('label').querySelector('span').textContent = state.scenario === 'contact-sdk' ? text(['距 Sample 上次变化', 'Age since Sample changed']) : text('ageMs');
    $('control-valid').closest('label').querySelector('span').textContent = state.scenario === 'contact-sdk' ? text(['Sensa 生产端启用', 'Sensa producer enabled']) : text('valid');
    $('unit-note').textContent = state.scenario === 'contact-sdk'
      ? text(['位置以米表示，原点在 Avatar 根，轴随 Avatar 根旋转。绿色为单球可检测区域；Sample 检查生产端活动，速度变化保持独立。', 'Position uses metres, centered on the Avatar root with axes following its rotation. Green is single-sphere detection coverage. Sample checks producer activity; velocity changes remain independent.']) : state.scenario === 'shader'
      ? text(['坐标以 Avatar 根局部单位表示：X 左右、Y 高度、Z 前后。AvatarScale 提供每单位的世界米数；灰色框表示编码坐标范围。', 'Coordinates use Avatar-root local units: X side-to-side, Y height and Z front-to-back. AvatarScale gives world metres per unit; the gray box shows the encoded coordinate range.']) : spatial()
      ? text(['坐标相对 Avatar 根：X 左右、Y 高度、Z 前后；在作者缩放为 1 时单位对应米。绿色是检测范围，灰色框是允许的坐标边界。', 'Coordinates relative to the avatar root: X side-to-side, Y height, Z front-to-back. Units correspond to metres at authored scale 1. Green is detection coverage; the gray box is the coordinate limit.'])
      : ['socket-legacy', 'socket-touch'].includes(state.scenario)
      ? text(['VRCFury 自动区域按视点高度的 5% 生成。默认示例视点高 1.60 m，得到 D=0.08 m、Close 半径 0.032 m；调整 D 可模拟 Avatar 已填写的区域长度。', 'VRCFury generates the automatic region from 5% of view height. The example 1.60 m view height gives D=0.08 m and a 0.032 m Close radius. Adjust D to match an authored region length.'])
      : state.scenario === 'socket-modern'
      ? text(['SPS2 接收球半径为 VRCFury 的 1 m，Plug 根标记半径为 0.01 m。示例 Plug 长 0.20 m、半径 0.03 m；可按实际模型调整。', 'SPS2 uses VRCFury’s 1 m receiver radius and a 0.01 m Plug-root marker. The example Plug is 0.20 m long with a 0.03 m radius; adjust to your model.'])
      : state.scenario === 'zone'
      ? text(['Touch Zone 默认半径为 VRCFury 的 0.10 局部单位；此图以缩放 1 展示，调整半径可模拟实际触碰区。', 'Touch Zone starts with VRCFury’s radius of 0.10 local units, shown here at scale 1. Adjust the radius to match your touch region.'])
      : text(['尺寸按 VRCFury 生成规则计算。示例 Plug 长 0.20 m、半径 0.03 m；可按实际模型调整。胶囊高度包含两端半球。', 'Dimensions follow VRCFury generation rules. The example Plug is 0.20 m long with a 0.03 m radius; adjust to your model. Capsule height includes both rounded caps.']);
  }
  function localize() {
    document.documentElement.lang = locale; document.title = 'Sensa · ' + text('brand'); $('locale').value = locale;
    for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = text(node.dataset.i18n);
    $('scene-title').textContent = text(state.scenario); $('scene-summary').textContent = text(scenes[state.scenario].summary);
    const suffix = locale === 'en-US' ? '.en.md' : '.md', hosted = /^https?:$/.test(location.protocol);
    const siteRoot = document.querySelector('meta[name="sensa-site-root"]')?.content;
    for (const [selector, path] of [['.brand', 'osc-parameters'], ['#reference-link', 'osc-parameters'], ['#ogb-link', 'ogb-compatibility'], ['#position-link', 'positioning'], ['#position-topic', 'positioning'], ['#depth-topic', 'ogb-compatibility'], ['#touch-topic', 'ogb-compatibility']]) {
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
        $('projection-note').textContent = text(['拖动空白处旋转视角；橙色操作点放大显示，方便选取。单位：', 'Drag empty space to orbit; the orange handle is enlarged for easy selection. Units: ']) + units() + '. '
          + (state.scenario === 'sensa-sps' ? text(['绿色外形是四球共同可测区域；检测点附近的微小饱和区除外。', 'The green envelope is the shared measurable region, excluding tiny saturation regions near the anchors.'])
            : state.scenario === 'contact-sdk' ? text(['绿色球为单球覆盖；仅正接近值会选中目标。橙色点显示目标形状中点。', 'The green sphere shows single-sphere coverage; positive proximity selects a target. Orange marks its shape midpoint.'])
            : state.scenario === 'shader' ? text(['绿色方框表示坐标编码范围；桌面工具框选画面中的图块。位置一致时，输入点与解码点会重合。', 'The green box shows coordinate encoding bounds; select the image grid in the desktop tool. Input and decoded points overlap when their positions match.'])
              : text(['图中作者缩放为 1，灰色轮廓用于观察 Socket、Plug 与朝向。', 'Authored scale is one; gray outlines show Socket, Plug and direction.']));
      } catch { fallbackThree(); return; }
    } else { disposeThree(); draw(); }
    for (const hint of document.querySelectorAll('[data-i18n="dragHint"]')) hint.textContent = text(orbit ? 'orbitControls' : 'dragHint');
  }
  function render() {
    result = Model.evaluate(state);
    if (!result.values.some(v => v.name === selected)) selected = result.values[0]?.name || '';
    localize(); placeShaderDetails(); controls(); readouts(); parameterReferences(); drawView();
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
