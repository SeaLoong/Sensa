# 合成相机原型

**简体中文** | [English](CAMERA-PROTOTYPE.en.md)

保留的实验室原型**不是**组件包当前单相机原生 SPS 根生产端。它绘制合成测试图案，不要求 Udon 或任意 Avatar 运行时脚本。

`Generated/CameraOnlyPrototype.prefab` 默认不活动。私有相机写入 256×128 RenderTexture，另一呈现相机读取它并尝试绘制固定桌面视口。Shader 序号只是测试时钟，不证明源数据新鲜；层／相机签名与 None-eye 是工程限制，不证明 HMD 完全不可见。

世界第三个方块控制本原型，另一方块控制不同的 Udon 输出实验；一次只测一种。分别检查桌面和 VR 双眼的多余输出、滞后、窗口缩放、镜面、转身和关闭结果。

**Tools → Sensa Lab → Export camera-only prototype** 导出实验 unitypackage 到独立 Avatars 工程。保持关闭且本地，不要把 Worlds SDK／Udon 混入该工程。它不代替[原生根捕获与注册](../../unity/top.sealoong.sensa/GPU-TRACKING.md)。

历史编辑器渲染／CRC 结果不等于上传客户端保留、PCVR 隔离或外部捕获时序。发布 CI 的单元、浏览器与原生模拟检查不覆盖本原型的 Unity 渲染或 PlayMode；原型需要另外检查。

[世界安装与语言](README.zh-CN.md) · [传输](CAPABILITIES.md)
