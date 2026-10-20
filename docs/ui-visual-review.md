# 参数图解与 WebUI 视觉评审

**简体中文** | [English](ui-visual-review.en.md)

日期：2026-10-21。本轮为 OGB、固定 P0–P3 和 Shader 增加离线交互图解与真实 Three.js 视图，沿用 TDesign 配色、扁平布局和常用控件比例。代码助手依据 [V1–V6](ui-quality.md)逐张审图，没有参与者问卷、综合审美分或用户偏好结论。本记录替换上一轮当前状态描述；原应用 70 图的[历史评审](https://github.com/SeaLoong/Sensa/blob/33ea842f9367d63cc10f4f6a2a413f40cd8d9be9/docs/ui-visual-review.md)保留在固定提交中。

## 证据与接受范围

- 生成源码：`44e63a6f561aa6eaf0d0f0555cbecfad6965e55c`；[成功候选 39451877629](https://github.com/SeaLoong/Sensa/actions/runs/39451877629) 的 `e2e-report`／`e2e-baselines`。
- 58 次执行全部首次通过，零跳过、重试通过、失败或运行错误。接受 **98 张 PNG**，1280×900 与 390×844 各 49 张；原应用 70 图逐字节不变。
- 逐张复评 28 张新增图：现代 Socket、旧 Socket、Plug Touch、Sensa SPS、Shader 的中英文 XZ 图共 20 张；SPS／Shader 的中英文可旋转视图共 8 张。另逐张审阅四张英文立体 SVG 诊断图，保留在报告附件，不是基线。
- 已接受图固定于 `38a2dd2a29b5445ad228851958c25eff525d690b`。失败或被替代候选的图片均未接受。截图生成使用 `updateSnapshots=all`，不提供预发布所需的同 SHA 普通比较证明。
- 浏览器与截图只在 Actions 执行。旋转视图使用独立软件 WebGL2 worker 池，其他应用用例保持原浏览器配置。

## 发现、修改与复评

| 准则 | 本轮调整 | 已见结果 |
| --- | --- | --- |
| V1 层级与传达 | 场景／投影在上，图形与读数并列，几何控制在下；解释放在次要区域 | 先看形状，再查对应参数；原始值、模型门控与真实运行时明确区分 |
| V2 字体与数字 | SVG 按实际屏幕比例设置文字，3D 使用 12 px HTML 标签；数字等宽 | 轴、半径、P0–P3 可读，Sample 的 0.03125 完整；量化误差没有冒充准确度 |
| V3 分组与留白 | 共用一组图形／读数，窄屏顺序重排；相机按钮独立成组 | 七个相机按钮与 XYZ 调整职责清楚；SPS 大范围球和参考立方体仍有层次 |
| V4 色彩与含义 | 蓝色 Receiver、橙色移动 Sender／输入、灰色参考；文字标注状态 | 高亮行关联形状；有效、失效和回退不只依赖颜色，Shader 明确没有 Contact 半径 |
| V5 对齐与几何 | 分离轴标签与 Socket 外形；修正半圆 SVG 数值误差；滑条行共享底边；相机按真实包围范围和视口拟合 | 严格胶囊尺寸断言保留；默认／复位的 Shader 盒体不再裁掉底角；两视口无主要标签冲突 |
| V6 双语与窄屏 | 中英文代表场景逐张审阅；320 px 自动检查实际文字、控件边界与视锥 | 390 px 已审完整构图；自动重排无整页横向溢出，相邻滑条底边差为 0 |

早期审图发现小字、坐标轴压住外形及滑条错行，逐项修正。首版真实 3D 的 Shader 默认视角裁掉底前角，后按真实几何范围及较窄视场计算相机距离；窄屏 resize 保持方向和相对缩放。最终中英文 Shader 的八角／十二边完整入镜；SPS 四锚点、局部原点、移动标记、三轴及 R=2.500 标签仍清楚。用户主动放大允许裁切，完整入镜要求针对默认构图。

| 代表画面 | 桌面 | 窄屏 |
| --- | --- | --- |
| Socket Root／Tip | [中文](https://github.com/SeaLoong/Sensa/blob/38a2dd2a29b5445ad228851958c25eff525d690b/tests/e2e/__screenshots__/desktop/parameter-geometry-socket-modern-zh-CN.png) | [英文](https://github.com/SeaLoong/Sensa/blob/38a2dd2a29b5445ad228851958c25eff525d690b/tests/e2e/__screenshots__/mobile/parameter-geometry-socket-modern-en-US.png) |
| 固定四点 3D | [英文](https://github.com/SeaLoong/Sensa/blob/38a2dd2a29b5445ad228851958c25eff525d690b/tests/e2e/__screenshots__/desktop/parameter-geometry-sensa-sps-orbit-en-US.png) | [中文](https://github.com/SeaLoong/Sensa/blob/38a2dd2a29b5445ad228851958c25eff525d690b/tests/e2e/__screenshots__/mobile/parameter-geometry-sensa-sps-orbit-zh-CN.png) |
| Shader 3D | [英文](https://github.com/SeaLoong/Sensa/blob/38a2dd2a29b5445ad228851958c25eff525d690b/tests/e2e/__screenshots__/desktop/parameter-geometry-shader-orbit-en-US.png) | [中文](https://github.com/SeaLoong/Sensa/blob/38a2dd2a29b5445ad228851958c25eff525d690b/tests/e2e/__screenshots__/mobile/parameter-geometry-shader-orbit-zh-CN.png) |

## 功能与工程证据

离线用例直接打开文件，验证无网络／WebSocket、完整 XYZ 计算、真实 SVG 尺寸、鼠标／键盘与独立逆投影、失效读数和双语保留状态；应用用例验证参数详情打开本地化图解，且不启用输入或发送设备命令。

真实 WebGL2 检查非背景像素、零 GL 错误、实际球／边框几何及矩阵。P0–P3 与 R=2.5、专用 Sender r=0.001 均与模型一致；Shader 仅有边长 3、中心 (0,1,0) 的编码范围，没有 Sender／Receiver。独立逆矩阵计算核对八角视锥：默认最大 |NDC| 为 Shader 0.8345 以下、SPS 0.6194 以下，320 px 分别小于 0.7434／0.5554；均满足约定的 |NDC|≤0.9 边界。

指针、键盘、滚轮及按钮改变真实相机，参数不变；复位恢复位置及四元数。三轮切换的几何数量稳定，离开视图或上下文丢失后无活动实例；禁用 WebGL2 和受控丢失上下文均回退 SVG，滑条与读数继续可用。320 px 两项目共 40 个 SVG 场景／语言样本、88 组同排滑条以及 16 组 3D 滑条均通过。它们是工程断言，不是逐态人工审美结论。

原应用质量报告仍为 40 个 axe 状态，选定规则子集零检测违规；64 项行为及四项扫描期间不启用输入检查通过，无缺失、fatal 或运行错误。**56 次 incomplete 节点出现**完整保留（跨状态重复）：label 32 次、contrast 24 次，目标指纹与先前一致，未因人工可读性判断而清除。

## 范围与限制

人工结论限上述 28 张初始模拟图及四张英文立体诊断图。其余五场景有自动功能／重排检查，未逐张完整视觉评审；320 px 是自动重排，不是真实 400% 缩放。自由旋转全过程、所有失效帧、系统高对比、其他浏览器、读屏及实体手机触控仍未评估。

应用正文在常驻顶栏下独立滚动；独立图解按普通文档滚动。图片不证明视口外、横表右侧或折叠内容。原应用通知可关闭，但可能短暂遮住底部次要内容；原根点流程英文未逐态截图，校准也未单列 axe 状态。应用 40 状态扫描不覆盖新增独立图解，不能外推为整站 WCAG 结论。

模型展示使用当前几何契约；像素证据是这份本地图解的 WebGL 渲染，编码网格是计算示意。没有执行真实 Unity 生产端、VRChat Contacts／OSC 会话、桌面／HMD 编码捕获、实时 GPU 解码或用户设备动作；它们不证明坐标准确度或真实采集可用性。效果与限制见[使用方案](usage-scenarios.md)、[参数字典](osc-parameters.md)、[OGB 兼容](ogb-compatibility.md)及[定位](positioning.md)。

普通 main CI 必须关闭基线更新，在最终提交比较全部 98 图并完成必要产品 jobs，成功后才可自动预发布。生成候选不能替代这项证明。[验证流程](e2e.md)
