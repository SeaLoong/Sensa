#if UNITY_INCLUDE_TESTS
using System;
using System.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using nadena.dev.modular_avatar.core;

namespace UnityBox.Sensa.Tests
{
    // No test reads or writes the user's preference store, or relies on the runner's OS locale.
    internal sealed class MemoryEditorLocale : IDisposable
    {
        private readonly Func<string> read = SensaEditorLocalization.ReadPreference;
        private readonly Action<string> write = SensaEditorLocalization.WritePreference;
        private readonly Func<SystemLanguage?> editor = SensaEditorLocalization.ReadEditorLanguage;
        private readonly Func<SystemLanguage> system = SensaEditorLocalization.ReadSystemLanguage;
        internal string Preference = SensaEditorLocalization.Automatic;
        internal SystemLanguage? EditorLanguage = SystemLanguage.English;
        internal SystemLanguage SystemLanguageValue = SystemLanguage.English;
        internal MemoryEditorLocale()
        {
            SensaEditorLocalization.ReadPreference = () => Preference;
            SensaEditorLocalization.WritePreference = value => Preference = value;
            SensaEditorLocalization.ReadEditorLanguage = () => EditorLanguage;
            SensaEditorLocalization.ReadSystemLanguage = () => SystemLanguageValue;
        }
        public void Dispose()
        {
            SensaEditorLocalization.ReadPreference = read;
            SensaEditorLocalization.WritePreference = write;
            SensaEditorLocalization.ReadEditorLanguage = editor;
            SensaEditorLocalization.ReadSystemLanguage = system;
        }
    }

    public sealed class EditorLocalizationContracts
    {
        private MemoryEditorLocale locale;
        [SetUp] public void SetUp() => locale = new MemoryEditorLocale();
        [TearDown] public void TearDown() => locale.Dispose();

        [TestCase("auto", SystemLanguage.English, true, SystemLanguage.Chinese, "en-US")]
        [TestCase("auto", SystemLanguage.Japanese, true, SystemLanguage.ChineseSimplified, "en-US")]
        [TestCase("auto", SystemLanguage.Chinese, true, SystemLanguage.English, "zh-CN")]
        [TestCase("auto", SystemLanguage.ChineseTraditional, true, SystemLanguage.English, "zh-CN")]
        [TestCase("auto", SystemLanguage.ChineseSimplified, true, SystemLanguage.English, "zh-CN")]
        [TestCase("auto", SystemLanguage.Unknown, false, SystemLanguage.ChineseTraditional, "zh-CN")]
        [TestCase("auto", SystemLanguage.Unknown, false, SystemLanguage.French, "en-US")]
        [TestCase("zh-Hant-HK", SystemLanguage.English, true, SystemLanguage.English, "zh-CN")]
        [TestCase("ZH_tw", SystemLanguage.English, true, SystemLanguage.English, "zh-CN")]
        [TestCase("en-GB", SystemLanguage.Chinese, true, SystemLanguage.Chinese, "en-US")]
        [TestCase("unsupported", SystemLanguage.Chinese, true, SystemLanguage.Chinese, "en-US")]
        public void ExplicitPreferenceThenEditorThenSystemWithEnglishFallback(string preference, SystemLanguage editor, bool available, SystemLanguage system, string expected)
        {
            Assert.AreEqual(expected, SensaEditorLocalization.ResolveLocale(preference, available ? editor : (SystemLanguage?)null, system));
        }

        [Test] public void ExplicitPreferencePersistsInInjectedStoreAndDoesNotReadEnvironment()
        {
            SensaEditorLocalization.SetPreference("zh-Hant");
            Assert.AreEqual("zh-CN", locale.Preference);
            SensaEditorLocalization.ReadEditorLanguage = () => throw new InvalidOperationException("Must not inspect editor for explicit preference.");
            SensaEditorLocalization.ReadSystemLanguage = () => throw new InvalidOperationException("Must not inspect OS for explicit preference.");
            Assert.AreEqual("zh-CN", SensaEditorLocalization.Locale);
            SensaEditorLocalization.SetPreference("en-US");
            Assert.AreEqual("en-US", locale.Preference);
            Assert.AreEqual("en-US", SensaEditorLocalization.Locale);
        }

        private static class BrokenEditorLanguage
        {
            public static SystemLanguage currentEditorLanguage => throw new InvalidOperationException("API unavailable.");
        }
        private static class DisabledEditorLocalization
        {
            public static bool enableEditorLocalization => false;
            public static SystemLanguage currentEditorLanguage => SystemLanguage.Chinese;
        }
        [Test] public void InternalEditorApiFailureFallsBackButDisabledLocalizationMeansEnglishUi()
        {
            Assert.IsNull(SensaEditorLocalization.ReadEditorLanguageFrom(typeof(object)));
            Assert.IsNull(SensaEditorLocalization.ReadEditorLanguageFrom(typeof(BrokenEditorLanguage)));
            Assert.AreEqual(SystemLanguage.English, SensaEditorLocalization.ReadEditorLanguageFrom(typeof(DisabledEditorLocalization)));
            SensaEditorLocalization.ReadEditorLanguage = () => SensaEditorLocalization.ReadEditorLanguageFrom(typeof(BrokenEditorLanguage));
            locale.SystemLanguageValue = SystemLanguage.ChineseTraditional;
            Assert.AreEqual("zh-CN", SensaEditorLocalization.Locale);
        }

        [Test] public void ReturningToAutomaticResumesEnvironmentAndUnknownTextKeepsEnglishFallback()
        {
            SensaEditorLocalization.SetPreference("zh");
            SensaEditorLocalization.SetPreference("auto");
            Assert.AreEqual("auto", locale.Preference);
            locale.EditorLanguage = SystemLanguage.German;
            locale.SystemLanguageValue = SystemLanguage.Chinese;
            Assert.AreEqual("en-US", SensaEditorLocalization.Locale);
            Assert.AreEqual("New untranslated text", SensaEditorLocalization.Text("New untranslated text"));
            locale.EditorLanguage = SystemLanguage.Chinese;
            Assert.AreEqual("New untranslated text", SensaEditorLocalization.Text("New untranslated text"));
            Assert.AreEqual("English fallback", SensaEditorLocalization.Text("English fallback", ""));
        }

        [Test] public void NestedFieldsEnumsAndTooltipsRelabelWithoutChangingSerializedDataOrTokens()
        {
            var host = new GameObject("Locale contract");
            try
            {
                var component = host.AddComponent<SensaComponent>();
                component.instanceName = "User_Name";
                component.auxSignals.Add(new AuxSignal { label = "User label", sourceType = AuxSignalSourceType.ExistingParameter,
                    role = AuxSignalRole.GateEnable, existingParameterName = "Custom/Original" });
                var before = JsonUtility.ToJson(component);
                var serialized = new SerializedObject(component);
                var aux = serialized.FindProperty("auxSignals").GetArrayElementAtIndex(0);
                var source = aux.FindPropertyRelative("sourceType");
                var role = aux.FindPropertyRelative("role");
                var path = source.propertyPath;
                var tokens = source.enumNames.ToArray();
                Assert.AreEqual("Signal source", SensaInspectorLabels.Label(source).text);
                Assert.AreEqual("Enable gate", SensaInspectorLabels.EnumLabel(role.enumNames[role.enumValueIndex]).text);
                locale.Preference = "zh-CN";
                Assert.AreEqual("信号来源", SensaInspectorLabels.Label(source).text);
                Assert.AreEqual("启用门控", SensaInspectorLabels.EnumLabel(role.enumNames[role.enumValueIndex]).text);
                Assert.That(SensaInspectorLabels.Label(serialized.FindProperty("depthAxis")).tooltip, Does.Contain("朝内"));
                Assert.AreEqual(path, source.propertyPath);
                CollectionAssert.AreEqual(tokens, source.enumNames);
                Assert.AreEqual(before, JsonUtility.ToJson(component));
                CollectionAssert.Contains(component.GetExpectedParameters(), "Custom/Original");
            }
            finally { UnityEngine.Object.DestroyImmediate(host); }
        }

        [Test] public void ShaderAuthorInspectorIncludesLocalizedTooltipAndPreservesViewportAndProducer()
        {
            var host = new GameObject("Shader locale contract");
            try
            {
                var capture = host.AddComponent<SensaShaderCapture>();
                capture.producerId = 42;
                var before = JsonUtility.ToJson(capture);
                var serialized = new SerializedObject(capture);
                Assert.AreEqual("SPS target", SensaInspectorLabels.Label(serialized.FindProperty("spsTarget")).text);
                Assert.That(SensaInspectorLabels.Label(serialized.FindProperty("spsTarget")).tooltip, Does.Contain("Object containing"));
                locale.Preference = "zh-CN";
                Assert.AreEqual("生产端 ID", SensaInspectorLabels.Label(serialized.FindProperty("producerId")).text);
                Assert.That(SensaInspectorLabels.Label(serialized.FindProperty("desktopViewport")).tooltip, Does.Contain("不保证"));
                Assert.AreEqual(before, JsonUtility.ToJson(capture));
            }
            finally { UnityEngine.Object.DestroyImmediate(host); }
        }

        [Test] public void ValidationUsesSelectedLanguageWithoutChangingProtocolIdentifiers()
        {
            var english = Assert.Throws<InvalidOperationException>(() => SensaSpsAdapter.ReadRoot(null)).Message;
            locale.Preference = "zh-CN";
            var chinese = Assert.Throws<InvalidOperationException>(() => SensaSpsAdapter.ReadRoot(null)).Message;
            Assert.AreEqual("Choose an explicit SPS root.", english);
            Assert.That(chinese, Does.Contain("请选择"));
            Assert.That(chinese, Does.Not.Contain("Choose"));
            Assert.AreEqual("Sensa/SPS", SensaFixedAnchorProtocol.Prefix);
            Assert.That(SensaEditorLocalization.Format("Sensa Contact budget exceeded: existing {0} + generated {1} > 256.", 250, 10),
                Does.Contain("250").And.Contain("10"));
        }
    }

    public sealed class LocalizedAvatarMenuContracts : AvatarBuildFixture
    {
        [TestCase("en-US", "Off")]
        [TestCase("zh-CN", "关闭")]
        public void MenuLanguageIsBakedFromAuthorPreferenceWhileControlIdsAndSlotsStayStable(string language, string off)
        {
            using (var locale = new MemoryEditorLocale())
            {
                locale.Preference = language;
                var host = Child("Localized menu", Vector3.zero);
                var rig = Child("Generated rig", Vector3.zero);
                SensaSelectionAnimator.Build(avatar, host, "LocaleGroup", new[] { rig }, new[] { "User target" });
                var menu = host.GetComponent<ModularAvatarMenuInstaller>().menuToAppend.controls[0].subMenu;
                Assert.AreEqual(off, menu.controls[0].name);
                Assert.AreEqual("User target", menu.controls[1].name);
                Assert.AreEqual("Sensa/Select/LocaleGroup", menu.controls[1].parameter.name);
                Assert.AreEqual(1, menu.controls[1].value);
                Assert.AreEqual(0, menu.controls[0].value);
                Assert.IsFalse(rig.activeSelf);
            }
        }
    }
}
#endif
