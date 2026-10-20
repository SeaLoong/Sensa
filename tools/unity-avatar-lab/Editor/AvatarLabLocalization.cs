using System;
using System.Linq;
using System.Collections.Generic;
using System.Reflection;
using UnityEditor;
using UnityEngine;

namespace SensaAvatarLab
{
    public static class AvatarLabLocalization
    {
        public const string PreferenceKey = "top.sealoong.sensa.editor-language";
        public static string ResolveLocale(string preference, SystemLanguage? editor, SystemLanguage system)
        {
            if (!string.IsNullOrEmpty(preference) && preference != "auto") return Normalize(preference);
            var language = editor ?? system;
            return language == SystemLanguage.Chinese || language == SystemLanguage.ChineseSimplified || language == SystemLanguage.ChineseTraditional ? "zh-CN" : "en-US";
        }
        public static string Normalize(string language)
        {
            var value = (language ?? "").Replace('_', '-');
            return value.Equals("zh", StringComparison.OrdinalIgnoreCase) || value.StartsWith("zh-", StringComparison.OrdinalIgnoreCase) ? "zh-CN" : "en-US";
        }
        private static SystemLanguage? EditorLanguage()
        {
            try {
                var type = AppDomain.CurrentDomain.GetAssemblies().Select(assembly => assembly.GetType("UnityEditor.LocalizationDatabase")).FirstOrDefault(value => value != null);
                if (type == null) return null;
                const BindingFlags flags = BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic;
                if (type.GetProperty("enableEditorLocalization", flags)?.GetValue(null) is bool enabled && !enabled) return SystemLanguage.English;
                return type.GetProperty("currentEditorLanguage", flags)?.GetValue(null) is SystemLanguage language ? language : (SystemLanguage?)null;
            } catch (Exception) { return null; }
        }
        public static string Locale => ResolveLocale(EditorPrefs.GetString(PreferenceKey, "auto"), EditorLanguage(), Application.systemLanguage);
        public static string Text(string english) => Locale == "zh-CN" && Chinese.TryGetValue(english, out var value) ? value : english;
        [MenuItem("Tools/Sensa Avatar Lab/Language/Automatic (Auto) - 自动")] public static void Automatic() { EditorPrefs.SetString(PreferenceKey, "auto"); }
        [MenuItem("Tools/Sensa Avatar Lab/Language/English - 英文")] public static void English() { EditorPrefs.SetString(PreferenceKey, "en-US"); }
        [MenuItem("Tools/Sensa Avatar Lab/Language/Simplified Chinese - 简体中文")] public static void SimplifiedChinese() { EditorPrefs.SetString(PreferenceKey, "zh-CN"); }
        public static string Original(string value)
        {
            foreach (var pair in Chinese) if (pair.Value == value) return pair.Key;
            return value;
        }
        public static string OriginalLabel(string value)
        {
            // Only the known generated guide labels use composable template fragments.
            // 只有已知生成的辅助标签使用可组合文案片段。
            foreach (var pair in Chinese.OrderByDescending(pair => pair.Value.Length)) value = value.Replace(pair.Value, pair.Key);
            return value;
        }
        public static void SaveAssets()
        {
            // Only owned generated menus; never traverse or edit referenced third-party assets.
            // 只处理自有生成菜单，不遍历或修改引用的第三方资源。
            foreach (var guid in AssetDatabase.FindAssets("t:VRCExpressionsMenu", new[] { "Assets/SensaAvatarLab" })) {
                var menu = AssetDatabase.LoadAssetAtPath<VRC.SDK3.Avatars.ScriptableObjects.VRCExpressionsMenu>(AssetDatabase.GUIDToAssetPath(guid));
                if (menu == null) continue;
                foreach (var control in menu.controls) control.name = Text(Original(control.name));
                EditorUtility.SetDirty(menu);
            }
            AssetDatabase.SaveAssets();
        }
        public static string Label(string english)
        {
            english = OriginalLabel(english);
            string value = Text(english);
            // Retain the stable English object name; only the displayed label is translated.
            // 对象名称保留稳定英文，只翻译显示标签。
            if (value == english && Locale == "zh-CN") foreach (var pair in Chinese.OrderByDescending(pair => pair.Key.Length)) value = value.Replace(pair.Key, pair.Value);
            return value;
        }
        internal static readonly Dictionary<string, string> Chinese = new Dictionary<string, string>
        {
            { "Enable SPS OSC (local)", "启用 SPS OSC（本地）" },
            { "Outside / learn length", "区域外 / 学习长度" },
            { "Far outside", "远离区域" },
            { "Synthetic code (not SPS data)", "合成编码（不是 SPS 数据）" },
            { "Valid CRC", "有效 CRC" },
            { "Corrupt CRC", "损坏 CRC" },
            { "Corrupt shader CRC", "损坏 Shader CRC" },
            { "Sensa Test Controls", "Sensa 测试控制" },
            { "Sensa test props", "Sensa 测试道具" },
            { "Plug / Lollipop", "Plug / 棒棒糖" },
            { "Marker visibility", "标记可见性" },
            { "Hide guides", "隐藏辅助标记" },
            { "Show guides", "显示辅助标记" },
            { "Visible labels / probes", "可见标签 / 探针" },
            { "Sensa Test Props", "Sensa 测试道具" },
            { "Probe layout", "探针布局" },
            { "Compact probes", "紧凑探针" },
            { "Cube probes", "立方体探针" },
            { "POINT REFERENCE", "点参考" },
            { "PLUG HANDLE", "Plug 手柄" },
            { "Home / reset", "归位 / 复位" },
            { "Left hand", "左手" },
            { "Right hand", "右手" },
            { "Place in world", "放置到世界" },
            { "Measure this socket", "测量此 Socket" },
            { "Code output (synthetic)", "编码输出（合成）" },
            { "Corrupt CRC (test)", "损坏 CRC（测试）" },
            { "Measure plug", "测量 Plug" },
            { "Root marker", "根标记" },
            { "Tip marker", "尖端标记" },
            { "Side marker", "侧面标记" },
            { "Palm SOCKET", "手掌 SOCKET" },
            { "PALM SOCKET", "手掌 SOCKET" },
            { "Forearm SOCKET", "前臂 SOCKET" },
            { "FOREARM SOCKET", "前臂 SOCKET" },
            { "PB HANDLE", "PB 手柄" },
            { "PB HANDLE\nreference / grab the ball", "PB 手柄\n参考 / 抓取小球" },
            { "SHADER (TEST)", "Shader（测试）" },
            { "Entry axis +Z", "入口轴 +Z" },
            { "VRCFury temporary package initialization timed out.", "VRCFury 临时包初始化超时。" },
            { "Required component unavailable: ", "缺少必要组件：" },
            { "Import the licensed resource first: ", "请先导入有授权的资源：" },
            { "Scene already exists; preserve your edits before rebuilding: ", "场景已存在；重建前请保留修改：" },
            { "The base model needs a valid Humanoid rig.", "基础模型需要有效的 Humanoid 骨架。" },
            { "The base model needs an Avatar Descriptor.", "基础模型需要 Avatar Descriptor。" },
            { "Required humanoid bone missing: ", "缺少必要的人形骨骼：" },
            { "SDK preprocessing rejected the avatar.", "SDK 预处理拒绝该头像。" },
            { "Avatar build validation failed; see Validation/build-*.json.", "头像构建验证失败；请查看 Validation/build-*.json。" },
            { "SDK builder unavailable.", "SDK 构建器不可用。" },
            { "SDK did not produce an avatar bundle.", "SDK 未生成头像 bundle。" },
            { "FullFlow already exists; preserve your edits before recreating.", "FullFlow 已存在；重新创建前请保留修改。" },
            { "FullFlow SDK preprocess failed.", "FullFlow SDK 预处理失败。" },
            { "FullFlow contract failed. See Validation/full-flow.json", "FullFlow 契约失败，见 Validation/full-flow.json" },
            { "Build FullFlow first.", "请先构建 FullFlow。" },
            { "FullFlow bundle contract failed.", "FullFlow bundle 契约失败。" },
            { "Preserve existing first-run avatar edits before recreating.", "重新创建前请保留入门头像的已有修改。" },
            { "Build the first-run SDK bundle first.", "请先构建入门头像 SDK bundle。" },
            { "First-run SDK bundle is missing the expected contacts or local parameters.", "入门 SDK bundle 缺少预期的触点或本地参数。" },
            { "SDK rejected first-run avatar.", "SDK 拒绝了入门头像。" },
            { "First-run avatar contract failed.", "入门头像契约失败。" },
            { "Build the Shader SDK bundle first.", "请先构建 Shader SDK bundle。" },
            { "Shader SDK bundle contents failed validation.", "Shader SDK bundle 内容验证失败。" },
            { "Build callbacks rejected ", "构建回调拒绝了 " },
            { "Capability matrix failed.", "能力矩阵验证失败。" },
            { "Refusing to replace ", "拒绝覆盖 " },
        };
    }
}
