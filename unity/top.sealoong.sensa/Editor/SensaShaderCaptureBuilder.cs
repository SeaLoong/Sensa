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
        internal const float CaptureNearClipPlane = .000001f;

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
            ValidateMeasuredFrame(avatar, placement.root,
                placement.root.localToWorldMatrix * Matrix4x4.TRS(placement.position, placement.rotation, Vector3.one));
            return placement;
        }

        public static GameObject BuildNativeRig(GameObject avatar, Transform marker, int producerId, Rect viewport)
        {
            if (marker == null || !BelongsTo(marker, avatar.transform))
                throw new InvalidOperationException(SensaEditorLocalization.Text("The selected root must belong to this avatar."));
            ValidateRig(avatar, producerId, viewport);
            ValidateMeasuredFrame(avatar, marker, marker.localToWorldMatrix);
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
            if (avatar.transform.lossyScale.x > SensaShaderCapture.MaximumAvatarScale
                || Mathf.RoundToInt(avatar.transform.lossyScale.x / SensaShaderCapture.MaximumAvatarScale * 65535) == 0)
                throw new InvalidOperationException(SensaEditorLocalization.Text("Choose an Avatar world scale that encodes to a positive value, up to 8."));
            if (avatar.transform.Find("SensaShaderCapture_" + producerId) != null)
                throw new InvalidOperationException(SensaEditorLocalization.Text("A Shader root capture with this producer ID already exists."));
        }

        private static void ValidateMeasuredFrame(GameObject avatar, Transform parent, Matrix4x4 worldFrame)
        {
            // Three measured points determine the X/Z plane. Reject authored collapsed or
            // mirrored transforms; the unmeasured Y axis has no runtime handedness report.
            for (var node = parent; node != avatar.transform && node != null; node = node.parent)
            {
                var scale = node.localScale;
                if (!Finite(scale.x) || !Finite(scale.y) || !Finite(scale.z)
                    || scale.x <= 0 || scale.y <= 0 || scale.z <= 0)
                    throw new InvalidOperationException(SensaEditorLocalization.Text("Shader capture needs finite positive target scales."));
            }
            var relative = avatar.transform.worldToLocalMatrix * worldFrame;
            var right = relative.MultiplyVector(Vector3.right);
            var forward = relative.MultiplyVector(Vector3.forward);
            if (!SupportedBasis(right, forward) || !SupportedBasis(QuantizedBasis(right), QuantizedBasis(forward)))
                throw new InvalidOperationException(SensaEditorLocalization.Text("Shader capture needs independent X/Z axes with components within -8 to 8."));
        }

        private static Vector3 QuantizedBasis(Vector3 value)
        {
            var maximum = SensaShaderCapture.MaximumBasisComponent;
            return new Vector3(Mathf.RoundToInt(value.x / maximum * 32767), Mathf.RoundToInt(value.y / maximum * 32767),
                Mathf.RoundToInt(value.z / maximum * 32767)) / 32767 * maximum;
        }

        internal static bool SupportedBasis(Vector3 right, Vector3 forward)
        {
            var maximum = SensaShaderCapture.MaximumBasisComponent;
            return Finite(right.x) && Finite(right.y) && Finite(right.z)
                && Finite(forward.x) && Finite(forward.y) && Finite(forward.z)
                && Mathf.Abs(right.x) <= maximum && Mathf.Abs(right.y) <= maximum && Mathf.Abs(right.z) <= maximum
                && Mathf.Abs(forward.x) <= maximum && Mathf.Abs(forward.y) <= maximum && Mathf.Abs(forward.z) <= maximum
                && right.sqrMagnitude > .000000000001f && forward.sqrMagnitude > .000000000001f
                && Vector3.Cross(right, forward).magnitude > .0001f * right.magnitude * forward.magnitude;
        }

        private static void ValidateCaptureCamera()
        {
            // Verify the native camera setter before adding any generated avatar objects.
            // A clamped near plane would silently hide the rig at small supported scales.
            var validationHost = new GameObject("Sensa camera range check") { hideFlags = HideFlags.HideAndDontSave };
            try
            {
                var validationCamera = validationHost.AddComponent<Camera>();
                validationCamera.enabled = false;
                validationCamera.orthographic = true;
                validationCamera.nearClipPlane = CaptureNearClipPlane;
                if (validationCamera.nearClipPlane != CaptureNearClipPlane)
                    throw new InvalidOperationException(SensaEditorLocalization.Text("This Unity camera must preserve the 0.000001 near plane for Shader capture."));
            }
            finally { UnityEngine.Object.DestroyImmediate(validationHost); }
        }

        private static GameObject BuildNativeRig(GameObject avatar, Transform marker, int producerId, Rect viewport, Shader shader)
        {
            var host = Child(avatar.transform, "SensaShaderCapture_" + producerId).gameObject;
            var rig = Child(host.transform, "Native camera output - verify desktop and HMD").gameObject;
            var material = new Material(shader) { name = "Sensa root encoder " + producerId };
            material.SetFloat("_SensaProducerId", producerId);
            var cameraFar = 1f + producerId / 65536f;
            material.SetFloat("_SensaCameraFar", cameraFar);
            var encoder = Child(rig.transform, "Native skinned root frame").gameObject.AddComponent<SkinnedMeshRenderer>();
            var mesh = new Mesh { name = "Sensa root frame " + producerId };
            var arm = SensaShaderCapture.ProbeArmLength;
            mesh.vertices = new[] { Vector3.zero, Vector3.right * arm, Vector3.forward * arm }
                .Select(point => avatar.transform.InverseTransformPoint(marker.TransformPoint(point))).ToArray();
            mesh.boneWeights = Enumerable.Range(0, 3).Select(_ => new BoneWeight { boneIndex0 = 0, weight0 = 1 }).ToArray();
            mesh.bindposes = new[] { marker.worldToLocalMatrix * encoder.transform.localToWorldMatrix };
            mesh.SetIndices(new[] { 0, 1, 2 }, MeshTopology.Triangles, 0);
            var center = new Vector3(SensaFixedAnchorProtocol.CenterX, SensaFixedAnchorProtocol.CenterY, SensaFixedAnchorProtocol.CenterZ);
            encoder.sharedMesh = mesh;
            encoder.bones = new[] { marker };
            encoder.rootBone = avatar.transform;
            // Persist the capture-frustum bounds; no runtime script is needed to restore them.
            // 持久化位于相机视锥内的边界，不依赖运行时脚本恢复。
            // Straddle the capture camera origin; even the smallest nonzero encoded scale
            // reaches beyond its near plane. These bounds describe generated rendering only.
            var bounds = new Bounds(center, new Vector3(2, 1, .5f));
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
            camera.orthographic = true; camera.orthographicSize = .5f; camera.nearClipPlane = CaptureNearClipPlane;
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
            ValidateCaptureCamera();
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
