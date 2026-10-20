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
        public override string DisplayName => SensaEditorLocalization.Text("Sensa native root capture");
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
                throw new InvalidOperationException(SensaEditorLocalization.Text("Shader producer IDs must be unique."));
            foreach (var author in active)
            {
                if (EditorUserBuildSettings.activeBuildTarget == BuildTarget.Android || GraphicsSettings.currentRenderPipeline != null)
                    throw new InvalidOperationException(SensaEditorLocalization.Text("Native root capture requires PC Built-in rendering."));
                if (author.producerId < 1 || author.producerId > 65535 || author.spsTarget == null || !author.spsTarget.transform.IsChildOf(avatar.transform))
                    throw new InvalidOperationException(SensaEditorLocalization.Text("Choose one SPS target inside this avatar and a producer ID from 1–65535."));
                var targets = author.spsTarget.GetComponents<Component>().Where(SensaSpsAdapter.IsTarget).ToArray();
                if (targets.Length != 1) throw new InvalidOperationException(SensaEditorLocalization.Text("The selected object must contain exactly one SPS Socket or Plug."));
                var rect = author.desktopViewport;
                if (!Finite(rect.x) || !Finite(rect.y) || !Finite(rect.width) || !Finite(rect.height) || rect.x < 0 || rect.y < 0 || rect.width < .05f || rect.height < .05f || rect.xMax > 1 || rect.yMax > 1)
                    throw new InvalidOperationException(SensaEditorLocalization.Text("The desktop rectangle must fit within normalized 0–1 bounds."));
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
            var shader = EnsureShader();
            var material = new Material(shader) { name = "Sensa root encoder " + producerId };
            material.SetFloat("_SensaProducerId", producerId);
            var cameraFar = 1f + producerId / 65536f;
            material.SetFloat("_SensaCameraFar", cameraFar);
            var encoder = Child(rig.transform, "Native skinned root point").gameObject.AddComponent<SkinnedMeshRenderer>();
            var mesh = new Mesh { name = "Sensa root point " + producerId };
            mesh.vertices = new[] { avatar.transform.InverseTransformPoint(marker.position) };
            mesh.boneWeights = new[] { new BoneWeight { boneIndex0 = 0, weight0 = 1 } };
            mesh.bindposes = new[] { marker.worldToLocalMatrix * encoder.transform.localToWorldMatrix };
            mesh.SetIndices(new[] { 0 }, MeshTopology.Points, 0);
            var center = new Vector3(SensaFixedAnchorProtocol.CenterX, SensaFixedAnchorProtocol.CenterY, SensaFixedAnchorProtocol.CenterZ);
            encoder.sharedMesh = mesh;
            encoder.bones = new[] { marker };
            encoder.rootBone = avatar.transform;
            // Persist the capture-frustum bounds; no runtime script is needed to restore them.
            // 持久化位于相机视锥内的边界，不依赖运行时脚本恢复。
            var bounds = new Bounds(center + Vector3.forward * .2f, new Vector3(2, 1, .1f));
            mesh.bounds = bounds;
            var serialized = new SerializedObject(encoder);
            serialized.FindProperty("m_AABB").boundsValue = bounds;
            serialized.FindProperty("m_DirtyAABB").boolValue = false;
            serialized.ApplyModifiedPropertiesWithoutUndo();
            encoder.sharedMaterial = material;
            encoder.updateWhenOffscreen = false;
            encoder.forceMatrixRecalculationPerRender = true;
            encoder.shadowCastingMode = ShadowCastingMode.Off;
            encoder.receiveShadows = false;
            encoder.gameObject.layer = 22;
            var node = Child(rig.transform, "Experimental desktop root code camera").gameObject;
            node.transform.localPosition = center;
            var camera = node.AddComponent<Camera>();
            camera.orthographic = true; camera.orthographicSize = .5f; camera.nearClipPlane = .01f;
            camera.farClipPlane = cameraFar; camera.cullingMask = (1 << 22) | (1 << 9) | (1 << 10);
            camera.stereoTargetEye = StereoTargetEyeMask.None;
            camera.allowHDR = false; camera.allowMSAA = false; camera.useOcclusionCulling = false;
            // Geometry emits the code directly into this viewport; no intermediate RT/presenter.
            // 几何阶段直接向该视口输出编码，无中间 RT 或第二呈现相机。
            camera.depth = 100; camera.clearFlags = CameraClearFlags.Depth; camera.rect = viewport;
            rig.SetActive(false);
            SensaSelectionAnimator.Build(avatar, host, "ShaderCapture_" + producerId, new[] { rig }, new[] { SensaEditorLocalization.Text("SPS root code") });
            return rig;
        }

        private static Shader EnsureShader()
        {
            var script = AssetDatabase.FindAssets("SensaShaderCaptureBuilder t:MonoScript").Select(AssetDatabase.GUIDToAssetPath)
                .Single(path => Path.GetFileName(path) == "SensaShaderCaptureBuilder.cs");
            var template = File.ReadAllText(Path.Combine(Path.GetDirectoryName(script), "SensaRootTelemetry.shader.txt"));
            string Number(float value) => value.ToString("R", CultureInfo.InvariantCulture);
            template = template.Replace("__CENTER_X__", Number(SensaFixedAnchorProtocol.CenterX))
                .Replace("__CENTER_Y__", Number(SensaFixedAnchorProtocol.CenterY)).Replace("__CENTER_Z__", Number(SensaFixedAnchorProtocol.CenterZ))
                .Replace("__HALF_RANGE__", Number(SensaFixedAnchorProtocol.PositionHalfRange));
            const string folder = "Assets/SensaShaderCapture";
            Directory.CreateDirectory(folder);
            var path = folder + "/NativeRootTelemetry.shader";
            if (File.Exists(path) && File.ReadAllText(path) != template)
                throw new InvalidOperationException(SensaEditorLocalization.Text("Generated shader differs; preserve and move it before regenerating:") + path);
            if (!File.Exists(path)) File.WriteAllText(path, template);
            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport);
            var shader = AssetDatabase.LoadAssetAtPath<Shader>(path);
            if (shader == null || ShaderUtil.ShaderHasError(shader)) throw new InvalidOperationException(SensaEditorLocalization.Text("Native root shader did not compile."));
            return shader;
        }

        private static Transform Child(Transform parent, string name)
        {
            var child = new GameObject(name).transform; child.SetParent(parent, false); return child;
        }
        private static bool Finite(float value) => !float.IsNaN(value) && !float.IsInfinity(value);
    }
}
