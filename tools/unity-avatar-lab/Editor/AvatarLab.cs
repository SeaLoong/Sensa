using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Collections.Generic;
using System.Threading.Tasks;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityBox.Sensa;
using VRC.Core;
using VRC.SDK3.Avatars.Components;
using VRC.SDK3.Dynamics.Contact.Components;
using VRC.SDK3.Dynamics.PhysBone.Components;
using VRC.SDK3A.Editor;
using VRC.SDKBase.Editor.BuildPipeline;

namespace SensaAvatarLab
{
    // Local lab only. No upload API is called by these tools.
    [InitializeOnLoad]
    public static class AvatarLab
    {
        public const string Root = "Assets/SensaAvatarLab/Generated";
        const string Model = "Assets/Amatousagi/Chocolat/Chocolat.prefab";
        const string Prop = "Assets/SeaLoong/SPS_Lollipop/SPS_Lollipop.prefab";
        public static readonly string[] Variants = { "Exclusive", "Dedicated" };
        const string WarmupKey = "SensaAvatarLab.Warmup";
        static AvatarLab() { EditorApplication.update += CheckWarmup; }
        public static void Warmup()
        {
            PrepareBatchMode();
            SessionState.SetFloat(WarmupKey, (float)EditorApplication.timeSinceStartup);
        }
        static void PrepareBatchMode()
        {
            if (!Application.isBatchMode) return;
            // Editor Toolbox 2.0.2 assumes a visible toolbar and otherwise throws
            // on every Update, preventing deferred package initialization.
            // Detach only this UI callback in batch mode; installed packages and
            // normal interactive editor preferences remain untouched.
            var type = AppDomain.CurrentDomain.GetAssemblies().Select(a => a.GetType("jp.lilxyzw.editortoolbox.ToolbarExtension")).FirstOrDefault(t => t != null);
            var method = type?.GetMethod("GetVisualElements", BindingFlags.Static | BindingFlags.NonPublic);
            if (method != null) EditorApplication.update -= (EditorApplication.CallbackFunction)Delegate.CreateDelegate(typeof(EditorApplication.CallbackFunction), method);
        }
        public static void PrepareTests() => PrepareBatchMode();
        static void CheckWarmup()
        {
            float started = SessionState.GetFloat(WarmupKey, -1);
            if (started < 0) return;
            if (!EditorApplication.isCompiling && !EditorApplication.isUpdating && AssetDatabase.IsValidFolder("Packages/com.vrcfury.temp"))
            {
                SessionState.EraseFloat(WarmupKey);
                Debug.Log("SENSA_AVATAR_DEPENDENCIES_READY");
                if (Application.isBatchMode) EditorApplication.Exit(0);
            }
            else if (EditorApplication.timeSinceStartup - started > 120)
            {
                SessionState.EraseFloat(WarmupKey);
                Debug.LogError(AvatarLabLocalization.Text("VRCFury temporary package initialization timed out."));
                if (Application.isBatchMode) EditorApplication.Exit(1);
            }
        }

        [Serializable] public class BuildReport
        {
            public string avatar, utc, unity, error, contactAdvancedParametersField;
            public bool passed, humanoid, localSelector, spsResolver, handlesGrabWithoutCollision, contactDirectSupported;
            public int missingScripts, contacts, sensaReceivers, physBones, parameterCost;
            public string[] sensaParameters, shaders;
        }

        static Type FindType(string name) => AppDomain.CurrentDomain.GetAssemblies()
            .Select(a => a.GetType(name)).FirstOrDefault(t => t != null)
            ?? throw new InvalidOperationException(AvatarLabLocalization.Text("Required component unavailable: ") + name);
        static void Set(Component component, string field, object value) => component.GetType().GetField(field).SetValue(component, value);
        static GameObject Load(string path) => AssetDatabase.LoadAssetAtPath<GameObject>(path)
            ?? throw new InvalidOperationException(AvatarLabLocalization.Text("Import the licensed resource first: ") + path);

        [MenuItem("Tools/Sensa Avatar Lab/Create authoring scenes")]
        public static void CreateScenes()
        {
            Directory.CreateDirectory(Root);
            Directory.CreateDirectory("Validation");
            AssetDatabase.Refresh();
            foreach (var variant in Variants) CreateScene(variant);
            EditorSceneManager.OpenScene(Root + "/Exclusive.unity");
            AvatarLabLocalization.SaveAssets();
        }

        static void CreateScene(string variant)
        {
            var scenePath = Root + "/" + variant + ".unity";
            if (File.Exists(scenePath)) throw new InvalidOperationException(AvatarLabLocalization.Text("Scene already exists; preserve your edits before rebuilding: ") + scenePath);
            var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
            var avatar = (GameObject)PrefabUtility.InstantiatePrefab(Load(Model));
            avatar.name = "Sensa Chocolat " + variant;
            avatar.transform.position = Vector3.zero;
            var animator = avatar.GetComponent<Animator>();
            if (animator == null || !animator.isHuman) throw new InvalidOperationException(AvatarLabLocalization.Text("The base model needs a valid Humanoid rig."));
            var descriptor = avatar.GetComponent<VRCAvatarDescriptor>();
            if (descriptor == null) throw new InvalidOperationException(AvatarLabLocalization.Text("The base model needs an Avatar Descriptor."));
            var pipeline = avatar.GetComponent<PipelineManager>() ?? avatar.AddComponent<PipelineManager>();
            pipeline.blueprintId = "";
            var prop = (GameObject)PrefabUtility.InstantiatePrefab(Load(Prop), avatar.transform);
            var plug = prop.GetComponentsInChildren<Component>(true).Single(c => c != null && c.GetType().FullName == SensaSpsAdapter.PlugType);
            Set(plug, "name", "Lab Lollipop");
            var socketA = Socket(avatar, animator.GetBoneTransform(HumanBodyBones.LeftHand), "Palm Socket", new Vector3(0, 0, .055f));
            var socketB = Socket(avatar, animator.GetBoneTransform(HumanBodyBones.LeftLowerArm), "Forearm Socket", new Vector3(0, 0, .055f));
            var setup = avatar.AddComponent<SensaAutoSetup>();
            setup.groupName = "Lab";
            setup.discoverAll = false;
            setup.selectedTargets = new List<GameObject> { socketA, socketB, plug.gameObject };
            setup.arrayPolicy = variant == "Dedicated" ? SensaArrayPolicy.Dedicated : SensaArrayPolicy.Exclusive;
            setup.socketRootTracking = true;
            setup.pairedSocketTracking = true;
            setup.pairedPlugMarkers = true;
            setup.localPlugTipTracking = true;
            setup.localReferenceSocket = socketA;
            setup.createPlugGrabHandles = true;
            setup.pairChannel = "LabPair";
            var handle = new GameObject("Independent PB Handle");
            handle.transform.SetParent(animator.GetBoneTransform(HumanBodyBones.Hips), false);
            handle.transform.position += new Vector3(.15f, .15f, .18f);
            handle.transform.rotation = Quaternion.identity;
            var probe = handle.AddComponent<SensaPointProbe>();
            probe.instanceName = "LabHandle";
            probe.createGrabHandle = true;
            probe.handleLength = .1f;
            var targets = SensaAutoBuilder.Targets(setup, avatar);
            var placements = targets.Select(SensaSpsAdapter.Read).ToArray();
            File.WriteAllText("Validation/authoring-" + variant + ".txt",
                "Base: " + Model + "\nProp: " + Prop + "\nSensa additional auto Contacts: " + SensaAutoBuilder.ContactCost(setup, targets)
                + "\nIndependent PB adds 5 Contacts.\n" + string.Join("\n", placements.Select(p => p.source.name + ": position=" + p.position + ", length=" + p.length)));
            AddEmulator();
            EditorSceneManager.SaveScene(scene, scenePath);
            Capture(avatar, "Validation/avatar-" + variant + ".png");
        }

        static void AddEmulator()
        {
            const string path = "Packages/vrchat.blackstartx.gesture-manager/GestureManager.prefab";
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if (prefab != null && GameObject.Find(prefab.name) == null) PrefabUtility.InstantiatePrefab(prefab);
        }

        [MenuItem("Tools/Sensa Avatar Lab/Add emulator to existing scenes")]
        public static void AddEmulators()
        {
            foreach (var variant in Variants)
            {
                var scene = EditorSceneManager.OpenScene(Root + "/" + variant + ".unity");
                AddEmulator();
                EditorSceneManager.SaveScene(scene);
            }
            EditorSceneManager.OpenScene(Root + "/Exclusive.unity");
        }

        static GameObject Socket(GameObject avatar, Transform bone, string name, Vector3 offset)
        {
            if (bone == null) throw new InvalidOperationException(AvatarLabLocalization.Text("Required humanoid bone missing: ") + name);
            var go = new GameObject(name);
            go.transform.SetParent(bone, false);
            go.transform.position = bone.position + offset;
            go.transform.rotation = avatar.transform.rotation;
            var component = go.AddComponent(FindType(SensaSpsAdapter.SocketType));
            Set(component, "name", name);
            Set(component, "length", .18f);
            Set(component, "addLight", Enum.Parse(component.GetType().GetField("addLight").FieldType, "Ring"));
            var materialPath = Root + "/SocketMarker.mat";
            var material = AssetDatabase.LoadAssetAtPath<Material>(materialPath);
            if (material == null)
            {
                material = new Material(Shader.Find("Unlit/Color"));
                material.color = new Color(.15f, .8f, 1);
                AssetDatabase.CreateAsset(material, materialPath);
            }
            for (int i = 0; i < 4; i++)
            {
                var bar = GameObject.CreatePrimitive(PrimitiveType.Cube);
                bar.name = "Socket marker " + i;
                bar.transform.SetParent(go.transform, false);
                bar.transform.localPosition = i < 2 ? new Vector3((i == 0 ? -1 : 1) * .04f, 0, 0) : new Vector3(0, (i == 2 ? -1 : 1) * .04f, 0);
                bar.transform.localScale = i < 2 ? new Vector3(.006f, .086f, .006f) : new Vector3(.086f, .006f, .006f);
                UnityEngine.Object.DestroyImmediate(bar.GetComponent<Collider>());
                bar.GetComponent<Renderer>().sharedMaterial = material;
            }
            return go;
        }

        [MenuItem("Tools/Sensa Avatar Lab/Validate full build callbacks")]
        public static void ValidateBuilds()
        {
            PrepareBatchMode();
            bool passed = true;
            foreach (var variant in Variants)
            {
                EditorSceneManager.OpenScene(Root + "/" + variant + ".unity");
                var source = UnityEngine.Object.FindObjectOfType<VRCAvatarDescriptor>().gameObject;
                var clone = UnityEngine.Object.Instantiate(source);
                clone.name = source.name + "(Clone)";
                source.SetActive(false);
                try
                {
                    if (!VRCBuildPipelineCallbacks.OnPreprocessAvatar(clone)) throw new InvalidOperationException(AvatarLabLocalization.Text("SDK preprocessing rejected the avatar."));
                    var report = Inspect(clone);
                    WriteReport(report, variant);
                    passed &= report.passed;
                }
                catch (Exception ex)
                {
                    WriteReport(new BuildReport { avatar = source.name, error = ex.ToString(), passed = false }, variant);
                    Debug.LogException(ex);
                    passed = false;
                }
                finally { UnityEngine.Object.DestroyImmediate(clone); source.SetActive(true); }
            }
            EditorSceneManager.OpenScene(Root + "/Exclusive.unity");
            if (!passed) throw new InvalidOperationException(AvatarLabLocalization.Text("Avatar build validation failed; see Validation/build-*.json."));
            Debug.Log("SENSA_AVATAR_PREPROCESS_PASSED");
        }

        public static BuildReport Inspect(GameObject avatar)
        {
            var descriptor = avatar.GetComponent<VRCAvatarDescriptor>();
            var parameters = descriptor.expressionParameters.parameters;
            var receivers = avatar.GetComponentsInChildren<VRCContactReceiver>(true);
            var shaders = avatar.GetComponentsInChildren<Renderer>(true).SelectMany(r => r.sharedMaterials)
                .Where(m => m != null).Select(m => m.shader == null ? "MISSING" : m.shader.name).Distinct().ToArray();
            var report = new BuildReport
            {
                avatar = avatar.name, utc = DateTime.UtcNow.ToString("O"), unity = Application.unityVersion,
                contactDirectSupported = SensaContactRootBuilder.IsSupported,
                contactAdvancedParametersField = SensaContactRootBuilder.AdvancedParametersFieldName,
                humanoid = avatar.GetComponent<Animator>().isHuman,
                missingScripts = avatar.GetComponentsInChildren<Transform>(true).Sum(t => GameObjectUtility.GetMonoBehavioursWithMissingScriptCount(t.gameObject)),
                contacts = receivers.Length + avatar.GetComponentsInChildren<VRCContactSender>(true).Length,
                sensaReceivers = receivers.Count(r => r.parameter != null && r.parameter.StartsWith("Sensa/")),
                physBones = avatar.GetComponentsInChildren<VRCPhysBone>(true).Length,
                handlesGrabWithoutCollision = avatar.GetComponentsInChildren<VRCPhysBone>(true).Where(b=>b.parameter!=null&&b.parameter.StartsWith("Sensa/")).All(b=>b.allowGrabbing==VRC.Dynamics.VRCPhysBoneBase.AdvancedBool.True && b.allowCollision==VRC.Dynamics.VRCPhysBoneBase.AdvancedBool.False && b.colliders.Count==0 && b.radius>0 && b.GetComponentsInChildren<Collider>().Length==0),
                parameterCost = descriptor.expressionParameters.CalcTotalCost(),
                localSelector = parameters.Any(p => p.name == "Sensa/Select/Lab" && !p.networkSynced && p.defaultValue == 0),
                sensaParameters = parameters.Where(p => p.name.StartsWith("Sensa/")).Select(p => p.name).ToArray(),
                shaders = shaders, spsResolver = shaders.Any(s => s.Contains("SpsResolver"))
            };
            report.passed = report.humanoid && report.handlesGrabWithoutCollision && report.missingScripts == 0 && report.contacts <= 256 && report.sensaReceivers > 0
                && report.physBones > 0 && report.localSelector && report.parameterCost <= 256 && report.spsResolver
                && avatar.GetComponentsInChildren<SensaAutoSetup>(true).Length == 0
                && avatar.GetComponentsInChildren<SensaPointProbe>(true).Length == 0
                && !shaders.Any(s => s == "MISSING" || s.Contains("InternalErrorShader"));
            return report;
        }

        static void WriteReport(BuildReport report, string variant)
        {
            report.utc = DateTime.UtcNow.ToString("O");
            report.unity = Application.unityVersion;
            File.WriteAllText("Validation/build-" + variant + ".json", JsonUtility.ToJson(report, true));
        }

        [MenuItem("Tools/Sensa Avatar Lab/Build Exclusive with SDK (no upload)")]
        public static void BuildWithSdk() => BuildSceneWithSdk(Root + "/Exclusive.unity", "Exclusive", "sdk-build");

        [MenuItem("Tools/Sensa Avatar Lab/Build Shader with SDK (no upload)")]
        public static void BuildShaderWithSdk() => BuildSceneWithSdk("Assets/SensaAvatarLab/Capabilities/Shader.unity", "Shader", "sdk-shader-build");

        [MenuItem("Tools/Sensa Avatar Lab/Build Quick Start with SDK (no upload)")]
        public static void BuildQuickStartWithSdk() => BuildSceneWithSdk(QuickStartAvatar.Scene, "QuickStart", "sdk-quick-start-build");

        [MenuItem("Tools/Sensa Avatar Lab/Build FullFlow with SDK (no upload)")]
        public static void BuildFullFlowWithSdk() => BuildSceneWithSdk(FullFlowAvatar.Scene, "FullFlow", "sdk-full-flow-build");

        private static async void BuildSceneWithSdk(string scenePath, string variant, string reportName)
        {
            PrepareBatchMode();
            bool success = false;
            string report = "Validation/" + reportName;
            string destination = "Builds/Sensa-Chocolat-" + variant + ".vrca";
            try
            {
                File.WriteAllText(report + ".json", "{\"passed\":false,\"uploaded\":false,\"state\":\"building\"}");
                EditorSceneManager.OpenScene(scenePath);
                var avatar = UnityEngine.Object.FindObjectOfType<VRCAvatarDescriptor>().gameObject;
                EditorWindow.GetWindow<VRCSdkControlPanel>();
                await Task.Delay(500);
                if (!VRCSdkControlPanel.TryGetBuilder<IVRCSdkAvatarBuilderApi>(out var builder)) throw new InvalidOperationException(AvatarLabLocalization.Text("SDK builder unavailable."));
                builder.SelectAvatar(avatar);
                string bundle = await builder.Build(avatar);
                if (string.IsNullOrEmpty(bundle) || !File.Exists(bundle)) throw new InvalidOperationException(AvatarLabLocalization.Text("SDK did not produce an avatar bundle."));
                Directory.CreateDirectory("Builds");
                File.Copy(bundle, destination, true);
                if (variant == "QuickStart") QuickStartAvatar.InspectBundle();
                if (variant == "FullFlow") FullFlowAvatar.InspectBundle();
                File.WriteAllText(report + ".json", "{\"passed\":true,\"uploaded\":false,\"bundle\":\"" + destination + "\"}");
                if (File.Exists(report + "-error.txt")) File.Delete(report + "-error.txt");
                success = true;
            }
            catch (Exception ex)
            {
                File.WriteAllText(report + ".json", "{\"passed\":false,\"uploaded\":false,\"state\":\"failed\"}");
                File.WriteAllText(report + "-error.txt", ex.ToString()); Debug.LogException(ex);
            }
            finally { if (Application.isBatchMode) EditorApplication.Exit(success ? 0 : 1); }
        }

        public static void Capture(GameObject avatar, string path)
        {
            var renderers = avatar.GetComponentsInChildren<Renderer>().Where(r => r.enabled).ToArray();
            var bounds = renderers[0].bounds;
            foreach (var renderer in renderers) bounds.Encapsulate(renderer.bounds);
            // SPS intentionally expands renderer bounds. Frame the humanoid instead of its shader bounds.
            var descriptor = avatar.GetComponent<VRCAvatarDescriptor>();
            if (descriptor != null && descriptor.ViewPosition.y > .1f)
            {
                float height = descriptor.ViewPosition.y * avatar.transform.lossyScale.y;
                bounds = new Bounds(avatar.transform.position + Vector3.up * height * .55f, new Vector3(height, height * 1.3f, height));
            }
            var go = new GameObject("Lab preview camera");
            var camera = go.AddComponent<Camera>();
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(.09f, .12f, .17f);
            camera.transform.position = bounds.center + new Vector3(.4f, .08f, 2.5f);
            camera.transform.LookAt(bounds.center);
            camera.orthographic = true; camera.orthographicSize = bounds.extents.y * 1.2f;
            var target = new RenderTexture(1200, 1200, 24); target.Create(); camera.targetTexture = target;
            var image = new Texture2D(1200, 1200, TextureFormat.RGB24, false);
            var previous = RenderTexture.active;
            try { camera.Render(); RenderTexture.active = target; image.ReadPixels(new Rect(0, 0, 1200, 1200), 0, 0); image.Apply(); File.WriteAllBytes(path, image.EncodeToPNG()); }
            finally { RenderTexture.active = previous; UnityEngine.Object.DestroyImmediate(image); UnityEngine.Object.DestroyImmediate(go); target.Release(); UnityEngine.Object.DestroyImmediate(target); }
        }
    }
}
