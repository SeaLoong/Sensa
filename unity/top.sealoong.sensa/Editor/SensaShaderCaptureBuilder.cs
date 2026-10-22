using System;
using System.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace UnityBox.Sensa
{
    public static class SensaShaderCaptureBuilder
    {
        public const string ShaderAssetPath = "Packages/top.sealoong.sensa/Runtime/Shaders/SensaRootTelemetry.shader";

        private sealed class CapturePlan
        {
            public SensaShaderCapture author;
            public SensaSpsAdapter.RootPlacement placement;
        }

        public static void ProcessAvatar(GameObject avatar)
        {
            var authors = avatar.GetComponentsInChildren<SensaShaderCapture>(true);
            var active = authors.Where(author => author.enabled).ToArray();
            if (active.GroupBy(author => author.producerId).Any(group => group.Count() > 1))
                throw new InvalidOperationException(SensaEditorLocalization.Text("Shader producer IDs must be unique."));
            // Resolve every target and validate the whole group before creating a native object.
            var plans = active.Select(author => new CapturePlan {
                author = author, placement = Validate(avatar, author)
            }).ToArray();
            if (plans.Length > 0)
            {
                var shader = EnsureShader();
                foreach (var plan in plans)
                {
                    var marker = Child(plan.placement.root, "SensaShaderRoot_" + plan.author.producerId);
                    marker.localPosition = plan.placement.position;
                    marker.localRotation = plan.placement.rotation;
                    BuildNativeRig(avatar, marker, plan.author.producerId, plan.author.desktopViewport, shader);
                }
            }
            foreach (var author in authors) UnityEngine.Object.DestroyImmediate(author);
        }

        internal static Component ResolveTarget(SensaShaderCapture author)
        {
            if (author.target != null) return author.target;
            if (author.spsTarget != null)
            {
                var targets = author.spsTarget.GetComponents<Component>().Where(SensaSpsAdapter.IsTarget).ToArray();
                if (targets.Length == 1) return targets[0];
                throw new InvalidOperationException(SensaEditorLocalization.Text("Choose an explicit root target; the saved SPS object must contain exactly one Socket or Plug."));
            }
            throw new InvalidOperationException(SensaEditorLocalization.Text("Choose a root target inside this avatar."));
        }

        internal static SensaSpsAdapter.RootPlacement Validate(GameObject avatar, SensaShaderCapture author)
        {
            var target = ResolveTarget(author);
            if (!BelongsTo(target.transform, avatar.transform))
                throw new InvalidOperationException(SensaEditorLocalization.Text("Choose a root target inside this avatar."));
            ValidateRig(avatar, author.producerId, author.desktopViewport);
            var placement = SensaSpsAdapter.ReadRoot(target);
            if (placement.root == null || !BelongsTo(placement.root, avatar.transform))
                throw new InvalidOperationException(SensaEditorLocalization.Text("The selected root must belong to this avatar."));
            return placement;
        }

        public static GameObject BuildNativeRig(GameObject avatar, Transform marker, int producerId, Rect viewport)
        {
            if (marker == null || !BelongsTo(marker, avatar.transform))
                throw new InvalidOperationException(SensaEditorLocalization.Text("The selected root must belong to this avatar."));
            ValidateRig(avatar, producerId, viewport);
            return BuildNativeRig(avatar, marker, producerId, viewport, EnsureShader());
        }

        private static void ValidateRig(GameObject avatar, int producerId, Rect viewport)
        {
            if (EditorUserBuildSettings.activeBuildTarget == BuildTarget.Android || GraphicsSettings.currentRenderPipeline != null)
                throw new InvalidOperationException(SensaEditorLocalization.Text("Native root capture requires PC Built-in rendering."));
            if (producerId < 1 || producerId > 65535)
                throw new InvalidOperationException(SensaEditorLocalization.Text("Choose a producer ID from 1–65535."));
            if (!Finite(viewport.x) || !Finite(viewport.y) || !Finite(viewport.width) || !Finite(viewport.height)
                || viewport.x < 0 || viewport.y < 0 || viewport.width < .05f || viewport.height < .05f || viewport.xMax > 1 || viewport.yMax > 1)
                throw new InvalidOperationException(SensaEditorLocalization.Text("The desktop rectangle must fit within normalized 0–1 bounds."));
            SensaSensorUtility.Uniform(avatar.transform);
            if (avatar.transform.Find("SensaShaderCapture_" + producerId) != null)
                throw new InvalidOperationException(SensaEditorLocalization.Text("A Shader root capture with this producer ID already exists."));
        }

        private static GameObject BuildNativeRig(GameObject avatar, Transform marker, int producerId, Rect viewport, Shader shader)
        {
            var host = Child(avatar.transform, "SensaShaderCapture_" + producerId).gameObject;
            var rig = Child(host.transform, "Native camera output - verify desktop and HMD").gameObject;
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
            SensaSelectionAnimator.Build(avatar, host, "ShaderCapture_" + producerId, new[] { rig }, new[] { SensaEditorLocalization.Text("Root position code") });
            return rig;
        }

        private static Shader EnsureShader()
        {
            // The package generator resolves protocol constants before publishing the asset.
            // Avatar builds only reference this asset and never write to the project's Assets folder.
            var shader = AssetDatabase.LoadAssetAtPath<Shader>(ShaderAssetPath);
            if (shader == null)
                throw new InvalidOperationException(SensaEditorLocalization.Text("Install the complete Sensa package: the native root shader asset is missing.") + " " + ShaderAssetPath);
            if (ShaderUtil.ShaderHasError(shader))
                throw new InvalidOperationException(SensaEditorLocalization.Text("Native root shader did not compile."));
            return shader;
        }

        private static bool BelongsTo(Transform target, Transform avatar) => target == avatar || target.IsChildOf(avatar);

        private static Transform Child(Transform parent, string name)
        {
            var child = new GameObject(name).transform; child.SetParent(parent, false); return child;
        }
        private static bool Finite(float value) => !float.IsNaN(value) && !float.IsInfinity(value);
    }
}
