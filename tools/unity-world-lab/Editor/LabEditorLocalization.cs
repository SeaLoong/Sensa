using System;
using System.IO;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UI;
using UdonSharp;
using UdonSharpEditor;
using VRC.SDK3.Components;

namespace SensaLab
{
    // Self-contained Editor helper: the lab can be installed without a Sensa Editor assembly.
    // 独立编辑器辅助，不依赖正式包的Editor程序集。
    public static class LabEditorLocalization
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
        public static string Locale => ResolveLocale(EditorPrefs.GetString(PreferenceKey, "auto"), EditorLanguage(), Application.systemLanguage);
        private static SystemLanguage? EditorLanguage()
        {
            // Unity's actual UI-language property is internal; reflection stays in Editor code.
            // Unity实际界面语言属性为internal，反射仅限Editor。
            try {
                var type = AppDomain.CurrentDomain.GetAssemblies().Select(assembly => assembly.GetType("UnityEditor.LocalizationDatabase")).FirstOrDefault(value => value != null);
                if (type == null) return null;
                const BindingFlags flags = BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic;
                if (type.GetProperty("enableEditorLocalization", flags)?.GetValue(null) is bool enabled && !enabled) return SystemLanguage.English;
                return type.GetProperty("currentEditorLanguage", flags)?.GetValue(null) is SystemLanguage language ? language : (SystemLanguage?)null;
            } catch (Exception) { return null; }
        }
        public static string Text(string english) => Locale == "zh-CN" && LabTranslationCatalog.Chinese.TryGetValue(english, out var chinese) ? chinese : english;
        public static string Original(Text text)
        {
            var local = text.GetComponent<LabLocalizedText>();
            if (local == null) return text.text;
            if (EditorApplication.isPlaying) {
                var program = UdonSharpEditorUtility.GetBackingUdonBehaviour(local);
                if (program != null && text.text == (program.GetProgramVariable("lastPresentation") as string))
                    return program.GetProgramVariable("englishText") as string ?? text.text;
            }
            return local.OriginalText();
        }
        [MenuItem("Tools/Sensa Lab/Language/Automatic (Auto) - 自动")]
        public static void Automatic() { SetPreference("auto"); }
        [MenuItem("Tools/Sensa Lab/Language/English - 英文")]
        public static void English() { SetPreference("en-US"); }
        [MenuItem("Tools/Sensa Lab/Language/Simplified Chinese - 简体中文")]
        public static void Chinese() { SetPreference("zh-CN"); }
        private static void SetPreference(string value) { EditorPrefs.SetString(PreferenceKey, value); Refresh(); }
        [MenuItem("Tools/Sensa Lab/Refresh display language - 刷新显示语言")]
        public static void Refresh()
        {
            for (int i = 0; i < SceneManager.sceneCount; i++) Apply(SceneManager.GetSceneAt(i));
        }
        public static Scene OpenScene(string path, OpenSceneMode mode = OpenSceneMode.Single)
        {
            var scene = EditorSceneManager.OpenScene(path, mode);
            foreach (var root in scene.GetRootGameObjects()) foreach (var local in root.GetComponentsInChildren<LabLocalizedText>(true)) {
                if (local.uiText != null) local.uiText.text = local.OriginalText();
                var mesh = local.GetComponent<TextMesh>();
                if (mesh != null) mesh.text = local.OriginalText();
            }
            return scene;
        }
        public static bool SaveScene(Scene scene, string path = null)
        {
            Apply(scene);
            return path == null ? EditorSceneManager.SaveScene(scene) : EditorSceneManager.SaveScene(scene, path);
        }
        internal static void EnsurePrograms(bool compile = true)
        {
            bool created = false;
            foreach (var name in new[] { "LabLocalizedText", "LabLocalizedTextUpdater", "LabLanguageController", "LabLanguageButton" }) {
                string path = "Assets/SensaLab/Runtime/" + name + ".asset";
                if (AssetDatabase.LoadAssetAtPath<UdonSharpProgramAsset>(path) != null) continue;
                var source = AssetDatabase.LoadAssetAtPath<MonoScript>("Assets/SensaLab/Runtime/" + name + ".cs");
                if (source == null) throw new InvalidOperationException("Install the updated Sensa lab Runtime sources before localizing the scene. / 本地化前请安装更新后的实验Runtime源码。");
                var program = ScriptableObject.CreateInstance<UdonSharpProgramAsset>(); program.sourceCsScript = source;
                program.ScriptVersion = UdonSharpProgramVersion.CurrentVersion; AssetDatabase.CreateAsset(program, path); created = true;
            }
            if (created) { AssetDatabase.SaveAssets(); if (compile) UdonSharp.Compiler.UdonSharpCompilerV1.CompileSync(new UdonSharp.Compiler.UdonSharpCompileOptions { IsEditorBuild = true }); }
        }
        public static void Apply(Scene scene)
        {
            if (!scene.IsValid() || !scene.isLoaded) return;
            EnsurePrograms();
            var languageControls = EnsureLanguageControls(scene);
            var owners = scene.GetRootGameObjects().SelectMany(root => root.GetComponentsInChildren<UdonSharpBehaviour>(true)).ToArray();
            foreach (var root in scene.GetRootGameObjects()) {
                foreach (var text in root.GetComponentsInChildren<Text>(true)) Bind(text, null, owners);
                foreach (var text in root.GetComponentsInChildren<TextMesh>(true)) if (!text.transform.IsChildOf(languageControls.transform) && !IsLocaleDisplay(text)) Bind(null, text, owners);
            }
            var controller = languageControls.GetComponent<LabLanguageController>();
            controller.labels = scene.GetRootGameObjects().SelectMany(root => root.GetComponentsInChildren<LabLocalizedText>(true)).ToArray();
            UdonSharpEditorUtility.CopyProxyToUdon(controller);
            foreach (var button in languageControls.GetComponentsInChildren<LabLanguageButton>(true)) { button.controller = controller; UdonSharpEditorUtility.CopyProxyToUdon(button); }
        }
        internal static void Bind(Text ui, TextMesh mesh, UdonSharpBehaviour[] owners)
        {
            var target = ui != null ? ui.gameObject : mesh.gameObject;
            var local = target.GetComponent<LabLocalizedText>();
            string english = mesh != null ? mesh.text : local != null ? local.OriginalText() : ui.text;
            string source = english;
            bool dynamicHud = false;
            string marker = "";
            var protectedValues = new System.Collections.Generic.List<string>();
            if (ui != null && ui.font == null) ui.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            if (mesh != null && mesh.font == null) { mesh.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"); mesh.GetComponent<Renderer>().sharedMaterial = mesh.font.material; }
            foreach (var owner in owners) {
                if (owner.GetType().Namespace != "SensaLab" || (owner.GetType().GetField("status")?.GetValue(owner) as Text) != ui || ui == null) continue;
                dynamicHud = true;
                string kind = owner.GetType().Name;
                marker = kind == "LabController" ? "SENSA LAB / WORLD" : kind == "CapabilityStation" ? " | world-local test" : kind == "LocalProbeStation" ? "LOCAL BONE / PB PROBE"
                    : kind == "PointCaseStation" ? "\nSDK " : kind == "QuickStartStation" ? "START HERE - " : "\nPlacement: ";
                foreach (var field in owner.GetType().GetFields()) {
                    if (field.FieldType != typeof(string)) continue;
                    var value = field.GetValue(owner) as string;
                    if (!string.IsNullOrEmpty(value) && (field.Name == "title" || field.Name == "caseName" || !LabTranslationCatalog.Chinese.ContainsKey(value))) protectedValues.Add(value);
                }
                var script = MonoScript.FromMonoBehaviour(owner);
                var path = script == null ? "" : AssetDatabase.GetAssetPath(script);
                if (File.Exists(path)) source += "\n" + File.ReadAllText(path).Replace("\\n", "\n");
            }
            if (!dynamicHud && local == null && !KnownStaticText(english)) return;
            var vocabulary = LabTranslationCatalog.Chinese.Where(pair => source.Contains(pair.Key)).OrderByDescending(pair => pair.Key.Length).ToArray();
            if (vocabulary.Length == 0) return;
            if (local == null) local = UdonSharpUndo.AddComponent<LabLocalizedText>(target);
            local.uiText = ui; local.englishText = english; local.previewText = english;
            if (mesh != null) PrepareMeshDisplays(mesh, local, english);
            local.englishPhrases = vocabulary.Select(pair => pair.Key).ToArray(); local.chinesePhrases = vocabulary.Select(pair => pair.Value).ToArray();
            local.protectedValues = protectedValues.OrderByDescending(value => value.Length).ToArray(); local.templateMarker = marker;
            if (ui != null) ui.text = english;
            local.SetChinese(Locale == "zh-CN");
            local.previewText = ui != null ? ui.text : english;
            UdonSharpEditorUtility.CopyProxyToUdon(local);
            if (dynamicHud) {
                var updater = target.GetComponent<LabLocalizedTextUpdater>();
                if (updater == null) updater = UdonSharpUndo.AddComponent<LabLocalizedTextUpdater>(target);
                updater.target = local; UdonSharpEditorUtility.CopyProxyToUdon(updater);
            }
            EditorUtility.SetDirty(target);
        }
        internal static bool IsLocaleDisplay(TextMesh mesh)
        {
            var parent = mesh.transform.parent;
            var local = parent == null ? null : parent.GetComponent<LabLocalizedText>();
            return local != null && (local.englishDisplay == mesh.gameObject || local.chineseDisplay == mesh.gameObject);
        }
        private static void PrepareMeshDisplays(TextMesh source, LabLocalizedText local, string english)
        {
            string chinese;
            if (!LabTranslationCatalog.Chinese.TryGetValue(english, out chinese))
                chinese = string.Join("\n", english.Split('\n').Select(line => LabTranslationCatalog.Chinese.TryGetValue(line, out var translated) ? translated : line));
            local.englishDisplay = CopyMeshDisplay(source, local.englishDisplay, "Locale display en-US", english);
            local.chineseDisplay = CopyMeshDisplay(source, local.chineseDisplay, "Locale display zh-CN", chinese);
            // Keep the original component/text/Transform for stable IDs and Editor source validation.
            // 原组件、原文与Transform保留给稳定ID及Editor原文验证，旧Renderer停绘避免叠字。
            source.GetComponent<Renderer>().enabled = false;
        }
        private static GameObject CopyMeshDisplay(TextMesh source, GameObject existing, string name, string text)
        {
            bool rendererEnabled = existing != null ? existing.GetComponent<Renderer>().enabled : source.GetComponent<Renderer>().enabled;
            var target = existing != null ? existing : new GameObject(name, typeof(TextMesh));
            target.layer = source.gameObject.layer;
            target.transform.SetParent(source.transform, false);
            target.transform.localPosition = Vector3.zero; target.transform.localRotation = Quaternion.identity; target.transform.localScale = Vector3.one;
            var mesh = target.GetComponent<TextMesh>();
            EditorUtility.CopySerialized(source, mesh);
            mesh.text = text;
            var renderer = target.GetComponent<Renderer>();
            EditorUtility.CopySerialized(source.GetComponent<Renderer>(), renderer);
            renderer.enabled = rendererEnabled;
            return target;
        }
        private static bool KnownStaticText(string english)
        {
            if (LabTranslationCatalog.Chinese.ContainsKey(english)) return true;
            return english.Split('\n').All(line => string.IsNullOrWhiteSpace(line) || LabTranslationCatalog.Chinese.ContainsKey(line));
        }
        private static GameObject EnsureLanguageControls(Scene scene)
        {
            var existing = scene.GetRootGameObjects().FirstOrDefault(root => root.name == "Sensa Lab Language");
            if (existing != null) {
                if (existing.GetComponent<LabLanguageController>() == null) UdonSharpUndo.AddComponent<LabLanguageController>(existing);
                return existing;
            }
            var group = new GameObject("Sensa Lab Language"); SceneManager.MoveGameObjectToScene(group, scene);
            UdonSharpUndo.AddComponent<LabLanguageController>(group);
            var descriptor = scene.GetRootGameObjects().SelectMany(root => root.GetComponentsInChildren<VRCSceneDescriptor>(true)).FirstOrDefault();
            if (descriptor != null && descriptor.spawns != null && descriptor.spawns.Length > 0 && descriptor.spawns[0] != null) group.transform.position = descriptor.spawns[0].position;
            string[] values = { "auto", "en-US", "zh-CN" }, labels = { "Auto / 自动", "English", "简体中文" };
            for (int i = 0; i < values.Length; i++) {
                var button = GameObject.CreatePrimitive(PrimitiveType.Cube); button.name = "Language " + values[i]; button.transform.SetParent(group.transform, false);
                button.transform.localPosition = new Vector3((i - 1) * .25f, .7f, .65f); button.transform.localScale = new Vector3(.2f, .1f, .1f);
                var action = UdonSharpUndo.AddComponent<LabLanguageButton>(button); action.language = values[i]; UdonSharpEditorUtility.CopyProxyToUdon(action);
                var label = new GameObject("Language label").AddComponent<TextMesh>(); label.transform.SetParent(group.transform, false);
                label.transform.localPosition = new Vector3((i - 1) * .25f, .8f, .65f); label.text = labels[i]; label.fontSize = 40; label.characterSize = .006f; label.anchor = TextAnchor.MiddleCenter;
            }
            return group;
        }
    }
}
