using System;
using System.Globalization;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
#if NDMF_AVAILABLE
using nadena.dev.ndmf;
[assembly: ExportsPlugin(typeof(UnityBox.Sensa.SensaShaderCapturePlugin))]
#endif

namespace UnityBox.Sensa
{
#if NDMF_AVAILABLE
    public sealed class SensaShaderCapturePlugin : Plugin<SensaShaderCapturePlugin>
    {
        public override string QualifiedName => "top.sealoong.sensa.shader-capture";
        public override string DisplayName => "Sensa native root capture";
        protected override void Configure() => InPhase(BuildPhase.Generating)
            .Run("Sensa/GenerateNativeRootCapture", context => SensaShaderCaptureBuilder.ProcessAvatar(context.AvatarRootObject));
    }
#endif

    public static class SensaShaderCaptureBuilder
    {
        public static void ProcessAvatar(GameObject avatar)
        {
            var authors = avatar.GetComponentsInChildren<SensaShaderCapture>(true);
            var active = authors.Where(author => author.enabled).ToArray();
            if (active.GroupBy(author => author.producerId).Any(group => group.Count() > 1))
                throw new InvalidOperationException("Shader producer IDs must be unique. / Shader producer ID 必须唯一。");
            foreach (var author in active)
            {
                if (EditorUserBuildSettings.activeBuildTarget == BuildTarget.Android || GraphicsSettings.currentRenderPipeline != null)
                    throw new InvalidOperationException("Native root capture requires PC Built-in rendering. / 根点捕获需要 PC Built-in 渲染。");
                if (author.producerId < 1 || author.producerId > 65535 || author.spsTarget == null || !author.spsTarget.transform.IsChildOf(avatar.transform))
                    throw new InvalidOperationException("Choose one SPS target inside this avatar and a producer ID from 1–65535. / 选择头像内的 SPS 目标和 1–65535 producer ID。");
                var targets = author.spsTarget.GetComponents<Component>().Where(SensaSpsAdapter.IsTarget).ToArray();
                if (targets.Length != 1) throw new InvalidOperationException("The selected object must contain exactly one SPS Socket or Plug. / 选中对象必须包含一个 SPS Socket 或 Plug。");
                var rect = author.desktopViewport;
                if (!Finite(rect.x) || !Finite(rect.y) || !Finite(rect.width) || !Finite(rect.height) || rect.x < 0 || rect.y < 0 || rect.width < .05f || rect.height < .05f || rect.xMax > 1 || rect.yMax > 1)
                    throw new InvalidOperationException("The desktop rectangle must fit within normalized 0–1 bounds. / 桌面区域必须位于归一化 0–1 边界内。");
                SensaSensorUtility.Uniform(avatar.transform);
                var placement = SensaSpsAdapter.ReadRoot(targets[0]);
                var marker = Child(placement.root, "SensaShaderRoot_" + author.producerId);
                marker.localPosition = placement.position;
                marker.localRotation = placement.rotation;
                BuildNativeRig(avatar, marker, author.producerId, rect);
            }
            foreach (var author in authors) UnityEngine.Object.DestroyImmediate(author);
        }

        public static GameObject BuildNativeRig(GameObject avatar, Transform marker, int producerId, Rect viewport)
        {
            var host = Child(avatar.transform, "SensaShaderCapture_" + producerId).gameObject;
            var rig = Child(host.transform, "Native camera output - verify desktop and HMD").gameObject;
            var encoderShader = EnsureShader("SensaRootTelemetry.shader.txt", "NativeRootTelemetry");
            var displayShader = EnsureShader("SensaRootDisplay.shader.txt", "NativeRootDisplay");
            var data = new RenderTexture(256, 128, 24, RenderTextureFormat.ARGB32, RenderTextureReadWrite.Linear)
                { name = "Sensa root code " + producerId, filterMode = FilterMode.Point, antiAliasing = 1, useMipMap = false };
            var material = new Material(encoderShader) { name = "Sensa root encoder " + producerId };
            material.SetFloat("_SensaProducerId", producerId);
            var captureFar = 1f + producerId / 65536f;
            var presenterFar = 3f + producerId / 65536f;
            material.SetFloat("_SensaCameraFar", captureFar);
            var encoder = Child(rig.transform, "Native skinned root point").gameObject.AddComponent<SkinnedMeshRenderer>();
            var mesh = new Mesh { name = "Sensa root point " + producerId };
            mesh.vertices = new[] { avatar.transform.InverseTransformPoint(marker.position) };
            mesh.boneWeights = new[] { new BoneWeight { boneIndex0 = 0, weight0 = 1 } };
            mesh.bindposes = new[] { marker.worldToLocalMatrix * encoder.transform.localToWorldMatrix };
            mesh.SetIndices(new[] { 0 }, MeshTopology.Points, 0);
            var center = new Vector3(SensaFixedAnchorProtocol.CenterX, SensaFixedAnchorProtocol.CenterY, SensaFixedAnchorProtocol.CenterZ);
            // The small explicit bounds keep the point pass in the capture-camera frustum.
            // 仅为捕获相机设置小型可见边界；测量值来自原生蒙皮，不来自此边界。
            encoder.sharedMesh = mesh;
            encoder.bones = new[] { marker };
            encoder.rootBone = avatar.transform;
            var bounds = new Bounds(center + Vector3.forward * .2f, new Vector3(2, 1, .1f));
            mesh.bounds = bounds;
            var serialized = new SerializedObject(encoder);
            serialized.FindProperty("m_AABB").boundsValue = bounds;
            serialized.FindProperty("m_DirtyAABB").boolValue = false;
            serialized.ApplyModifiedPropertiesWithoutUndo();
            encoder.sharedMaterial = material;
            // Keep the serialized capture-frustum bounds instead of recomputing bounds from the moving point.
            // 固定的原生边界位于持续渲染的捕获相机内，不依赖运行时脚本恢复。
            encoder.updateWhenOffscreen = false;
            encoder.forceMatrixRecalculationPerRender = true;
            encoder.shadowCastingMode = ShadowCastingMode.Off;
            encoder.receiveShadows = false;
            encoder.gameObject.layer = 22;
            var capture = MakeCamera(Child(rig.transform, "Root code camera").gameObject, center, captureFar, (1 << 22) | (1 << 9) | (1 << 10));
            capture.targetTexture = data; capture.depth = -100;
            capture.clearFlags = CameraClearFlags.SolidColor; capture.backgroundColor = Color.black;
            var presenter = MakeCamera(Child(rig.transform, "Experimental desktop presenter").gameObject, center + Vector3.right * 10, presenterFar, (1 << 23) | (1 << 9) | (1 << 10));
            presenter.depth = 100; presenter.clearFlags = CameraClearFlags.Depth; presenter.rect = viewport;
            var card = GameObject.CreatePrimitive(PrimitiveType.Quad); card.name = "Encoded data presenter";
            card.transform.SetParent(presenter.transform, false); card.transform.localPosition = Vector3.forward * .2f;
            card.layer = 23; UnityEngine.Object.DestroyImmediate(card.GetComponent<Collider>());
            var displayMaterial = new Material(displayShader) { name = "Sensa root display " + producerId, mainTexture = data };
            displayMaterial.SetFloat("_SensaCameraFar", presenterFar);
            card.GetComponent<Renderer>().sharedMaterial = displayMaterial;
            rig.SetActive(false);
            SensaSelectionAnimator.Build(avatar, host, "ShaderCapture_" + producerId, new[] { rig }, new[] { "SPS root code / SPS 根点编码" });
            return rig;
        }

        private static Camera MakeCamera(GameObject node, Vector3 position, float far, int mask)
        {
            node.transform.localPosition = position;
            var camera = node.AddComponent<Camera>();
            camera.orthographic = true; camera.orthographicSize = .5f; camera.nearClipPlane = .01f;
            camera.farClipPlane = far; camera.cullingMask = mask; camera.stereoTargetEye = StereoTargetEyeMask.None;
            camera.allowHDR = false; camera.allowMSAA = false; camera.useOcclusionCulling = false;
            return camera;
        }

        private static Shader EnsureShader(string file, string name)
        {
            var script = AssetDatabase.FindAssets("SensaShaderCaptureBuilder t:MonoScript").Select(AssetDatabase.GUIDToAssetPath)
                .Single(path => Path.GetFileName(path) == "SensaShaderCaptureBuilder.cs");
            var template = File.ReadAllText(Path.Combine(Path.GetDirectoryName(script), file));
            string Number(float value) => value.ToString("R", CultureInfo.InvariantCulture);
            template = template.Replace("__CENTER_X__", Number(SensaFixedAnchorProtocol.CenterX))
                .Replace("__CENTER_Y__", Number(SensaFixedAnchorProtocol.CenterY)).Replace("__CENTER_Z__", Number(SensaFixedAnchorProtocol.CenterZ))
                .Replace("__HALF_RANGE__", Number(SensaFixedAnchorProtocol.PositionHalfRange));
            const string folder = "Assets/SensaShaderCapture";
            Directory.CreateDirectory(folder);
            var path = folder + "/" + name + ".shader";
            if (File.Exists(path) && File.ReadAllText(path) != template)
                throw new InvalidOperationException("Generated shader differs; preserve and move it before regenerating: / 生成 Shader 已有不同内容，请先备份并移走：" + path);
            if (!File.Exists(path)) File.WriteAllText(path, template);
            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport);
            var shader = AssetDatabase.LoadAssetAtPath<Shader>(path);
            if (shader == null || ShaderUtil.ShaderHasError(shader)) throw new InvalidOperationException("Native root shader did not compile. / 根点 Shader 编译失败。");
            return shader;
        }

        private static Transform Child(Transform parent, string name)
        {
            var child = new GameObject(name).transform; child.SetParent(parent, false); return child;
        }
        private static bool Finite(float value) => !float.IsNaN(value) && !float.IsInfinity(value);
    }
}
