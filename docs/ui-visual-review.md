# 可拖动参数图解与 WebUI 视觉评审

**简体中文** | [English](ui-visual-review.en.md)

日期：2026-10-21。本轮将全部十个测量场景扩展为可操作三维图，保留 TDesign 配色与扁平布局。代码助手按 [V1–V6](ui-quality.md)审阅 CI 图片，没有参与者问卷、综合审美分或偏好结论。前一组 98 图的[历史记录](https://github.com/SeaLoong/Sensa/blob/9ffca1ea6361aad4ca9d7b53e8b96a1e86038142/docs/ui-visual-review.md)保留在固定提交，本页描述当前接受集。

## 证据与范围

- 生成源码：`7096282a24cc2c68e363d70accd56cd3ac0fd6ee`；[成功候选 39467342379](https://github.com/SeaLoong/Sensa/actions/runs/39467342379) 的 `e2e-report`／`e2e-baselines`。
- 58 次执行全部首次通过，零跳过、重试通过、失败或运行错误。接受 **110 张 PNG**，1280×900 与 390×844 各 55 张；原应用 70 图逐字节不变。
- 参数图共 40 张：现代 Socket、旧 Socket、Plug Touch、Sensa SPS、Shader × 双语 × XZ／可旋转三维 × 两视口。首轮逐张审阅，后续按字节比对继承同图、对变化图复评；另审阅四张英文立体 SVG 诊断图，它们是附件而非基线。
- 当前图片固定于 `da2ca1e779fe73054440d6d97f550a2222c6e49a`。先前诊断候选没有接受；最终三维代表图复位目标参数并明确选择 XZ 移动平面。生成时 `updateSnapshots=all`，不能替代最终提交的普通比较。
- 浏览器与截图只在 Actions 执行。独立文件图解用例共用软件 WebGL2 worker 池，应用用例保留原浏览器配置；图解没有 OSC、网络或设备连接。

## 发现与复评

| 准则 | 本轮调整 | 已见结果 |
| --- | --- | --- |
| V1 层级与含义 | 图形、读数、调整区保留清楚先后；读数上方突出 `Sensa/SPS/*` 等前缀 | 说明将 * 替换为实际实例后再接行名；完整示例地址在参数按钮标题中，不把星号当实际参数 |
| V2 字体与数字 | 3D 标签保持 12 px 屏幕字；数值等宽；四锚点选中态用浅白实心底与同色细描边 | P0–P3 可辨，四种选中文字的实际计算对比度均高于 4.79；这项检查不等于全站合规 |
| V3 分组与操作 | 场景、投影、移动平面和复位同组；相机按钮另组 | 拖橙色目标改变坐标，拖空白旋转相机；390 px 两个选择器与复位同排 |
| V4 色彩与身份 | P0 蓝、P1 青绿、P2 紫、P3 玫红，贯穿球、标记、尺寸、表格色点及坐标说明 | 参数与锚点一致；名称和状态文字仍可独立辨认，普通 Sender 保持橙色 |
| V5 外形与标注 | Socket 用带开口的中空旋转截面，Plug 用渐细圆头；以实际实体投影避让文字，并用细引线连接偏移标注 | 现代场景杯口与灰 Plug 不再被文字遮住；Tip 引线连到真正 Plug 端点，不因靠近 Socket 而误指 |
| V6 双语与窄屏 | 双语代表画面与 320 px 自动重排；保留同排控件底边、完整前缀与数字 | 已审画面没有新增主要裁切或标签冲突；Shader 盒体完整，SPS 四点及读数清楚 |

初版三维标注盖住了小杯口和部分 Plug。先用真实 Lathe 包围盒八角的屏幕投影避让文字；复评又发现现代英文 Tip 文字距真实端点约 63 px，Socket 夹在中间，单纯移开仍会误认。最终只对偏移的实体根点／端点标注补细引线与参考点，不改几何比例、测量或页面布局。小型 OGB 实体与大 Receiver 按同一比例展示，可用相机缩放细看；旧场景默认 Plug 已进入 Socket，不能据该默认姿态声称整个内壁都可见。

| 代表画面 | 桌面 | 窄屏 |
| --- | --- | --- |
| Socket／Plug 三维 | [英文](https://github.com/SeaLoong/Sensa/blob/da2ca1e779fe73054440d6d97f550a2222c6e49a/tests/e2e/__screenshots__/desktop/parameter-geometry-socket-modern-orbit-en-US.png) | [中文](https://github.com/SeaLoong/Sensa/blob/da2ca1e779fe73054440d6d97f550a2222c6e49a/tests/e2e/__screenshots__/mobile/parameter-geometry-socket-modern-orbit-zh-CN.png) |
| 四锚点三维 | [英文](https://github.com/SeaLoong/Sensa/blob/da2ca1e779fe73054440d6d97f550a2222c6e49a/tests/e2e/__screenshots__/desktop/parameter-geometry-sensa-sps-orbit-en-US.png) | [中文](https://github.com/SeaLoong/Sensa/blob/da2ca1e779fe73054440d6d97f550a2222c6e49a/tests/e2e/__screenshots__/mobile/parameter-geometry-sensa-sps-orbit-zh-CN.png) |
| Plug Touch | [中文](https://github.com/SeaLoong/Sensa/blob/da2ca1e779fe73054440d6d97f550a2222c6e49a/tests/e2e/__screenshots__/desktop/parameter-geometry-plug-touch-orbit-zh-CN.png) | [英文](https://github.com/SeaLoong/Sensa/blob/da2ca1e779fe73054440d6d97f550a2222c6e49a/tests/e2e/__screenshots__/mobile/parameter-geometry-plug-touch-orbit-en-US.png) |

## 交互与工程证据

鼠标实际拖动覆盖 XZ、XY 两平面：独立射线／平面反算与 DOM 步长／范围得到 (0.19,1,0.29)、(0.33,1.11,0.29)，限界样本为 (1.8,1.19,0.29)。真实目标、Sender 与四路近接读数一致，锁定轴及相机不变；背景拖动、键盘、滚轮、按钮和复位仍控制相机。Escape 和切场景结束捕获，不续写旧手势。YZ 另有独立矩阵数学往返检查，未单列真实鼠标流程。

真实 WebGL2 像素非空、GL 错误为零。十个场景的球／胶囊／盒体、Lathe 表面、材料色和矩阵与模型一致；改变 L／W／D 后几何更新。实体不参与 Contact 计算，严格胶囊 BBox 5.5 精度 4 断言继续通过。标签避让独立核对实际矩阵投影和 DOM 边界；引线检查读取真实 SVG／CTM，核对起点、对应标签边缘、方向和可见性，不读取实现端的成功标志。

三轮切换的几何与纹理数量稳定，仅一个活动实例；退出或上下文丢失后为零。WebGL2 不可用／丢失均回退 SVG，滑条与读数继续可用。两种呈现的 320 px 检查各覆盖十场景×双语，整页宽度保持 320，同排滑条无底边漂移；SPS／Shader 八角仍满足 |NDC|≤0.9 的默认／窄屏边界。SVG 正文约 11 px、轴约 10 px，三维 HTML 标签 12 px。

原应用质量报告为 40 个 axe 状态，选定规则子集零检测违规；64 项行为与四项扫描期间不启用输入检查通过。**56 次 incomplete 节点出现**仍保留（跨状态重复）：label 32、contrast 24，目标指纹没有增减。四锚点文字色值检查不能清除这些待审项。

## 限制

人工视觉结论限上述五个代表场景的双语 XZ／三维和四张英文立体诊断图；其他五场景有自动几何与重排检查，未逐态完整审图。320 px 是自动重排，不是真实 400% 缩放或实体手机。任意视角、主动深度放大、所有无效帧、读屏、系统高对比与其他浏览器尚未全面评估；放大可能裁切，空间不足时标注使用有限回退。

图解是普通文档滚动，应用正文在常驻顶栏下独立滚动。截图不证明视口外列、折叠内容或全部表单。原应用通知可关闭，但可能短暂遮住底部次要内容；原根点流程英文未逐态截图，校准未单列 axe 状态。40 个应用扫描不覆盖独立图解，不能外推完整 WCAG 结论。

灰色实体是共享截面示意，不是导入的 Avatar 网格。根坐标不是姿态或世界位置，编码分辨率不是实测精度。本轮未运行真实 Unity 生产端、VRChat Contacts／OSC 会话、桌面／HMD 编码捕获、实时 GPU 解码或用户硬件；浏览器 WebGL 和模拟线包不提供这些证明。见[参数字典](osc-parameters.md)、[OGB 兼容](ogb-compatibility.md)及[定位原理](positioning.md)。

普通 main CI 必须关闭基线更新，在最终提交比较全部 110 图。只修改图解时按影响计划运行接口与浏览器检查；无待接续产品验证时不触发原生构建或预发布。[验证流程](e2e.md)
