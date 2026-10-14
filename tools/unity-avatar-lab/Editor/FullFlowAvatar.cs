using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using UnityEngine;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityBox.Sensa;
using VRC.SDK3.Avatars.Components;
using VRC.SDK3.Dynamics.Contact.Components;
using VRC.SDK3.Dynamics.PhysBone.Components;
using VRC.SDKBase.Editor.BuildPipeline;

namespace SensaAvatarLab
{
    public static class FullFlowAvatar
    {
        public const string Scene = "Assets/SensaAvatarLab/Generated/FullFlow.unity";
        [MenuItem("Tools/Sensa Avatar Lab/Create full-flow test avatar")]
        public static void Create()
        {
            AvatarLab.PrepareTests();
            if (File.Exists(Scene)) throw new InvalidOperationException("FullFlow already exists; preserve your edits before recreating.");
            var scene = EditorSceneManager.OpenScene(AvatarLab.Root + "/Exclusive.unity");
            var avatar = UnityEngine.Object.FindObjectOfType<VRCAvatarDescriptor>().gameObject;
            avatar.name = "Sensa Chocolat FullFlow";
            avatar.GetComponent<VRC.Core.PipelineManager>().blueprintId = "";
            avatar.AddComponent<SensaQuickStart>();
            // Copy the complete shader subtree, keeping its original relative bone path so FX bindings remain valid.
            var shaderScene = EditorSceneManager.OpenScene("Assets/SensaAvatarLab/Capabilities/Shader.unity", OpenSceneMode.Additive);
            var source = shaderScene.GetRootGameObjects().Single(g => g.GetComponent<VRCAvatarDescriptor>() != null);
            var sourceHips = source.GetComponent<Animator>().GetBoneTransform(HumanBodyBones.Hips);
            var hips = avatar.GetComponent<Animator>().GetBoneTransform(HumanBodyBones.Hips);
            var bench = UnityEngine.Object.Instantiate(sourceHips.Find("Lab fixture").gameObject, hips, false); bench.name = "Lab fixture";
            var controls = UnityEngine.Object.Instantiate(source.transform.Find("Shader fault controls").gameObject, avatar.transform, false); controls.name = "Shader fault controls";
            EditorSceneManager.CloseScene(shaderScene, true);
            // The bench is self-contained; the SPS prop and measurement selectors retain their original Off defaults.
            EditorSceneManager.SetActiveScene(scene); EditorSceneManager.SaveScene(scene, Scene); AssetDatabase.SaveAssets();
            Validate();
        }
        [Serializable] public class Report
        {
            public bool passed, shaderDefaultsOff, selectorsDefaultOff, handlesGrabWithoutCollision;
            public int contacts, cameras, parameterCost;
            public string[] missingAnimatorParameters, menuLabels;
            public string scope;
        }
        public static Report Inspect(GameObject avatar, string scope)
        {
            var descriptor = avatar.GetComponent<VRCAvatarDescriptor>();
            var parameters = descriptor.expressionParameters.parameters;
            var receivers = avatar.GetComponentsInChildren<VRCContactReceiver>(true);
            var names = new HashSet<string>(); var helper = new GameObject("Inspect full-flow animator");
            try
            {
                var animator = helper.AddComponent<Animator>();
                foreach (var layer in descriptor.baseAnimationLayers)
                {
                    if (layer.animatorController == null) continue;
                    animator.runtimeAnimatorController = layer.animatorController; animator.Rebind();
                    foreach (var p in animator.parameters) names.Add(p.name);
                }
            }
            finally { UnityEngine.Object.DestroyImmediate(helper); }
            var required = receivers.Where(r => r.parameter != null && r.parameter.StartsWith("Sensa/")).Select(r => r.parameter).ToList();
            foreach (var bone in avatar.GetComponentsInChildren<VRCPhysBone>(true).Where(b => b.parameter != null && b.parameter.StartsWith("Sensa/")))
                required.AddRange(new[] { bone.parameter + "_IsGrabbed", bone.parameter + "_Stretch" });
            var baseline = AvatarLab.Inspect(avatar);
            var labels = new List<string>();
            var visited = new HashSet<VRC.SDK3.Avatars.ScriptableObjects.VRCExpressionsMenu>();
            void Menu(VRC.SDK3.Avatars.ScriptableObjects.VRCExpressionsMenu menu)
            { if (menu == null || !visited.Add(menu)) return; foreach (var control in menu.controls) { labels.Add(control.name); if (control.subMenu != null) Menu(control.subMenu); } }
            Menu(descriptor.expressionsMenu);
            var report = new Report { scope = scope, contacts = baseline.contacts, parameterCost = baseline.parameterCost,
                handlesGrabWithoutCollision = baseline.handlesGrabWithoutCollision,
                cameras = avatar.GetComponentsInChildren<Camera>(true).Length,
                missingAnimatorParameters = required.Distinct().Where(p => !names.Contains(p)).ToArray(), menuLabels = labels.ToArray(),
                shaderDefaultsOff = parameters.Any(p => p.name == "Sensa/Select/Shader" && p.defaultValue == 0 && !p.saved),
                selectorsDefaultOff = parameters.Any(p => p.name == "Sensa/Select/Lab" && p.defaultValue == 0 && !p.saved) };
            report.passed = baseline.passed && report.cameras == 2 && report.shaderDefaultsOff && report.selectorsDefaultOff
                && report.missingAnimatorParameters.Length == 0 && names.Contains(SensaQuickStartProtocol.Depth) && names.Contains(SensaQuickStartProtocol.Active)
                && parameters.Any(p => p.name == "OGB_ENABLED") && labels.Contains("Enable SPS OSC (local)") && labels.Contains("Corrupt shader CRC");
            return report;
        }
        [MenuItem("Tools/Sensa Avatar Lab/Validate full-flow test avatar")]
        public static void Validate()
        {
            AvatarLab.PrepareTests(); EditorSceneManager.OpenScene(Scene);
            var source = UnityEngine.Object.FindObjectOfType<VRCAvatarDescriptor>().gameObject;
            var clone = UnityEngine.Object.Instantiate(source); clone.name = source.name + "(Clone)"; source.SetActive(false);
            try
            {
                if (!VRCBuildPipelineCallbacks.OnPreprocessAvatar(clone)) throw new InvalidOperationException("FullFlow SDK preprocess failed.");
                var report = Inspect(clone, "SDK preprocessing; client OSC, VR grabbing and hardware not tested");
                Directory.CreateDirectory("Validation"); File.WriteAllText("Validation/full-flow.json", JsonUtility.ToJson(report, true));
                AvatarLab.Capture(clone, "Validation/avatar-FullFlow.png");
                if (!report.passed) throw new InvalidOperationException("FullFlow contract failed. See Validation/full-flow.json");
            }
            finally { UnityEngine.Object.DestroyImmediate(clone); source.SetActive(true); }
        }
        public static void InspectBundle()
        {
            var bundle = AssetBundle.LoadFromFile("Builds/Sensa-Chocolat-FullFlow.vrca");
            if (bundle == null) throw new InvalidOperationException("Build FullFlow first.");
            try
            {
                var avatar = bundle.LoadAllAssets<GameObject>().Single(g => g.GetComponent<VRCAvatarDescriptor>() != null);
                var report = Inspect(avatar, "Actual SDK bundle; client OSC, VR grabbing and hardware not tested");
                File.WriteAllText("Validation/sdk-full-flow-contents.json", JsonUtility.ToJson(report, true));
                if (!report.passed) throw new InvalidOperationException("FullFlow bundle contract failed.");
            }
            finally { bundle.Unload(true); }
        }
    }
}
