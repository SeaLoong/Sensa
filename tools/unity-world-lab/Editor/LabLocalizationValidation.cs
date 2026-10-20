using System;
using System.Reflection;
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;
using UdonSharp;
using UdonSharpEditor;

namespace SensaLab
{
    // Editor-only compilation and pure presentation checks. No scene, PlayMode, GPU or device test.
    // 仅Editor编译与纯文字检查，不创建实验场景、不进PlayMode、不采集GPU或操作设备。
    public static class LabLocalizationValidation
    {
        private static void Require(bool condition, string name) { if (!condition) throw new InvalidOperationException(name); }
        private static void ValidateMeshDisplays(GameObject fixture)
        {
            var sourceObject = new GameObject("Stable source label", typeof(TextMesh));
            sourceObject.transform.SetParent(fixture.transform, false);
            sourceObject.transform.localPosition = new Vector3(.2f, .4f, .6f);
            sourceObject.transform.localRotation = Quaternion.Euler(5, 10, 15);
            sourceObject.transform.localScale = new Vector3(.8f, 1.1f, .9f);
            var source = sourceObject.GetComponent<TextMesh>();
            source.text = "LEFT\nRIGHT"; source.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            source.fontSize = 36; source.characterSize = .015f; source.anchor = TextAnchor.MiddleRight;
            source.alignment = TextAlignment.Center; source.fontStyle = FontStyle.Bold; source.lineSpacing = 1.2f;
            source.offsetZ = .012f; source.tabSize = 5; source.richText = false; source.color = new Color(.2f, .4f, .6f);
            var sourceRenderer = sourceObject.GetComponent<Renderer>();
            sourceRenderer.sharedMaterial = source.font.material; sourceRenderer.sortingOrder = 7;
            LabEditorLocalization.Bind(null, source, new UdonSharpBehaviour[0]);
            var display = sourceObject.GetComponent<LabLocalizedText>();
            Require(display != null && display.uiText == null && display.englishDisplay != null && display.chineseDisplay != null, "Static mesh uses display GameObjects, not an Udon TextMesh API");
            var english = display.englishDisplay; var chinese = display.chineseDisplay;
            Require(english.GetComponent<TextMesh>().text == "LEFT\nRIGHT" && chinese.GetComponent<TextMesh>().text == "左手\n右手", "Static bilingual content");
            foreach (var child in new[] { english, chinese }) {
                var mesh = child.GetComponent<TextMesh>(); var renderer = child.GetComponent<Renderer>();
                Require(child.transform.parent == source.transform && child.transform.localPosition == Vector3.zero && child.transform.localRotation == Quaternion.identity && child.transform.localScale == Vector3.one, "Display inherits original spatial geometry");
                Require(mesh.font == source.font && mesh.fontSize == source.fontSize && mesh.characterSize == source.characterSize && mesh.anchor == source.anchor && mesh.alignment == source.alignment && mesh.fontStyle == source.fontStyle && mesh.lineSpacing == source.lineSpacing && mesh.offsetZ == source.offsetZ && mesh.tabSize == source.tabSize && mesh.richText == source.richText && mesh.color == source.color, "Copy all native glyph geometry and styling");
                Require(renderer.enabled && renderer.sharedMaterial == sourceRenderer.sharedMaterial && renderer.sortingOrder == 7, "Copy native material and sorting");
                Require(LabEditorLocalization.IsLocaleDisplay(mesh) && child.GetComponent<LabLocalizedText>() == null, "Display children are skipped rather than recursively localized");
            }
            display.SetChinese(true);
            Require(!english.activeSelf && chinese.activeSelf && fixture.activeSelf && sourceObject.activeSelf, "Chinese switch only changes display children");
            display.SetChinese(false);
            Require(english.activeSelf && !chinese.activeSelf && source.text == "LEFT\nRIGHT" && display.OriginalText() == source.text && !sourceRenderer.enabled, "English source and original component remain intact without double rendering");
            foreach (var candidate in fixture.GetComponentsInChildren<TextMesh>(true))
                if (!LabEditorLocalization.IsLocaleDisplay(candidate)) LabEditorLocalization.Bind(null, candidate, new UdonSharpBehaviour[0]);
            Require(sourceObject.GetComponentsInChildren<TextMesh>(true).Length == 3 && display.englishDisplay == english && display.chineseDisplay == chinese, "Repeated preparation reuses exactly two display meshes");
            Require(english.GetComponent<Renderer>().enabled && chinese.GetComponent<Renderer>().enabled, "Repeated preparation preserves display renderer state");
            Require(sourceObject.name == "Stable source label" && sourceObject.transform.localPosition == new Vector3(.2f, .4f, .6f) && sourceObject.transform.localRotation == Quaternion.Euler(5, 10, 15) && sourceObject.transform.localScale == new Vector3(.8f, 1.1f, .9f), "Stable source ID and Transform survive preparation");
        }
        [MenuItem("Tools/Sensa Lab/Validate localization (Editor only)")]
        public static void Run()
        {
            GameObject fixture = null;
            try {
                LabEditorLocalization.EnsurePrograms(false);
                UdonSharp.Compiler.UdonSharpCompilerV1.CompileSync(new UdonSharp.Compiler.UdonSharpCompileOptions { IsEditorBuild = true });
                Require(!UdonSharpProgramAsset.AnyUdonSharpScriptHasError(), "Udon compilation failed.");
                Require(LabEditorLocalization.ResolveLocale("auto", SystemLanguage.ChineseSimplified, SystemLanguage.English) == "zh-CN", "Editor language precedence");
                Require(LabEditorLocalization.ResolveLocale("en-US", SystemLanguage.ChineseSimplified, SystemLanguage.Chinese) == "en-US", "Explicit English");
                Require(LabEditorLocalization.ResolveLocale("auto", SystemLanguage.Japanese, SystemLanguage.Chinese) == "en-US", "Unsupported editor uses English");
                Require(LabEditorLocalization.ResolveLocale("auto", null, SystemLanguage.ChineseSimplified) == "zh-CN", "Unavailable editor uses OS");
                fixture = new GameObject("Sensa localization pure fixture") { hideFlags = HideFlags.HideAndDontSave };
                var text = fixture.AddComponent<Text>();
                var display = UdonSharpUndo.AddComponent<LabLocalizedText>(fixture);
                const string source = "START HERE - Sensor STOP\nUser NEAR\nOSC: Sensa/STOP/NEAR OGB/Orf/User/STOP\nDepth=0.42";
                display.uiText = text; display.englishText = source; display.previewText = source; text.text = source;
                display.templateMarker = "START HERE - ";
                display.englishPhrases = new[] { "START HERE - ", "STOP", "NEAR" };
                display.chinesePhrases = new[] { "从这里开始：", "停止", "靠近" };
                display.protectedValues = new[] { "Sensor STOP", "User NEAR" };
                display.SetChinese(true);
                Require(text.text == "从这里开始：Sensor STOP\nUser NEAR\nOSC: Sensa/STOP/NEAR OGB/Orf/User/STOP\nDepth=0.42", "Preserve dynamic names, paths and numeric values");
                Require(display.OriginalText() == source, "Source survives localized rendering");
                display.SetChinese(false); Require(text.text == source, "Return to English without state callbacks");
                display.SetChinese(true); display.SetChinese(true); Require(!text.text.Contains("\u001f"), "No placeholder leaks");
                const string external = "External failure STOP at Sensa/STOP/NEAR";
                text.text = external; display.Present(); Require(text.text == external, "Unknown external error stays verbatim");
                ValidateMeshDisplays(fixture);
                var controller = UdonSharpUndo.AddComponent<LabLanguageController>(fixture);
                Require(controller.ResolveChinese("auto", "zh-CN"), "VRChat automatic Chinese");
                Require(!controller.ResolveChinese("en-US", "zh-CN"), "Local English overrides VRChat");
                Require(controller.ResolveChinese("zh-CN", "en"), "Local Chinese overrides VRChat");
                Require(!controller.ResolveChinese("auto", "fr"), "Unsupported client language uses English");
                Require(typeof(LabLocalizedText).GetMethod("LateUpdate", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic) == null, "Static labels do not poll");
                var font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
                Debug.Log("SENSA_LAB_LOCALIZATION_VALIDATION_PASS font=" + font.name + " dynamic=" + font.dynamic + " baseChineseGlyph=" + font.HasCharacter('中'));
                if (Application.isBatchMode) EditorApplication.Exit(0);
            } catch (Exception error) {
                Debug.LogException(error);
                if (Application.isBatchMode) EditorApplication.Exit(1); else throw;
            } finally { if (fixture != null) UnityEngine.Object.DestroyImmediate(fixture); }
        }
    }
}
