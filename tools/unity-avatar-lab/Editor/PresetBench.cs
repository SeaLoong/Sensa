using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using nadena.dev.modular_avatar.core;
using UnityBox.Sensa;
using UnityEditor;
using UnityEditor.Animations;
using UnityEditor.SceneManagement;
using UnityEngine;
using VRC.Dynamics;
using VRC.SDK3.Avatars.Components;
using VRC.SDK3.Avatars.ScriptableObjects;
using VRC.SDK3.Dynamics.Contact.Components;
using VRC.SDK3.Dynamics.PhysBone.Components;

namespace SensaAvatarLab
{
    public static class PresetBench
    {
        const string Folder = "Assets/SensaAvatarLab/PresetBench";
        public const string Scene = Folder + "/PresetBench.unity";
        const string Step = "Sensa/Lab/RootStep";
        const string Reports = "SenderType,SenderLocalPosition,SenderVelocity,PointSeparation,ProximitySpeed";
        static readonly string[] ContactFields = { "MyContact", "MyContact_SenderType", "MyContact_SenderLocalPositionX",
            "MyContact_SenderLocalPositionY", "MyContact_SenderLocalPositionZ", "MyContact_SenderVelocityX",
            "MyContact_SenderVelocityY", "MyContact_SenderVelocityZ", "MyContact_SenderVelocityMagnitude",
            "MyContact_PointSeparation", "MyContact_ProximitySpeed" };
        static readonly Vector3[] Steps = { Vector3.zero, Vector3.up, Vector3.down, Vector3.forward,
            Vector3.back, Vector3.right, Vector3.left };
        static readonly string[] StepNames = { "Center", "Y+  L0", "Y-  L0", "Z+  L1", "Z-  L1", "X+  L2", "X-  L2" };

        static Transform Node(Transform parent, string name, Vector3 position)
        {
            var node = SensaSensorUtility.Child(parent, name);
            node.localPosition = position;
            return node;
        }

        static Transform Visual(Transform parent, string name, PrimitiveType shape, Vector3 offset, Vector3 size)
        {
            var node = GameObject.CreatePrimitive(shape);
            node.name = name;
            node.transform.SetParent(parent, false);
            node.transform.localPosition = offset;
            node.transform.localScale = size;
            UnityEngine.Object.DestroyImmediate(node.GetComponent<Collider>());
            return node.transform;
        }

        static VRCExpressionsMenu Menu(string name)
        {
            var menu = ScriptableObject.CreateInstance<VRCExpressionsMenu>();
            AssetDatabase.CreateAsset(menu, Folder + "/" + name + ".asset");
            return menu;
        }

        static void Submenu(VRCExpressionsMenu parent, string label, VRCExpressionsMenu child)
        {
            parent.controls.Add(new VRCExpressionsMenu.Control { name = label, type = VRCExpressionsMenu.Control.ControlType.SubMenu, subMenu = child });
        }

        [MenuItem("Tools/Sensa Avatar Lab/Create preset axis bench")]
        public static void Create()
        {
            AvatarLab.PrepareTests();
            if (File.Exists(Scene)) { EditorSceneManager.OpenScene(Scene); return; }
            var advanced = typeof(VRCContactReceiver).GetField("advancedParameters");
            if (advanced == null || !advanced.FieldType.IsEnum)
                throw new InvalidOperationException("PresetBench requires matching VRChat Avatars and Base SDK 3.10.6 or newer.");
            var flags = Enum.Parse(advanced.FieldType, Reports);
            Directory.CreateDirectory(Folder);
            AssetDatabase.Refresh();
            var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
            var model = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Amatousagi/Chocolat/Chocolat.prefab");
            if (model == null) throw new InvalidOperationException("Import the lab's Chocolat model first.");
            var avatar = (GameObject)PrefabUtility.InstantiatePrefab(model);
            avatar.name = "Sensa PresetBench";
            avatar.GetComponent<VRC.Core.PipelineManager>().blueprintId = "";
            var bench = Node(avatar.transform, "Preset bench", Vector3.zero);
            var dock = Node(bench, "Main", new Vector3(0, 1, .36f));
            // Face inward so a plug approaching the front of the wearer travels along socket +Z.
            dock.localRotation = Quaternion.Euler(0, 180, 0);
            for (int i = 0; i < 4; i++)
            {
                bool vertical = i < 2;
                float side = i % 2 == 0 ? -.045f : .045f;
                Visual(dock, "Entry edge " + i, PrimitiveType.Cube, vertical ? Vector3.right * side : Vector3.up * side,
                    vertical ? new Vector3(.005f, .095f, .005f) : new Vector3(.095f, .005f, .005f));
            }
            var profile = ScriptableObject.CreateInstance<SensaPoseProfile>();
            profile.channel = "LabPair";
            AssetDatabase.CreateAsset(profile, Folder + "/LabPair.asset");
            dock.gameObject.AddComponent<SensaPoseSocket>().profile = profile;
            var contact = dock.gameObject.AddComponent<VRCContactReceiver>();
            contact.parameter = "MyContact";
            contact.radius = .21f;
            contact.receiverType = ContactReceiver.ReceiverType.Proximity;
            contact.localOnly = true;
            contact.allowSelf = false;
            contact.allowOthers = true;
            contact.collisionTags = new List<string> { "SensaLabContact" };
            advanced.SetValue(contact, flags);

            var target = Node(bench, "Root target", Vector3.up);
            // A visible witness in front of the model follows the same translation as its internal target.
            Visual(target, "Root witness", PrimitiveType.Cube, new Vector3(.22f, 0, .34f), Vector3.one * .025f);
            bench.gameObject.AddComponent<SensaFixedRootProbe>().target = target;
            bench.gameObject.AddComponent<SensaContactRootProbe>().target = target;
            var handle = Node(bench, "Stretch handle", new Vector3(-.22f, 1, .28f));
            var joint = Node(handle, "Joint", Vector3.forward * .06f);
            var grip = Node(joint, "Grip", Vector3.forward * .06f);
            var pb = handle.gameObject.AddComponent<VRCPhysBone>();
            pb.rootTransform = handle;
            pb.parameter = "MyPB";
            pb.radius = .03f;
            pb.pull = .2f;
            pb.maxStretch = .5f;
            pb.grabMovement = 1;
            pb.allowGrabbing = VRCPhysBoneBase.AdvancedBool.True;
            pb.allowCollision = pb.allowPosing = VRCPhysBoneBase.AdvancedBool.False;
            pb.ignoreTransforms.Add(Visual(grip, "Grab ball", PrimitiveType.Sphere, Vector3.zero, Vector3.one * .045f));

            var fx = AnimatorController.CreateAnimatorControllerAtPath(Folder + "/Bench.controller");
            void Declare(string name, ParameterSyncType type, bool sync = false)
            {
                SensaSensorUtility.Parameter(bench.gameObject, name, type, sync);
                fx.AddParameter(name, type == ParameterSyncType.Float ? AnimatorControllerParameterType.Float :
                    type == ParameterSyncType.Int ? AnimatorControllerParameterType.Int : AnimatorControllerParameterType.Bool);
            }
            foreach (var field in ContactFields) Declare(field, field == "MyContact_SenderType" ? ParameterSyncType.Int : ParameterSyncType.Float);
            Declare("MyPB_Stretch", ParameterSyncType.Float);
            Declare("MyPB_IsGrabbed", ParameterSyncType.Bool);
            Declare(Step, ParameterSyncType.Int, true);
            Declare("Depth", ParameterSyncType.Float, true);
            var machine = fx.layers[0].stateMachine;
            var installer = Menu("Installer");
            var controls = Menu("Preset controls");
            var steps = Menu("Root steps");
            Submenu(installer, "Preset bench", controls);
            Submenu(controls, "Root XYZ", steps);
            controls.controls.Add(new VRCExpressionsMenu.Control { name = "Depth / L0", type = VRCExpressionsMenu.Control.ControlType.RadialPuppet,
                subParameters = new[] { new VRCExpressionsMenu.Control.Parameter { name = "Depth" } } });
            for (int i = 0; i < Steps.Length; i++)
            {
                var clip = new AnimationClip { name = StepNames[i] };
                var point = Vector3.up + Steps[i] * .10f;
                string path = AnimationUtility.CalculateTransformPath(target, avatar.transform);
                for (int axis = 0; axis < 3; axis++)
                    clip.SetCurve(path, typeof(Transform), "localPosition." + "xyz"[axis], AnimationCurve.Constant(0, 1, point[axis]));
                AssetDatabase.AddObjectToAsset(clip, fx);
                var state = machine.AddState(clip.name);
                state.motion = clip;
                state.writeDefaultValues = false;
                if (i == 0) machine.defaultState = state;
                var transition = machine.AddAnyStateTransition(state);
                transition.AddCondition(AnimatorConditionMode.Equals, i, Step);
                transition.canTransitionToSelf = false;
                transition.hasExitTime = false;
                transition.hasFixedDuration = true;
                transition.duration = .6f;
                steps.controls.Add(new VRCExpressionsMenu.Control { name = StepNames[i], type = VRCExpressionsMenu.Control.ControlType.Toggle,
                    parameter = new VRCExpressionsMenu.Control.Parameter { name = Step }, value = i });
            }
            var merge = bench.gameObject.AddComponent<ModularAvatarMergeAnimator>();
            merge.animator = fx;
            merge.layerType = VRCAvatarDescriptor.AnimLayerType.FX;
            merge.pathMode = MergeAnimatorPathMode.Absolute;
            bench.gameObject.AddComponent<ModularAvatarMenuInstaller>().menuToAppend = installer;
            foreach (var asset in new UnityEngine.Object[] { fx, installer, controls, steps }) EditorUtility.SetDirty(asset);
            AssetDatabase.SaveAssets();
            if (!EditorSceneManager.SaveScene(scene, Scene)) throw new IOException("Could not save " + Scene);
        }

        static IEnumerable<VRCExpressionsMenu.Control> Controls(VRCExpressionsMenu menu, HashSet<VRCExpressionsMenu> visited)
        {
            if (menu == null || !visited.Add(menu)) yield break;
            foreach (var control in menu.controls)
            {
                yield return control;
                foreach (var child in Controls(control.subMenu, visited)) yield return child;
            }
        }

        // Sample the serialized authoring clips on a fresh hierarchy, including all zero-valued axes.
        static void ValidateSteps()
        {
            var controller = AssetDatabase.LoadAssetAtPath<AnimatorController>(Folder + "/Bench.controller");
            var scene = EditorSceneManager.OpenScene(Scene);
            var avatar = scene.GetRootGameObjects().Single(g => g.GetComponent<VRCAvatarDescriptor>() != null);
            var probe = avatar.GetComponentInChildren<SensaFixedRootProbe>();
            if (probe.target != avatar.GetComponentInChildren<SensaContactRootProbe>().target)
                throw new InvalidOperationException("The two root trackers must follow the same target.");
            string path = AnimationUtility.CalculateTransformPath(probe.target.transform, avatar.transform);
            var helper = new GameObject("Sample root steps");
            try
            {
                var target = helper.transform;
                foreach (string part in path.Split('/')) target = Node(target, part, Vector3.zero);
                var machine = controller.layers[0].stateMachine;
                for (int i = 0; i < Steps.Length; i++)
                {
                    var transition = machine.anyStateTransitions.Single(t => t.conditions.Any(c =>
                        c.parameter == Step && c.mode == AnimatorConditionMode.Equals && c.threshold == i));
                    target.localPosition = Vector3.one * 9;
                    ((AnimationClip)transition.destinationState.motion).SampleAnimation(helper, 0);
                    if (Vector3.Distance(target.localPosition, Vector3.up + .10f * Steps[i]) > .00001f)
                        throw new InvalidOperationException("Incorrect root step: " + StepNames[i]);
                }
            }
            finally { UnityEngine.Object.DestroyImmediate(helper); }
        }

        [Serializable] class BundleReport
        {
            public int verifiedParameters, rootSteps, poseReceivers;
            public string avatarsSdk, vrcFury;
            public string[] sharedParameters;
        }

        public static void InspectBundle()
        {
            ValidateSteps();
            var bundle = AssetBundle.LoadFromFile("Builds/Sensa-Chocolat-PresetBench.vrca");
            if (bundle == null) throw new IOException("Build PresetBench first.");
            try
            {
                var avatar = bundle.LoadAllAssets<GameObject>().Single(g => g.GetComponent<VRCAvatarDescriptor>() != null);
                var descriptor = avatar.GetComponent<VRCAvatarDescriptor>();
                var parameters = descriptor.expressionParameters.parameters;
                var receivers = avatar.GetComponentsInChildren<VRCContactReceiver>(true);
                var native = receivers.Single(r => r.parameter == "MyContact");
                var required = ContactFields.Concat(new[] { "MyPB_Stretch", "MyPB_IsGrabbed", "Depth", Step, "Sensa/SPS/Root/Sample" })
                    .Concat(Enumerable.Range(0, 4).Select(i => "Sensa/SPS/Root/P" + i))
                    .Concat(SensaContactProtocol.PublicLeaves.Select(leaf => "Sensa/Contact/Root/" + leaf))
                    .Concat(SensaPoseProtocol.Markers.SelectMany(marker => Enumerable.Range(0, 8)
                        .Select(i => "Sensa/Pose/v1/Main/Others/" + marker + "/A" + i))).ToArray();
                var helper = new GameObject("Inspect PresetBench FX");
                try
                {
                    var animator = helper.AddComponent<Animator>();
                    animator.runtimeAnimatorController = descriptor.baseAnimationLayers.Single(l => l.type == VRCAvatarDescriptor.AnimLayerType.FX).animatorController;
                    animator.Rebind();
                    var fxNames = new HashSet<string>(animator.parameters.Select(p => p.name));
                    var missing = required.Where(name => !fxNames.Contains(name) || !parameters.Any(p => p.name == name &&
                        p.networkSynced == (name == Step || name == "Depth"))).ToArray();
                    if (missing.Length != 0) throw new InvalidOperationException("Missing FX/expression/sync contract: " + string.Join(", ", missing));
                }
                finally { UnityEngine.Object.DestroyImmediate(helper); }
                var controls = Controls(descriptor.expressionsMenu, new HashSet<VRCExpressionsMenu>()).ToArray();
                if (Enumerable.Range(0, Steps.Length).Any(i => !controls.Any(c => c.type == VRCExpressionsMenu.Control.ControlType.Toggle &&
                    c.parameter?.name == Step && c.value == i)) || !controls.Any(c => c.type == VRCExpressionsMenu.Control.ControlType.RadialPuppet &&
                    c.subParameters.Any(p => p.name == "Depth")))
                    throw new InvalidOperationException("Root steps or Depth dial missing from built expression menu.");
                var field = native.GetType().GetField("advancedParameters");
                if (!native.allowOthers || !native.collisionTags.Contains("SensaLabContact") || !Equals(field.GetValue(native), Enum.Parse(field.FieldType, Reports)) ||
                    !avatar.GetComponentsInChildren<VRCPhysBone>(true).Any(b => b.parameter == "MyPB" && b.maxStretch > 0) ||
                    receivers.Count(r => r.parameter != null && r.parameter.StartsWith("Sensa/Pose/v1/Main/Others/")) != 24)
                    throw new InvalidOperationException("PresetBench native inputs did not survive the SDK build.");
                File.WriteAllText("Validation/sdk-preset-bench-contents.json", JsonUtility.ToJson(new BundleReport {
                    avatarsSdk = UnityEditor.PackageManager.PackageInfo.FindForAssetPath("Packages/com.vrchat.avatars/package.json").version,
                    vrcFury = UnityEditor.PackageManager.PackageInfo.FindForAssetPath("Packages/com.vrcfury.vrcfury/package.json").version,
                    verifiedParameters = required.Length, rootSteps = Steps.Length, poseReceivers = 24,
                    sharedParameters = new[] { Step, "Depth" }
                }, true));
                Debug.Log("SENSA_PRESET_BENCH_VALIDATED " + required.Length + " FX/expression parameters");
            }
            finally { bundle.Unload(true); }
        }
    }
}
