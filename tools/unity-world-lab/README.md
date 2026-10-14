# Sensa 测试世界

两个世界场景统一使用浅灰白纯色地板。生成脚本也采用此配色；已有项目可用 **Tools → Sensa Lab → Use neutral grey-white floors** 更新材质，不改地面碰撞和场景布局。

现在主世界的物理实验架、入门测试球和新增原生 SPS 道具都有 **LEFT / RIGHT / PLACE / HOME** 控制：跟手、固定当前位置、回到原位。原生 SPS 区在出生点左侧 **08 MY AVATAR SPS**，可直接与自己的 Avatar 交互。琥珀色 Plug 对 Avatar Socket；蓝框 Socket 对 Avatar Plug。道具还可直接拿取；抓取后会退出按钮跟手模式。

定位采样显示为 **四点探针 P1–P4** 或 **八点探针 C1–C8**，不是设备输出轴。同一布局内第一到第四个颜色为红、蓝、绿、黄，世界小球、标签、条形图与 Sensa 参数工作台一致。标记是接收器中心，不表示接收范围。两种布局的原始 OSC 字段均从 A0 开始，但空间位置不同；TCode 辅助输出 A0/A1/A2 属于另一层。

更新入口 **Tools → Sensa Lab → Upgrade interactive targets and probe labels**。主场景和几何场景均会增加标记；已有目标位置不会重置。验证记录在 `Validation/interaction/world.json`，其中跟手、玩家移开后放置保持、回原位通过 ClientSim 实际 Udon 测试；Avatar OSC 与真实 VR 抓取需在客户端验收。

**新用户请先打开 `Assets/SensaLab/Functional/FunctionalLab.unity`，使用出生点旁的 `00 START HERE`。** 它直接刺激访问者自己 Avatar 的入门接收器，由 VRChat 发 OSC 给 Sensa。组件安装、预设、OSR 连接和预期数值见 [首次使用指南](https://github.com/SeaLoong/Sensa/blob/main/docs/quick-start.md)。无需图像桥接。

该台默认停止；提供五档阶梯、右手腕靠近可拾取测试球、停止和复位。每次操作最多运行 60 秒，离开 3 米或更换 Avatar 会关闭门控。面板标记 Expected，实际接收与输出要在 Sensa 确认。SDK ClientSim 的世界读数不能替代客户端 Avatar OSC 测试。

更新已有功能世界：先运行安装脚本，再选择 **Tools → Sensa Lab → Add first-run avatar bench**（只新增一次，不覆盖已有台）。自动验证入口 `SensaLab.QuickStartValidation.Run` 生成 `Validation/quick-start/results.json` 和 `bench.png`，验证实际 Udon、SDK Proximity、Stop 与过期状态。结果使用世界内参考接收器，不冒充上传 Avatar 的结果。

**按系统测试请先看[能力矩阵与 Sensa 联动](CAPABILITIES.md)**，打开 `Assets/SensaLab/Functional/FunctionalLab.unity`。下面的 11 站是另一个几何边界回归场景。

这里可以先体验位置测量、PB 手柄和几何异常，不需要连接输出设备。世界不会自动给 Sensa 或硬件发送运动。

## 进入世界

本地项目：`D:/VRChatProjects/Sensa Test World`。使用项目指定的 Unity 打开 `Assets/SensaLab/Generated/SensaLab.unity`，进入 Play Mode / ClientSim。

可以走动、跑动和跳跃；使用客户端当前绑定的移动/跳跃键。出生点前方是基础实验，继续向前是三排编号测试台。VR 中靠近球体抓取，桌面模式按客户端的拾取提示操作。

**在 ClientSim 中不能动？** 先关闭 ClientSim 菜单，再点击 Game 视图让它获得输入焦点。默认桌面按键为 WASD 移动、Shift 跑动、Space 跳跃；修改过绑定时以客户端为准。出生点右侧有 20 cm 和 40 cm 台阶可试跳。

## 每张测试台怎么用

- **白球**：抓取并移动，观察坐标和探针 P1–P4 变化。
- **蓝色 RESET**：放下球并恢复初始位置。
- **白色 PAUSE**：冻结/恢复读数；暂停时显示 PAUSED。
- **橙色 MISSING P4**：切换第四个探针缺采样，观察无效状态，再复位。

按钮位于约腰部高度，看板位于前方。白球的显示/抓取尺寸是为了容易操作，不等于测量 Sender 的半径。

| 数据 | 怎么理解 |
| --- | --- |
| Truth | 世界内可读取的参考局部坐标 |
| Decoded | 从四路距离重建的位置 |
| P1–P4 条形图 | 近接值；颜色固定对应探针，缺失为空条；是否有效看 Decoded/INVALID |
| RMS | 拟合一致性，不是实际精度保证；无法拟合时显示 n/a |
| 绿色/红色连线 | 当前位置有效/无效 |
| EXPLORING | 你已改变初始条件；复位后再检查基准 |

## 可以测试什么

| 编号 | 用例 | 初始预期 |
| --- | --- | --- |
| 01 | 正面位置 | 有效 |
| 02 | 背面、负 Z | 有效，不应镜像 |
| 03 | 横向偏移 | 有效 |
| 04 | 超出接触范围 | 无效 |
| 05 | 接收器饱和 | 无效 |
| 06 | 错误 Sender 半径 | 无效 |
| 07 | 统一缩放 2 倍 | 局部坐标仍一致 |
| 08 | 旋转参考系 | 局部坐标仍一致 |
| 09 | 缺 P4 | 无效，切换后可观察恢复 |
| 10 | 超出解算范围 | 无效，即使四路仍有值 |
| 11 | 参考原点 | 有效，接近零 |

左前方另有 PB 手柄站，可观察抓取、拉伸和四路采样。中央站展示移动标记与 GPU 编码回读；SPS2 站用于观察形变模型。相机输出实验默认关闭，只在了解其用途后单独开启。

## 验证与限制

菜单 **Tools → Sensa Lab → Run Play Mode validation (straight)** 会自动检查当前场景；结果和截图写入项目的 `Validation` 文件夹。它会结束 Play Mode，日常体验直接进入 Play Mode 即可。

其中 `playability-layout.json` 检查按钮高度、地面和站立空间；`locomotion-playmode.json` 记录通过 ClientSim 测试输入驱动真实控制器的移动距离和跳跃高度。自动验证会关闭模拟器菜单，不等于真实键盘、VR 手柄或已上传世界的体验测试。

世界测量不等于头像 OSC、远端玩家身份或真实设备测试。对象按本地交互设计，未加入多人同步。Shader 读到的是模型曲线，不是最终网格的全部效果。

[搭建、自动验证和开发参考](DEVELOPMENT.md)
