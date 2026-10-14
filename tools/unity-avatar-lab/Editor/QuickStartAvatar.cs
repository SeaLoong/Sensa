using System;
using System.IO;
using System.Linq;
using UnityEngine;
using UnityEditor;
using UnityEditor.SceneManagement;
using VRC.SDK3.Avatars.Components;
using VRC.SDK3.Dynamics.Contact.Components;
using VRC.SDKBase.Editor.BuildPipeline;
using UnityBox.Sensa;

namespace SensaAvatarLab
{
    public static class QuickStartAvatar
    {
        public const string Scene = "Assets/SensaAvatarLab/Capabilities/QuickStart.unity";
        [MenuItem("Tools/Sensa Avatar Lab/Create first-run avatar")]
        public static void Create()
        {
            AvatarLab.PrepareTests();
            if (File.Exists(Scene)) throw new InvalidOperationException("Preserve existing first-run avatar edits before recreating.");
            var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
            var avatar = (GameObject)PrefabUtility.InstantiatePrefab(AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Amatousagi/Chocolat/Chocolat.prefab"));
            avatar.name = "Sensa Quick Start";
            avatar.GetComponent<VRC.Core.PipelineManager>().blueprintId = "";
            avatar.AddComponent<SensaQuickStart>();
            EditorSceneManager.SaveScene(scene, Scene); AssetDatabase.SaveAssets(); Validate();
        }
        [Serializable] class Report { public bool passed; public int receivers; public string[] parameters, animatorParameters; public float receiverRadius; public string scope = "SDK avatar preprocess; client OSC and hardware unverified"; }
        public static void InspectBundle()
        {
            var bundle = AssetBundle.LoadFromFile("Builds/Sensa-Chocolat-QuickStart.vrca");
            if (bundle == null) throw new InvalidOperationException("Build the first-run SDK bundle first.");
            try
            {
                var avatar = bundle.LoadAllAssets<GameObject>().Single(g => g.GetComponent<VRCAvatarDescriptor>() != null);
                var contacts = avatar.GetComponentsInChildren<VRCContactReceiver>(true).Where(r => r.parameter != null && r.parameter.StartsWith("Sensa/QuickStart/")).ToArray();
                var parameters = avatar.GetComponent<VRCAvatarDescriptor>().expressionParameters.parameters.Where(p => p.name.StartsWith("Sensa/QuickStart/")).ToArray();
                var report = new Report { receivers = contacts.Length, parameters = parameters.Select(p => p.name).ToArray(), scope = "Read actual SDK .vrca bundle; uploaded client and hardware unverified" };
                // Bundled controllers are RuntimeAnimatorController, not editor AnimatorController assets.
                // Read them through a real Animator, as the client does.
                var probe = new GameObject("Validate bundled animator parameters");
                try
                {
                    var animator = probe.AddComponent<Animator>();
                    var names = new System.Collections.Generic.HashSet<string>();
                    foreach (var layer in avatar.GetComponent<VRCAvatarDescriptor>().baseAnimationLayers)
                    {
                        if (layer.animatorController == null) continue;
                        animator.runtimeAnimatorController = layer.animatorController;
                        animator.Rebind();
                        foreach (var parameter in animator.parameters)
                            if (parameter.name.StartsWith("Sensa/QuickStart/")) names.Add(parameter.name);
                    }
                    report.animatorParameters = names.ToArray();
                }
                finally { UnityEngine.Object.DestroyImmediate(probe); }
                var depth = contacts.Single(r => r.parameter == SensaQuickStartProtocol.Depth);
                report.receiverRadius = depth.radius * depth.transform.lossyScale.x;
                report.passed = contacts.Length == 2 && contacts.All(r => r.localOnly && !r.allowSelf && !r.allowOthers)
                    && report.receiverRadius > 0 && depth.receiverType == VRC.Dynamics.ContactReceiver.ReceiverType.Proximity
                    && contacts.Any(r => r.parameter == SensaQuickStartProtocol.Depth && r.collisionTags.Contains(SensaQuickStartProtocol.DepthTag))
                    && contacts.Any(r => r.parameter == SensaQuickStartProtocol.Active && r.collisionTags.Contains(SensaQuickStartProtocol.ActiveTag))
                    && parameters.Length == 2 && parameters.All(p => !p.saved && !p.networkSynced && p.defaultValue == 0)
                    && report.parameters.All(name => report.animatorParameters.Contains(name));
                File.WriteAllText("Validation/sdk-quick-start-contents.json", JsonUtility.ToJson(report, true));
                if (!report.passed) throw new InvalidOperationException("First-run SDK bundle is missing the expected contacts or local parameters.");
            }
            finally { bundle.Unload(true); }
        }
        [MenuItem("Tools/Sensa Avatar Lab/Validate first-run avatar")]
        public static void Validate()
        {
            AvatarLab.PrepareTests(); EditorSceneManager.OpenScene(Scene);
            var source = UnityEngine.Object.FindObjectOfType<VRCAvatarDescriptor>().gameObject;
            var clone = UnityEngine.Object.Instantiate(source); source.SetActive(false);
            try
            {
                if (!VRCBuildPipelineCallbacks.OnPreprocessAvatar(clone)) throw new InvalidOperationException("SDK rejected first-run avatar.");
                var receivers = clone.GetComponentsInChildren<VRCContactReceiver>(true).Where(r => r.parameter != null && r.parameter.StartsWith("Sensa/QuickStart/")).ToArray();
                var parameters = clone.GetComponent<VRCAvatarDescriptor>().expressionParameters.parameters.Where(p => p.name.StartsWith("Sensa/QuickStart/")).ToArray();
                var depth = receivers.Single(r => r.parameter == SensaQuickStartProtocol.Depth);
                var gate = receivers.Single(r => r.parameter == SensaQuickStartProtocol.Active);
                var report = new Report { receivers = receivers.Length, parameters = parameters.Select(p => p.name).ToArray(), receiverRadius = depth.radius * depth.transform.lossyScale.x };
                report.passed = receivers.Length == 2 && receivers.All(r => r.localOnly && !r.allowSelf && !r.allowOthers)
                    && depth.collisionTags.SequenceEqual(new[] { SensaQuickStartProtocol.DepthTag })
                    && gate.collisionTags.SequenceEqual(new[] { SensaQuickStartProtocol.ActiveTag })
                    && gate.receiverType == VRC.Dynamics.ContactReceiver.ReceiverType.Constant
                    && parameters.Length == 2 && parameters.All(p => !p.networkSynced && !p.saved && p.defaultValue == 0)
                    && clone.GetComponentsInChildren<SensaQuickStart>(true).Length == 0
                    && depth.transform.IsChildOf(clone.GetComponent<Animator>().GetBoneTransform(HumanBodyBones.RightHand));
                Directory.CreateDirectory("Validation"); File.WriteAllText("Validation/quick-start-avatar.json", JsonUtility.ToJson(report, true));
                if (!report.passed) throw new InvalidOperationException("First-run avatar contract failed.");
            }
            finally { UnityEngine.Object.DestroyImmediate(clone); source.SetActive(true); }
        }
    }
}
