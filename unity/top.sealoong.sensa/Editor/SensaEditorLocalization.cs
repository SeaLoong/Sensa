using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Reflection;
using System.Runtime.CompilerServices;
using UnityEditor;
using UnityEngine;

[assembly: InternalsVisibleTo("UnityBox.Sensa.Tests")]

namespace UnityBox.Sensa
{
    /// <summary>Editor presentation only. Never changes serialized names, OSC paths or avatar state.</summary>
    public static class SensaEditorLocalization
    {
        public const string PreferenceKey = "top.sealoong.sensa.editor-language";
        public const string Automatic = "auto";
        public const string English = "en-US";
        public const string SimplifiedChinese = "zh-CN";

        // Injectable boundaries let EditMode tests use memory, never the user's EditorPrefs.
        internal static Func<string> ReadPreference = () => EditorPrefs.GetString(PreferenceKey, Automatic);
        internal static Action<string> WritePreference = value => EditorPrefs.SetString(PreferenceKey, value);
        internal static Func<SystemLanguage?> ReadEditorLanguage = DetectEditorLanguage;
        internal static Func<SystemLanguage> ReadSystemLanguage = () => Application.systemLanguage;

        public static string Locale
        {
            get
            {
                var preference = ReadPreference();
                if (!string.IsNullOrEmpty(preference) && !string.Equals(preference, Automatic, StringComparison.OrdinalIgnoreCase))
                    return NormalizeLocale(preference);
                return ResolveLocale(preference, ReadEditorLanguage(), ReadSystemLanguage());
            }
        }

        public static string ResolveLocale(string preference, SystemLanguage? editorLanguage, SystemLanguage systemLanguage)
        {
            if (!string.Equals(preference, Automatic, StringComparison.OrdinalIgnoreCase) && !string.IsNullOrEmpty(preference))
                return NormalizeLocale(preference);
            // A known unsupported editor UI language still takes precedence over a Chinese OS.
            return FromSystemLanguage(editorLanguage ?? systemLanguage);
        }

        public static string NormalizeLocale(string language)
        {
            var value = (language ?? "").Replace('_', '-');
            return value.Equals("zh", StringComparison.OrdinalIgnoreCase) || value.StartsWith("zh-", StringComparison.OrdinalIgnoreCase)
                ? SimplifiedChinese : English;
        }

        public static string FromSystemLanguage(SystemLanguage language) =>
            language == SystemLanguage.Chinese || language == SystemLanguage.ChineseSimplified || language == SystemLanguage.ChineseTraditional
                ? SimplifiedChinese : English;

        public static void SetPreference(string preference)
        {
            WritePreference(string.Equals(preference, Automatic, StringComparison.OrdinalIgnoreCase) ? Automatic : NormalizeLocale(preference));
        }

        // Unity's actual UI language API is internal. Reflection is confined to this Editor assembly.
        // https://github.com/Unity-Technologies/UnityCsReference/blob/2022.3/Modules/LocalizationEditor/LocalizationDatabase.bindings.cs
        private static readonly Type LocalizationType = typeof(Editor).Assembly.GetType("UnityEditor.LocalizationDatabase")
            ?? AppDomain.CurrentDomain.GetAssemblies().Select(assembly => assembly.GetType("UnityEditor.LocalizationDatabase")).FirstOrDefault(value => value != null);
        private const BindingFlags LocalizationFlags = BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic;
        private static SystemLanguage? DetectEditorLanguage() => ReadEditorLanguageFrom(LocalizationType);
        internal static SystemLanguage? ReadEditorLanguageFrom(Type type)
        {
            try
            {
                if (type == null) return null;
                var enabled = type.GetProperty("enableEditorLocalization", LocalizationFlags);
                if (enabled != null && enabled.GetValue(null) is bool active && !active) return SystemLanguage.English;
                var language = type.GetProperty("currentEditorLanguage", LocalizationFlags)?.GetValue(null);
                return language is SystemLanguage value ? value : (SystemLanguage?)null;
            }
            catch (Exception) { return null; } // API unavailable: use the system language, then English.
        }

        internal static readonly Dictionary<string, string> Chinese = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            { "Contact direct tracking (SDK Beta) uses one dedicated Sender and Receiver per root. It reports avatar-root axes in metres and requires SDK advanced proximity parameters. To track a bone/Transform, Sensa component or native Contact directly, use the Contact direct tracking (SDK Beta) prefab.", "Contact 直接定位（SDK Beta）为每个根点生成专用 Sender 和 Receiver，按 Avatar 根坐标轴报告米制坐标，需要 SDK 高级接近参数。直接测量骨骼／Transform、Sensa 组件或原生 Contact 时，请使用 Contact 直接定位（SDK Beta）预制件。" },
            { "Sensa authoring components still need processing. Enable NDMF processing and place Sensa authoring prefabs on the avatar before building: ", "Sensa 配置组件尚待构建处理。请启用 NDMF 处理，并将 Sensa 配置预制件放在当前头像下： " },
            { "Contact collision tags", "接触标签" },
            { "Collision channel (optional)", "碰撞通道（选填）" },
            { "Socket range (axis units)", "Socket 量程（轴局部单位）" },
            { "Root target: Avatar bone/marker Transform, SPS Socket/Plug, Sensa component or native Contact.", "根点目标：头像骨骼或标记的 Transform、SPS Socket／Plug、Sensa 组件或原生 Contact。" },
            { "Leave empty to derive a dedicated channel from the unique instance name. Set an explicit unique channel when needed.", "留空时按唯一实例名自动分配专用通道；需要指定通道时填写头像内唯一的名称。" },
            { "Track the chosen bone, marker, SPS component, Sensa component or Contact root with four fixed receivers. Radius is 2 Avatar-root authored units; at root scale 1 this is 2 m. Green scene slices show common coverage. Keep the target outside the tiny orange saturation zones.", "选择骨骼、标记、SPS、Sensa 组件或 Contact 根点，使用四个固定接收器测量位置。半径按 Avatar 根坐标系的局部单位设为 2；根对象缩放为 1 时对应 2 米。绿色截面显示共同可测区域，请将目标保持在橙色微小饱和区之外。" },
            { "Choose a bone, marker, SPS component, Sensa component or native Contact as the root. A dedicated Sender and Receiver report position in avatar-root axes (m) and relative contact-point velocity (m/s). Sample indicates publishing activity. Verify parameter delivery and motion in the client.", "选择骨骼、标记、SPS、Sensa 组件或原生 Contact 作为根点。专用 Sender 和 Receiver 按 Avatar 根坐标轴报告位置（米）与接触点相对速度（米／秒）。Sample 的变化表示参数仍在持续发送，请在客户端核对参数到达和运动响应。" },
            { "Choose a root target: a bone, marker, SPS component or Contact.", "请选择根点目标：骨骼、标记、SPS 组件或 Contact。" },
            { "Choose a Transform, Sensa component, SPS component or native Contact as the root target.", "请选择 Transform、Sensa 组件、SPS 组件或原生 Contact 作为根点目标。" },
            { "{0}: root {1:F3}, length {2:F3}\n", "{0}：根点 {1:F3}，长度 {2:F3}\n" },
            { "{0}: root {1:F3}\n", "{0}：根点 {1:F3}\n" },
            { "Install the complete Sensa package: the authoring prefab is missing.", "缺少作者预制件，请安装完整的 Sensa 组件包。" },
            { "Choose an unused Shader producer ID from 1–65535.", "请选择 1–65535 范围内尚未使用的 Shader 生产端 ID。" },
            { "Avatar bone/Transform, SPS Socket/Plug, Sensa Component or native Contact root.", "头像骨骼／Transform、SPS Socket／Plug、Sensa 组件或原生 Contact 根点。" },
            { "Choose an explicit root target; the saved SPS object must contain exactly one Socket or Plug.", "请选择明确的根点目标；沿用已保存的 SPS 对象时，该对象须包含一个 Socket 或 Plug。" },
            { "Choose a root target inside this avatar.", "请选择当前头像内的根点目标。" },
            { "Choose a producer ID from 1–65535.", "请选择 1–65535 范围内的生产端 ID。" },
            { "A Shader root capture with this producer ID already exists.", "此生产端 ID 已用于一个 Shader 根点捕获，请选择独立 ID。" },
            { "Root position code", "根点位置编码" },
            { "Install the complete Sensa package: the native root shader asset is missing.", "缺少原生根点 Shader 资源，请安装完整的 Sensa 组件包。" },
            { "Assign a depth axis on this avatar before building.", "构建前请指定当前头像上的深度轴。" },
            { "Assign tip and root bones on this avatar before building.", "构建前请指定当前头像上的尖端与根部骨骼。" },
            { "Maximum range along +Z in the selected axis local units. At scale 1, one unit is one metre.", "沿所选轴 +Z 方向的最大量程，按该轴的局部单位填写；缩放为 1 时，一个单位对应一米。" },
            { "Socket range in the depth axis local units. At scale 1, one unit is one metre.", "Socket 量程按深度轴局部单位填写；缩放为 1 时，一个单位对应一米。" },
            { "Contact radius in this object local units. At scale 1, one unit is one metre.", "Contact 半径按当前对象的局部单位填写；缩放为 1 时，一个单位对应一米。" },
            { "Contact tags shared with the Sender. Choose 1–16 nonempty tags.", "填写与 Sender 匹配的接触标签，共 1–16 个，每项均需填写。" },
            { "Place Sensa components under one Avatar Descriptor.", "请将 Sensa 组件放在同一个 Avatar Descriptor 所在的头像层级内。" },
            { "Generated Sensa parameters must be unique on this avatar: {0}", "同一头像内生成的 Sensa 参数须唯一，请调整重复项：{0}" },
            { "Each PhysBone root needs one Sensa parameter prefix; use ExistingParameter for additional readings.", "每个 PhysBone 根使用一个 Sensa 参数前缀；额外读取请使用现有参数（ExistingParameter）。" },
            { "Choose a supported Sensa role and orifice type.", "请选择受支持的 Sensa 角色和孔位类型。" },
            { "Assign a depth axis on this avatar.", "请指定当前头像上的深度轴。" },
            { "Choose 1–10 depth rings.", "请将深度环数量设为 1–10。" },
            { "Assign tip and root bones on this avatar.", "请指定当前头像上的尖端与根部骨骼。" },
            { "Choose an empty Sensa output namespace; this child already exists: {0}", "生成目标“{0}”已存在，请使用独立的 Sensa 作者对象。" },
            { "Provide a supplementary signal list.", "请配置辅助信号列表。" },
            { "Choose a supported supplementary signal source and role.", "请选择受支持的辅助信号来源及角色。" },
            { "A supplementary Contact output already exists: {0}", "辅助 Contact 目标“{0}”已存在，请使用独立的作者对象。" },
            { "Keep the Contact world radius within 3 metres.", "请将 Contact 在世界空间中的半径保持在 3 米以内。" },
            { "Choose 1–16 nonempty Contact tags matching the Sender.", "请填写 1–16 个与 Sender 匹配的接触标签，每项均需填写。" },
            { "Choose a supported PhysBone signal.", "请选择受支持的 PhysBone 信号。" },
            { "Keep the existing PhysBone parameter and select ExistingParameter: {0}", "请保留“{0}”已有的 PhysBone 参数，并选择现有参数（ExistingParameter）读取。" },
            { "Provide the existing Animator parameter name.", "请填写现有 Animator 参数名称。" },
            { "Keep Raycast range within 1000 metres.", "请将射线量程设为不超过 1000 米。" },
            { "Ray origin and direction. Uses this object when empty; local +Z points along the ray.", "指定射线的原点与方向。留空时使用当前对象，沿其局部 +Z 方向发射。" },
            { "Maximum ray distance in metres, greater than 0 and up to 1000. Independent of origin scale.", "射线最大距离，单位米，范围大于 0 且不超过 1000。采用世界空间距离，与原点缩放无关。" },
            { "A supplementary Raycast output already exists on this origin.", "此原点已存在辅助射线输出，请选择独立原点或作者实例。" },
            { "Generated Sensa parameter conflicts with an existing declaration: {0}", "生成的 Sensa 参数与现有声明重复，请调整：{0}" },
            { "{0} must be positive and finite.", "请将{0}设为大于 0 的有效数值。" },
            { "{0} must be nonempty and contain no '/' or control characters.", "请填写{0}；名称使用可见字符，斜线“/”用于分隔路径。" },
            { "{0} exceeds the Contact 3 m world-radius limit.", "当前缩放使{0}的 Contact 半径超过 3 米，请调整缩放。" },
            { "{0} must belong to this avatar.", "请为{0}选择当前头像内的对象。" },
            { "Sensa instance name", "Sensa 实例名称" },
            { "Sensa orifice type", "Sensa 孔位类型" },
            { "Socket range", "Socket 量程" },
            { "Raycast range", "射线量程" },
            { "PhysBone root transform", "PhysBone 根 Transform" },
            { "SPS four-anchor tracking", "SPS 四点定位" },
            { "Contact direct tracking (SDK Beta)", "Contact 直接定位（SDK Beta）" },
            { "Root tracking", "根点定位" },
            { "Root tracking method", "根点定位方式" },
            { "Unknown Sensa root tracking method.", "未知 Sensa 根点定位方式。" },
            { "Contact root names and collision channels must be unique.", "Contact 根点实例名称和碰撞通道须唯一。" },
            { "Contact root receiver exceeds the 3 m world-radius limit.", "Contact 根点接收器超过 3 米世界半径限制。" },
            { "Contact root collision channel already has a sender.", "Contact 根点碰撞通道已有发送器。" },
            { "Contact root instance already exists.", "Contact 根点实例已生成。" },
            { "Contact direct tracking (SDK Beta) requires advanced proximity parameters. Install VRChat Avatars SDK 3.10.6-beta.2 or a newer SDK with this feature, or choose SPS four-anchor tracking.", "Contact 直接定位（SDK Beta）需要高级接近参数。请安装 VRChat Avatars SDK 3.10.6-beta.2 或包含此功能的更新 SDK，或选择 SPS 四点定位。" },
            { "Install VRChat Avatars SDK 3.10.6-beta.2 or a newer SDK with advanced proximity parameters, or choose SPS four-anchor tracking.", "请安装 VRChat Avatars SDK 3.10.6-beta.2 或包含高级接近参数的更新 SDK，或选择 SPS 四点定位。" },
            { "Unknown Sensa array policy.", "未知 Sensa 阵列策略。" },
            { "Generated during upload/NDMF without changing original SPS. New setups default to Exclusive: one Socket/Plug measurement per group, initially Off, including markers, points and PB handles. Dedicated permits simultaneous measurements. Selection is independent of SPS Auto/activation.", "上传/NDMF 预览时自动生成，不修改原 SPS。新组件默认 Exclusive：每组一次只启用一个 Socket 或 Plug 的 Sensa 辅助对象（含标记、局部点和 PB 手柄），初始 Off。Dedicated 可同时测量。选择菜单独立于 SPS 自带的 Auto/开关。" },
            { "Local Tip uses the chosen Socket frame, auto-selected only when exactly one Socket is selected. It measures your undeformed reference tip and changes only with relative movement, not GPU curve deformation.", "本地 Tip 使用指定 Socket 的坐标系；只有一个选中 Socket 时自动选取。它测量自己 Plug 的未形变参考尖端，只有两者相对移动时坐标才变化；不是 GPU 曲线尖端。" },
            { "Configure only this object's SPS", "只配置当前对象的 SPS" },
            { "Inspect targets, placement and Contact cost", "检查目标、自动位置与 Contact 开销" },
            { "Reference only / no capability", "仅参考/未启用能力" },
            { "No matching VRCFury SPS components.", "没有匹配的 VRCFury SPS 组件。" },
            { "Select a reference frame and local bone; no manual probe placement. Each tetrahedron uses 4 Receivers + 1 Sender. Optional PB handles export grab and Stretch. Constraints and PhysBone act on separate objects. Approximate range: 24 local cm. Does not measure GPU-deformed meshes.", "本地骨骼测量：选择参考坐标系与目标骨骼，不用手摆触点。每组使用四面体 4 Receiver + 1 Sender，无需选择协议或布局。PB 把手可自动生成，抓取状态与 Stretch 一并导出。辅助约束与 PhysBone 不作用于同一对象。局部有效范围约 24 cm；这不测量 GPU 形变后的网格。" },
            { "VRChat SPS/OGB Contact Sensing", "VRChat SPS/OGB 触点测量" },
            { "Identity", "身份与命名" },
            { "Instance Name", "实例名称" },
            { "Unique name per component; used in OGB parameter path.", "每个组件须唯一，用于 OGB 参数路径。" },
            { "Supplementary Signals", "辅助信号" },
            { "OSC Parameters (Preview)", "OSC 参数预览" },
            { "No parameters — check configuration.", "没有参数，请检查配置。" },
            { "Preview Contacts (Scene Gizmos)", "预览触点（场景辅助线）" },
            { "Auto-assign depthAxis from Transform", "以当前 Transform 自动指定深度轴" },
            { "depthAxis is not assigned. Contacts will not be generated.", "未指定 depthAxis，无法生成触点。" },
            { "tipBone or rootBone is not assigned. Senders will not be generated.", "未指定 tipBone 或 rootBone，无法生成发送器。" },
            { "Orifice Type", "孔位类型" },
            { "Custom Type", "自定义类型" },
            { "Socket Config", "Socket 配置" },
            { "Depth Axis", "深度轴" },
            { "Bone defining the insertion axis (+Z = inward).", "定义插入方向的骨骼，+Z 朝内。" },
            { "Max insertion depth in metres.", "最大插入深度，单位米。" },
            { "Depth Ring Count", "深度环数量" },
            { "Number of proximity rings (1–10).", "近接环数量（1–10）。" },
            { "Generate Angle Params", "生成角度参数" },
            { "Add AngleX/AngleY proximity receivers.", "增加 AngleX/AngleY 近接接收器。" },
            { "Generate Self Param", "生成自身参数" },
            { "Also emit PenSelf parameter.", "同时输出 PenSelf 参数。" },
            { "Plug Config", "Plug 配置" },
            { "Tip Bone", "尖端骨骼" },
            { "Tip of the penetrator (TPS_Pen_Penetrating sender placed here).", "尖端位置，放置 TPS_Pen_Penetrating 发送器。" },
            { "Root Bone", "根部骨骼" },
            { "Root of the penetrator (TPS_Pen_Root sender placed here).", "根部位置，放置 TPS_Pen_Root 发送器。" },
            { "Self Penetration", "自身交互" },
            { "Detect insertion into own sockets.", "检测进入自己的 Socket。" },
            { "SPS names and collision channels must be unique.", "SPS 名称与碰撞通道必须唯一。" },
            { "Select a supported root on this avatar.", "请选择当前头像上的受支持根部。" },
            { "Fixed-root receiver exceeds the 3 m world-radius limit.", "固定根接收器超出 3 米世界半径限制。" },
            { "The selected root must belong to this avatar.", "所选根部必须属于当前头像。" },
            { "Fixed-root collision channel already has a sender.", "固定根碰撞通道已有发送器。" },
            { "Fixed-root instance already exists.", "固定根实例已经存在。" },
            { "Keep the Avatar root scale fixed for tracking. Apply scale constraints to child objects.", "根点定位需要保持 Avatar 根的缩放固定。请将缩放约束作用于子对象。" },
            { "Keep the Avatar root scale fixed for tracking. Animate child objects to change their size.", "根点定位需要保持 Avatar 根的缩放固定。请通过子对象动画调整部件大小。" },
            { "Four fixed avatar-root anchors measure your explicitly selected root center; only P0–P3 and Sample are public.", "SPS 四点定位用 Avatar 根坐标系中的四个固定锚点测量所选根点，公开参数为 P0–P3 和 Sample。" },
            { "Select a baked SPS Resolver material and a rendering non-VR Camera.", "选择已烘焙的 SPS Resolver 材质与正在渲染的非 VR Camera。" },
            { "Sensa GPU model snapshot · not a live mesh", "Sensa GPU 模型快照 · 非实时网格" },
            { "Render timed out: enable the camera and keep the Game view rendering.", "等待渲染超时：确认相机启用、Game 视图正在渲染。" },
            { "Editor experiment, not an uploadable avatar script. Reads an unblended SPS centerline, not the final mesh; no device output. Built-in pipeline and non-stereo camera only.", "编辑器实验，不可作为头像脚本上传。读取 SPS 的未混合中心线路径；不是最终网格，也不生成设备输出。仅支持 Built-in、非立体相机。" },
            { "Source Camera", "采集相机" },
            { "Resolver Renderer", "Resolver 渲染器" },
            { "Surface Renderer", "表面渲染器" },
            { "Baked Resolver Material", "烘焙 Resolver 材质" },
            { "Baked Surface Material", "烘焙表面材质" },
            { "Capture target changed; capture again.", "采集目标已变化，请重新采集。" },
            { "Check dependencies and capture next frame", "检查依赖并采集下一帧" },
            { "Specify camera, baked Resolver and surface material.", "请指定相机、已烘焙 Resolver 及表面材质。" },
            { "Only Built-in non-stereo Camera is supported; XR/URP are unverified.", "仅支持 Built-in 非立体 Camera；暂不验证 XR/URP。" },
            { "GPU must support AsyncGPUReadback and ARGBFloat.", "GPU 必须支持 AsyncGPUReadback 和 ARGBFloat。" },
            { "Select BakedSpsPlug's SPS Resolver material, not its surface material.", "请选择 BakedSpsPlug 的 SPS Resolver 材质，而不是表面材质。" },
            { "Missing SPS property:", "缺少 SPS 属性：" },
            { "Surface and Resolver SPS identity mismatch:", "表面与 Resolver 材质的 SPS 身份不一致：" },
            { "Surface material lacks _SPS_Overrun.", "表面材质缺少 _SPS_Overrun。" },
            { "Material is not configured. Select generated materials in build preview/Play Mode.", "材质尚未配置；请在构建预览/Play Mode 中选择生成后的材质。" },
            { "Waiting for selected camera's next frame (10-second timeout)…", "等待所选相机的下一帧（10 秒超时）…" },
            { "Continuously export experimental PNG", "连续导出实验 PNG" },
            { "PNG path", "PNG 路径" },
            { "Requires the lab's SensaLab/Telemetry shader. Enable then capture. PNG encodes entry minus centerline root in world-axis meters, not full stroke. shader-osc-bridge.py can forward diagnostic OSC. Editor only.", "需要测试工程的 SensaLab/Telemetry Shader。勾选后点击采集；PNG 为入口相对中心线根部的世界轴位移（米），不是完整行程。外部 shader-osc-bridge.py 可转发诊断 OSC。仅编辑器运行。" },
            { "Model length (world meters)", "模型长度（世界米）" },
            { "First path point", "第一路径点" },
            { "Path direction", "路径方向" },
            { "Centerline samples", "中心线采样" },
            { "33 points; Alpha is firstSegmentStrength", "33 点；Alpha 为 firstSegmentStrength" },
            { "Snapshot UTC", "快照时间 UTC" },
            { "Export diagnostic JSON", "导出诊断 JSON" },
            { "Supported SPS2 shader file is not installed:", "未安装受支持的 SPS2 Shader 文件：" },
            { "SPS shader version does not match this adapter:", "SPS Shader 版本与实验适配器不匹配：" },
            { ". Review the adapter; do not bypass the check.", "。需复核适配器，不能跳过检查。" },
            { "Generated path has different contents; back up and move it first:", "生成路径已有不同内容；请先备份并移走" },
            { "GPU probe shader compilation failed. Check Unity Console; capture has not started.", "GPU 探针 Shader 编译失败，请检查 Unity Console；未开始采集。" },
            { "SPS identity changed while waiting; capture again.", "等待期间 SPS 身份发生变化，请重新采集。" },
            { "Capture camera is too small or has entered stereo mode.", "采集相机尺寸不足或已进入立体模式。" },
            { "Cannot create floating-point sample texture.", "无法创建浮点采样纹理。" },
            { "No valid SPS path or corrupt data", "无有效 SPS 路径或数据损坏" },
            { "GPU model captured; not final mesh or live device input.", "已采集 GPU 模型；不是最终网格，也不是实时设备输入。" },
            { "+Z points inward. 24 local Proximity receivers per Self/Others group. Both sides need matching three-point markers and channel; ordinary TPS tags lack this geometry. Uniform scale required.", "+Z 指向孔内。每组 Self/Others 使用 24 个本地 Proximity 接收器。双方必须使用配套三点标记和相同通道；普通 TPS 标签不提供足够的几何信息。缩放必须均匀。" },
            { "Protocol", "协议" },
            { "Aperture radius / position limit", "孔口半径 / 解算位置上限" },
            { "4 cm / about 24 cm (local units; saturation can still occur inside)", "4 cm / 约 24 cm（局部单位；范围内仍可能饱和）" },
            { "+Z inward", "+Z 入孔方向" },
            { "Root and Tip define the straight axis; Side defines twist. Reference actual bone markers if needed. Uses three tiny spherical Senders without changing SPS deformation. One target per channel at a time.", "Root 与 Tip 定义直线轴，Side 定义扭转。可将引用改为实际骨骼上的标记。仅使用三个微型球形 Sender，不修改原有 SPS 形变组件。一个通道同一时刻只对应一个目标。" },
            { "OK", "确定" },
            { "Synthetic lab signal fixture for testing the desktop input pipeline.", "供实验室测试桌面输入链路的合成信号组件。" },
            { "Selection bindings must match generated rigs and slots.", "选择绑定必须对应生成对象与槽位。" },
            { "Shader producer IDs must be unique.", "Shader producer ID 必须唯一。" },
            { "Native root capture requires PC Built-in rendering.", "根点捕获需要 PC Built-in 渲染。" },
            { "Choose an Avatar world scale that encodes to a positive value, up to 8.", "请将 Avatar 世界缩放设为可编码的正值，最大为 8。" },
            { "This Unity camera must preserve the 0.000001 near plane for Shader capture.", "Shader 捕获需要 Unity 相机保留 0.000001 的近裁剪面设置。" },
            { "Shader capture needs finite positive target scales.", "请将 Shader 测量对象及其父对象的缩放设为有限正数。" },
            { "Shader capture needs independent X/Z axes with components within -8 to 8.", "请保持 Shader 测量对象的 X／Z 轴独立，各分量位于 −8 到 8 之间。" },
            { "Samples the selected root and its local X/Z axes in one native render primitive. Green scene bounds show the position range. The black-and-white tile has a white capture margin and three copies of the measurements. Choose a desktop region of at least 160 by 128 physical pixels, then verify the image in your VRChat desktop window.", "在同一个原生渲染图元中测量所选根点及其局部 X／Z 轴。场景中的绿色方框表示位置范围。黑白图块包含白色捕获余量与三份测量副本。请选取至少 160×128 物理像素的桌面区域，并在 VRChat 桌面窗口中核对图块。" },
            { "Choose one SPS target inside this avatar and a producer ID from 1–65535.", "选择头像内的 SPS 目标和 1–65535 producer ID。" },
            { "The selected object must contain exactly one SPS Socket or Plug.", "选中对象必须包含一个 SPS Socket 或 Plug。" },
            { "The desktop rectangle must fit within normalized 0–1 bounds.", "桌面区域必须位于归一化 0–1 边界内。" },
            { "SPS root code", "SPS 根点编码" },
            { "Generated shader differs; preserve and move it before regenerating:", "生成 Shader 已有不同内容，请先备份并移走：" },
            { "Native root shader did not compile.", "根点 Shader 编译失败。" },
            { "Choose an explicit SPS root.", "请选择明确的 SPS 根部。" },
            { "Sensa root is not configured.", "Sensa 根部尚未配置。" },
            { "Unsupported explicit SPS root component.", "不支持此 SPS 根部组件。" },
            { "Reference Socket for local Plug-tip measurements. If exactly one Socket is selected it is chosen automatically.", "本地 Plug 尖端的参考 Socket；仅选中一个 Socket 时自动采用。" },
            { "Orifice type used in OGB parameter path: OGB/Orf/{orificeType}/{instanceName}/*", "OGB 路径中的孔位类型。" },
            { "Custom orifice type string (used when OrificeType = Custom).", "Custom 类型时使用的自定义孔位字符串。" },
            { "Instance name used in OGB parameter path. Must be unique per avatar if multiple Sensa components exist.", "用于 OGB 路径的实例名；同一头像中须唯一。" },
            { "Bone that defines the insertion axis. +Z points inward.", "定义插入轴的骨骼；+Z 朝内。" },
            { "Number of depth-ring VRCContactReceivers to create along the insertion axis (1..10).", "沿插入轴生成的深度环接收器数量（1–10）。" },
            { "Deprecated — TPS_Pen_Penetrating is now always included in filter tags and is the primary standard tag for all modern SPS Plugs. This field has no effect.", "此字段已无作用，现代 SPS Plug 的标准 TPS_Pen_Penetrating 标签始终包含在过滤中。" },
            { "Generate AngleX / AngleY OSC parameters (four lateral proximity Contacts).", "生成 AngleX/AngleY 参数（四个侧向近接触点）。" },
            { "Emit PenSelf parameter (self-insertion depth) in addition to PenOthers.", "除 PenOthers 外生成自身交互 PenSelf 参数。" },
            { "Tip bone of the penetrator (places the TPS_Pen_Penetrating ContactSender).", "尖端骨骼，放置 TPS_Pen_Penetrating 发送器。" },
            { "Root bone of the penetrator (places the TPS_Pen_Root ContactSender).", "根部骨骼，放置 TPS_Pen_Root 发送器。" },
            { "Also detect self-penetration (adds a receiver for local-only depth).", "同时检测自身交互，增加本地深度接收器。" },
            { "Additional PhysBone / Contact / Raycast signals. Each is wired to a device role.", "额外的 PhysBone/Contact/Raycast 信号，分别映射到设备角色。" },
            { "Measurement origin and axes. Defaults to this object.", "测量原点与坐标轴；默认使用当前对象。" },
            { "Local avatar bone/landmark to measure. Not required when creating a grab handle.", "要测量的本地骨骼或标记；生成抓取把手时不需要。" },
            { "Root and tip locate the straight centre axis. Side establishes twist; place it off that axis.", "Root 与 Tip 确定直线轴，Side 需偏离该轴以确定扭转。" },
            { "Both avatars must use the same channel. Only one matching Plug may enter a Socket array at once.", "双方通道必须相同；同一 Socket 阵列一次只允许一个匹配 Plug。" },
            { "Unique on this avatar; used in OSC paths. +Z of this object points into the Socket.", "头像内须唯一，用于 OSC 路径；当前对象 +Z 朝孔内。" },
            { "Object containing one VRCFury SPS Socket or Plug.", "包含一个 VRCFury SPS Socket 或 Plug 的对象。" },
            { "Explicitly pin this ID in the desktop bridge; it is not player identity.", "桌面桥必须明确固定此 ID；它不是玩家身份。" },
            { "Normalized desktop presentation rectangle; VRChat/HMD composition is not guaranteed.", "尝试在桌面窗口输出的归一化区域；不保证 VRChat/头显合成行为。" },
            { "Place the component under an avatar descriptor.", "请将组件放在带 Avatar Descriptor 的头像下。" },
            { "Sensa auto group names must be unique.", "Sensa 自动组名必须唯一。" },
            { "Auto group name must be at most 30 characters.", "自动组名最多 30 个字符。" },
            { "No selected SPS targets for ", "没有选中的 SPS 目标，组：" },
            { "Two automatic groups select the same SPS target.", "两个自动组选择了同一 SPS 目标。" },
            { "This auto group is already generated: ", "此自动组已经生成：" },
            { "Local tip measurement needs a selected reference Socket; choose one explicitly when there are multiple sockets.", "本地尖端测量需要选中的参考 Socket；存在多个 Socket 时请明确指定。" },
            { "Expected exactly one SensaGpuProbe.cs in the project.", "项目中必须恰有一个 SensaGpuProbe.cs。" },
            { "Install the lab Telemetry shader before exporting PNG.", "导出 PNG 前请安装实验室 Telemetry Shader。" },
            { "Point probe names must be unique.", "本地点探针名称必须唯一。" },
            { "Point reference must belong to this avatar.", "本地点参考系必须属于当前头像。" },
            { "Choose a target bone on this avatar.", "请选择当前头像上的目标骨骼。" },
            { "Handle length must be between 2 and 18 local cm.", "把手长度须介于 2 至 18 局部厘米。" },
            { "Point probe is already generated: ", "本地点探针已经生成：" },
            { "Point sender identity is already used: ", "本地点发送器标识已被使用：" },
            { "Sensa Pose Socket names must be unique: ", "Sensa Pose Socket 名称必须唯一：" },
            { "Pose landmarks must belong to the avatar being built.", "姿态标记必须属于当前构建的头像。" },
            { "Sensa Pose would exceed the avatar's 256 Contact limit.", "Sensa Pose 将超过头像的 256 个 Contact 上限。" },
            { "Sensa Pose receiver radius exceeds VRChat's 3 metre limit at this scale.", "当前缩放下 Sensa Pose 接收器半径超过 VRChat 的 3 米上限。" },
            { "Sensa Pose profile must enable Self or Others.", "Sensa Pose 配置必须启用 Self 或 Others。" },
            { "Sensa Pose Plug needs Root, Tip and Side landmarks.", "Sensa Pose Plug 需要 Root、Tip 和 Side 标记。" },
            { "Sensa Pose Root and Tip must be at least 2 cm apart at authoring scale.", "作者尺度下 Sensa Pose 的 Root 与 Tip 须至少相距 2 厘米。" },
            { "Sensa Pose Side must be at least 5 mm away from the Root/Tip axis.", "Sensa Pose 的 Side 须距离 Root/Tip 轴至少 5 毫米。" },
            { "Assign a Sensa Pose pair profile.", "请指定 Sensa Pose 配对配置。" },
            { " must contain 1–48 ASCII letters, digits, '_' or '-'.", "须包含 1 至 48 个 ASCII 字母、数字、下划线或连字符。" },
            { "Sensa Pose requires positive uniform scale throughout the landmark hierarchy: ", "Sensa Pose 标记的完整层级须使用正值均匀缩放：" },
            { "Sensa Pose Socket is already baked.", "Sensa Pose Socket 已经烘焙。" },
            { "Sensa Pose Plug is already baked.", "Sensa Pose Plug 已经烘焙。" },
            { "Sensa instance name must be nonempty and cannot contain '/'.", "Sensa 实例名称不能为空，且不能包含斜线。" },
            { "Sensa socket length must be positive and finite.", "Sensa Socket 长度必须是正有限值。" },
            { "Sensa Raycast requires VRChat SDK 3.10.3 or newer.", "Sensa Raycast 需要 VRChat SDK 3.10.3 或更新版本。" },
            { "Only one Sensa Quick Start World Receiver is allowed per avatar.", "每个头像只允许一个实验室 Sensa Quick Start World Receiver。" },
            { "Sensa Quick Start requires a humanoid Avatar Descriptor and Animator on the avatar root.", "实验室 Sensa Quick Start 需要头像根上的人形 Avatar Descriptor 和 Animator。" },
            { "Sensa Quick Start requires a mapped RightHand bone.", "实验室 Sensa Quick Start 需要映射 RightHand 骨骼。" },
            { "Sensa Quick Start requires an avatar view height between 0.1 and 5 metres.", "实验室 Sensa Quick Start 需要 0.1 至 5 米的头像视点高度。" },
            { "Sensa Quick Start has already been generated.", "实验室 Sensa Quick Start 已经生成。" },
            { "Sensa names require 1–48 ASCII letters, digits, '_' or '-'.", "Sensa 名称须包含 1 至 48 个 ASCII 字母、数字、下划线或连字符。" },
            { "Sensa requires positive uniform scale: ", "Sensa 需要正值均匀缩放：" },
            { "Generated Sensa parameter conflicts with an existing declaration: ", "生成的 Sensa 参数与现有声明冲突：" },
            { "Duplicate generated parameter: ", "重复的生成参数：" },
            { "Scaled receiver exceeds SDK radius limit.", "缩放后的接收器超过 SDK 半径限制。" },
            { "Install supported VRCFury SPS: missing ", "请安装受支持的 VRCFury SPS，缺少：" },
            { "Unsupported VRCFury socket geometry API; no guessed placement was generated.", "不支持此 VRCFury Socket 几何 API；没有猜测或生成位置。" },
            { "Unsupported VRCFury plug geometry API.", "不支持此 VRCFury Plug 几何 API。" },
            { "SPS plug length could not be resolved.", "无法解析 SPS Plug 长度。" },
            { "Create Sensa pose rig", "创建 Sensa 姿态组" },
            { "Create Sensa calibration pair", "创建 Sensa 校准对" },
            { "Select local SPS", "选择本地 SPS" },
            { "Off", "关闭" },
            { "More", "更多" },
            { "Root", "根部" },
            { "Tip", "尖端" },
            { "Side / roll", "侧向 / 扭转" },
            { "Sensa native root capture", "Sensa 原生根点捕获" },
            { "Targets: {0}; new Contacts: {1}\n", "目标：{0}；新增 Contact：{1}\n" },
            { "Slot {0}", "槽位 {0}" },
            { "{0}: {1:F3}, length {2:F3}\n", "{0}：{1:F3}，长度 {2:F3}\n" },
            { "[Sensa] {0}: depthAxis is null. Skipping socket generation.", "[Sensa] {0}：未指定 depthAxis，跳过 Socket 生成。" },
            { "[Sensa] {0}: tipBone or rootBone is null. Skipping plug generation.", "[Sensa] {0}：未指定 tipBone 或 rootBone，跳过 Plug 生成。" },
            { "Sensa cannot replace existing PhysBone parameter on '{0}'. Use ExistingParameter instead.", "Sensa 无法替换“{0}”上已有的 PhysBone 参数，请改用 ExistingParameter。" },
            { "Sensa Contact budget exceeded: existing {0} + generated {1} > 256.", "Sensa Contact 超出预算：已有 {0} + 新增 {1} > 256。" },
            { "Socket = orifice/receiver. Plug = penetrator/sender.", "Socket 为接收方，Plug 为发送方。" },
            { "Language", "语言" },
            { "Automatic (Editor, then system)", "自动（编辑器优先，其次系统）" },
            { "Choose a language for Sensa authoring UI and generated menu labels. This preference is stored for this editor user, not in the avatar.", "选择 Sensa 作者界面及生成菜单的语言。偏好保存在当前编辑器用户设置中，不写入头像。" },
            { "Automatic language: {0}", "自动识别语言：{0}" },
            { "Size", "数量" },
            { "Element {0}", "元素 {0}" },
            { "Script", "脚本" },
            { "Sensa GPU Probe", "Sensa GPU 探针" },
            { "Export GPU model sample", "导出 GPU 模型样本" },
            { "GPU readback failed", "GPU 回读失败" },
            { "Group name", "组名" },
            { "Discover all", "发现全部" },
            { "Selected targets", "选中目标" },
            { "Excluded targets", "排除目标" },
            { "Paired Socket tracking", "配对 Socket 定位" },
            { "Paired Plug markers", "配对 Plug 标记" },
            { "Local Plug tip tracking", "本地 Plug 尖端定位" },
            { "Reference Socket", "参考 Socket" },
            { "Create Plug PB handles", "生成 Plug PB 把手" },
            { "Pair channel", "配对通道" },
            { "Array policy", "阵列策略" },
            { "Instance name", "实例名称" },
            { "Reference frame", "参考坐标系" },
            { "Target", "测量目标" },
            { "Unique collision channel", "独有碰撞通道" },
            { "Create grab handle", "生成可抓把手" },
            { "Handle length", "把手长度" },
            { "Pair profile", "配对配置" },
            { "Root marker", "根部标记" },
            { "Tip marker", "尖端标记" },
            { "Side marker", "侧向标记" },
            { "Channel", "通道" },
            { "Receive Others", "接收他人" },
            { "Receive Self", "接收自身" },
            { "Role", "角色" },
            { "Orifice type", "孔位类型" },
            { "Supplementary signals", "辅助信号" },
            { "Custom orifice type", "自定义孔位类型" },
            { "Depth axis", "深度轴" },
            { "Depth ring count", "深度环数量" },
            { "Deprecated DPS filter", "已弃用的 DPS 过滤" },
            { "Generate angle parameters", "生成角度参数" },
            { "Generate Self parameter", "生成自身参数" },
            { "Tip bone", "尖端骨骼" },
            { "Root bone", "根部骨骼" },
            { "Self interaction", "自身交互" },
            { "Label", "显示名称" },
            { "Signal source", "信号来源" },
            { "Existing parameter name", "现有参数名" },
            { "PhysBone signal", "PhysBone 信号" },
            { "PhysBone root", "PhysBone 根" },
            { "Contact radius", "Contact 半径" },
            { "Raycast origin", "射线原点" },
            { "Raycast maximum range (m)", "射线最大距离（米）" },
            { "SPS target", "SPS 目标" },
            { "Producer ID", "生产端 ID" },
            { "4 cm / {0:F2} m; receiver radius 2 m", "4 cm / {0:F2} m；接收器半径 2 m" },
            { "Green scene-view slices show where all required distances can be measured. Orange anchor centers are excluded because the signal saturates. Tracking a point does not mean it has entered the 4 cm opening.", "场景视图中的绿色截面表示距离数据足以定位的范围。橙色标记中心附近会让信号饱和，需要避开。能够定位不代表已进入半径 4 cm 的孔口。" },
            { "Common measurable volume; orange centers excluded", "共同测量范围；避开橙色中心附近" },
            { "Choose the reference frame and bone to track. Sensa creates four 2 m receivers and one small marker automatically. The green scene-view slices show the usable tracking area, about 1.39 m from the frame origin; tiny orange saturation zones are excluded. Optional grab handles also report grabbing and stretching. This tracks the bone, not Shader-deformed mesh vertices.", "选择参考坐标和要跟踪的骨骼，Sensa 会自动生成四个半径 2 m 的接收器和一个小标记。场景视图中的绿色截面表示可用范围：距参考原点约 1.39 m，需避开橙色标记中心附近的微小饱和区。可选的抓取把手还会报告是否被抓住及拉伸程度。这里跟踪的是骨骼位置，无法读取 Shader 变形后的网格顶点。" },
            { "Shader coordinate range; image capture must be verified separately", "Shader 坐标范围；需另行确认画面捕获正常" },

            { "Desktop viewport", "桌面视口" },
            { "Socket (receiver)", "Socket（接收方）" },
            { "Plug (sender)", "Plug（发送方）" },
            { "Pussy", "阴道" },
            { "Ass", "肛门" },
            { "Mouth", "口部" },
            { "Custom", "自定义" },
            { "Dedicated (simultaneous)", "独立（同时测量）" },
            { "Exclusive (one at a time)", "互斥（每次一个）" },
            { "Existing parameter", "现有参数" },
            { "Raycast", "射线" },
            { "Vibration", "震动" },
            { "Enable gate", "启用门控" },
            { "Depth override", "深度覆盖" },
            { "Lateral angle", "横向角度" },
            { "Vertical angle", "纵向角度" },
            { "Angle", "角度" },
            { "Stretch", "拉伸" },
            { "Squish", "压缩" },
            { "Is grabbed", "正在抓取" },
        };

        internal static string Translate(string english, string locale) =>
            locale == SimplifiedChinese && Chinese.TryGetValue(english ?? "", out var chinese) ? chinese : english ?? "";

        public static string Text(string english) => Translate(english, Locale);
        public static string Text(string english, string chinese) => Locale == SimplifiedChinese && !string.IsNullOrEmpty(chinese) ? chinese : english;
        public static string Format(string english, params object[] values) => string.Format(CultureInfo.InvariantCulture, Text(english), values);

        public static bool DrawLanguageSelector()
        {
            var preference = ReadPreference();
            var index = string.IsNullOrEmpty(preference) || string.Equals(preference, Automatic, StringComparison.OrdinalIgnoreCase)
                ? 0 : NormalizeLocale(preference) == SimplifiedChinese ? 2 : 1;
            var next = EditorGUILayout.Popup(new GUIContent(Text("Language"), Text("Choose a language for Sensa authoring UI and generated menu labels. This preference is stored for this editor user, not in the avatar.")),
                index, new[] { Text("Automatic (Editor, then system)"), "English", "简体中文" });
            if (next == index) return false;
            SetPreference(next == 0 ? Automatic : next == 2 ? SimplifiedChinese : English);
            EditorApplication.delayCall += () => { ActiveEditorTracker.sharedTracker.ForceRebuild(); SceneView.RepaintAll(); };
            return true;
        }

        [SettingsProvider]
        public static SettingsProvider Preferences() => new SettingsProvider("Preferences/Sensa", SettingsScope.User)
        {
            label = "Sensa",
            guiHandler = _ =>
            {
                DrawLanguageSelector();
                EditorGUILayout.HelpBox(Text("Choose a language for Sensa authoring UI and generated menu labels. This preference is stored for this editor user, not in the avatar."), MessageType.Info);
                if (ReadPreference() == Automatic) EditorGUILayout.LabelField(Format("Automatic language: {0}", Locale));
            },
            keywords = new HashSet<string>(new[] { "Sensa", "language", "locale", "语言" })
        };
    }
}
