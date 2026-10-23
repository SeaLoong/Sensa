#if UNITY_INCLUDE_TESTS
using System.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace UnityBox.Sensa.Tests
{
    public class ShaderCaptureAuthoringContracts : AvatarBuildFixture
    {
        [Test]
        public void NativeRigStartsOffAndUsesOnlyNativeRenderingComponents()
        {
            var marker = Child("Actual root frame", new Vector3(.2f, 1.3f, .1f)).transform;
            var rig = SensaShaderCaptureBuilder.BuildNativeRig(avatar, marker, 42, new Rect(0, 0, .25f, .125f));
            Assert.That(rig.activeSelf, Is.False);
            Assert.That(rig.GetComponentsInChildren<MonoBehaviour>(true), Is.Empty);
            var cameras = rig.GetComponentsInChildren<Camera>(true);
            Assert.That(cameras, Has.Length.EqualTo(1));
            Assert.That(cameras.All(camera => camera.stereoTargetEye == StereoTargetEyeMask.None && !camera.allowHDR && !camera.allowMSAA), Is.True);
            var capture = cameras.Single();
            Assert.That(capture.targetTexture, Is.Null);
            Assert.That(capture.rect, Is.EqualTo(new Rect(0, 0, .25f, .125f)));
            Assert.That(capture.clearFlags, Is.EqualTo(CameraClearFlags.Depth));
            Assert.That(capture.depth, Is.EqualTo(100));
            Assert.That(rig.GetComponentsInChildren<Renderer>(true), Has.Length.EqualTo(1));
            Assert.That(capture.farClipPlane, Is.EqualTo(1f + 42f / 65536));

            var skin = rig.GetComponentInChildren<SkinnedMeshRenderer>(true);
            Assert.That(skin.sharedMesh.GetTopology(0), Is.EqualTo(MeshTopology.Triangles));
            Assert.That(skin.sharedMesh.vertices, Has.Length.EqualTo(3));
            CollectionAssert.AreEqual(new[] { 0, 1, 2 }, skin.sharedMesh.GetIndices(0));
            Assert.That(skin.sharedMesh.boneWeights.All(weight => weight.boneIndex0 == 0 && weight.weight0 == 1), Is.True);
            Assert.That(skin.sharedMaterial.GetFloat("_SensaProducerId"), Is.EqualTo(42));
            Assert.That(skin.sharedMaterial.GetFloat("_SensaCameraFar"), Is.EqualTo(capture.farClipPlane));

            // Test the persisted inspector bounds, not a transient Renderer.localBounds override.
            var serialized = new SerializedObject(skin);
            var bounds = serialized.FindProperty("m_AABB").boundsValue;
            Assert.That(bounds.center, Is.EqualTo(new Vector3(0, 1, 0)));
            Assert.That(bounds.size, Is.EqualTo(new Vector3(2, 1, .5f)));
            Assert.That(capture.nearClipPlane, Is.EqualTo(SensaShaderCaptureBuilder.CaptureNearClipPlane));
            Assert.That(serialized.FindProperty("m_DirtyAABB").boolValue, Is.False);
            Assert.That(skin.updateWhenOffscreen, Is.False);
            Assert.That(skin.forceMatrixRecalculationPerRender, Is.True);
        }

        [Test]
        public void MultipleNativeProducersUseDistinctDirectCameraSignatures()
        {
            var marker = Child("Root", Vector3.up).transform;
            var first = SensaShaderCaptureBuilder.BuildNativeRig(avatar, marker, 1, new Rect(0, 0, .25f, .125f));
            var second = SensaShaderCaptureBuilder.BuildNativeRig(avatar, marker, 2, new Rect(.25f, 0, .25f, .125f));
            var cameras = first.GetComponentsInChildren<Camera>(true).Concat(second.GetComponentsInChildren<Camera>(true)).ToArray();
            Assert.That(cameras.Select(camera => camera.farClipPlane).Distinct().Count(), Is.EqualTo(2));
            foreach (var rig in new[] { first, second })
            {
                var own = rig.GetComponentsInChildren<Camera>(true);
                var encoder = rig.GetComponentInChildren<SkinnedMeshRenderer>(true);
                Assert.That(encoder.sharedMaterial.GetFloat("_SensaCameraFar"), Is.EqualTo(own.Single().farClipPlane));
            }
        }

        [Test]
        public void NativeSkinningRootRemainsAvatarRootLocalAfterRootMotionScaleAndTargetRotation()
        {
            var body = Child("Moving body", new Vector3(.1f, 1.2f, .2f)).transform;
            var marker = new GameObject("Actual SPS root").transform;
            marker.SetParent(body, false); marker.localPosition = new Vector3(.04f, .03f, .02f);
            var rig = SensaShaderCaptureBuilder.BuildNativeRig(avatar, marker, 7, new Rect(0, 0, .25f, .125f));
            var skin = rig.GetComponentInChildren<SkinnedMeshRenderer>(true);
            avatar.transform.position = new Vector3(4, 2, -3);
            avatar.transform.rotation = Quaternion.Euler(0, 35, 0);
            avatar.transform.localScale = Vector3.one * 2;
            body.localPosition += new Vector3(.1f, .2f, -.1f);
            body.localRotation = Quaternion.Euler(20, 40, 10);
            var matrix = skin.transform.worldToLocalMatrix * marker.localToWorldMatrix * skin.sharedMesh.bindposes[0];
            var vertices = skin.sharedMesh.vertices;
            var actual = matrix.MultiplyPoint3x4(vertices[0]);
            var expected = avatar.transform.InverseTransformPoint(marker.position);
            Assert.That(Vector3.Distance(actual, expected), Is.LessThan(.00001f));
            var right = (matrix.MultiplyPoint3x4(vertices[1]) - actual) / SensaShaderCapture.ProbeArmLength;
            var forward = (matrix.MultiplyPoint3x4(vertices[2]) - actual) / SensaShaderCapture.ProbeArmLength;
            Assert.That(Vector3.Distance(right, avatar.transform.InverseTransformVector(marker.TransformVector(Vector3.right))), Is.LessThan(.00001f));
            Assert.That(Vector3.Distance(forward, avatar.transform.InverseTransformVector(marker.TransformVector(Vector3.forward))), Is.LessThan(.00001f));
            Assert.That(avatar.transform.localToWorldMatrix.MultiplyVector(Vector3.right).magnitude, Is.EqualTo(2).Within(.00001f));
            Assert.That(skin.transform.localToWorldMatrix, Is.EqualTo(avatar.transform.localToWorldMatrix));
        }

        [Test]
        public void ProbeTriangleMeasuresBothNonuniformTargetAxesInOneSkinnedPrimitive()
        {
            var marker = Child("Nonuniform target", Vector3.up).transform;
            marker.localRotation = Quaternion.Euler(15, 35, 10);
            marker.localScale = new Vector3(2, .5f, 3);
            var rig = SensaShaderCaptureBuilder.BuildNativeRig(avatar, marker, 8, new Rect(0, 0, .25f, .2f));
            var skin = rig.GetComponentInChildren<SkinnedMeshRenderer>(true);
            marker.localRotation = Quaternion.Euler(-20, 70, 25);
            marker.localScale = new Vector3(1.5f, .2f, 2.5f);
            var matrix = skin.transform.worldToLocalMatrix * marker.localToWorldMatrix * skin.sharedMesh.bindposes[0];
            var vertices = skin.sharedMesh.vertices.Select(matrix.MultiplyPoint3x4).ToArray();
            var right = (vertices[1] - vertices[0]) / SensaShaderCapture.ProbeArmLength;
            var forward = (vertices[2] - vertices[0]) / SensaShaderCapture.ProbeArmLength;
            Assert.That(right.magnitude, Is.EqualTo(1.5f).Within(.00001f));
            Assert.That(forward.magnitude, Is.EqualTo(2.5f).Within(.00001f));
            Assert.That(Vector3.Distance(right, avatar.transform.InverseTransformVector(marker.TransformVector(Vector3.right))), Is.LessThan(.00001f));
            Assert.That(Vector3.Distance(forward, avatar.transform.InverseTransformVector(marker.TransformVector(Vector3.forward))), Is.LessThan(.00001f));
        }

        [Test]
        public void MeasuredPlaneAcceptsShearAndRejectsCollapsedNonfiniteOrOutOfRangeAxes()
        {
            Assert.That(SensaShaderCaptureBuilder.SupportedBasis(Vector3.right, new Vector3(.5f, 0, 1)), Is.True);
            Assert.That(SensaShaderCaptureBuilder.SupportedBasis(Vector3.zero, Vector3.forward), Is.False);
            Assert.That(SensaShaderCaptureBuilder.SupportedBasis(Vector3.right, Vector3.right), Is.False);
            Assert.That(SensaShaderCaptureBuilder.SupportedBasis(new Vector3(float.NaN, 0, 0), Vector3.forward), Is.False);
            Assert.That(SensaShaderCaptureBuilder.SupportedBasis(Vector3.right * 8.001f, Vector3.forward), Is.False);
        }

        [Test]
        public void AuthoredMirroredCollapsedOrOversizedTargetIsRejectedBeforeNativeObjectsExist()
        {
            foreach (var scale in new[] { new Vector3(-1, 1, 1), new Vector3(1, -1, 1), new Vector3(1, 1, 0), new Vector3(9, 1, 1), new Vector3(.0001f, 1, .0001f) })
            {
                var marker = Child("Unsupported target", Vector3.up).transform;
                marker.localScale = scale;
                Assert.Throws<System.InvalidOperationException>(() => SensaShaderCaptureBuilder.BuildNativeRig(avatar, marker, 9, new Rect(0, 0, .25f, .2f)));
                Assert.That(avatar.GetComponentsInChildren<Camera>(true), Is.Empty);
                Object.DestroyImmediate(marker.gameObject);
            }
        }

        [Test]
        public void AvatarRootRequiresPositiveUniformWorldScaleWithinTheEncodedRange()
        {
            var marker = Child("Root", Vector3.up).transform;
            foreach (var scale in new[] { new Vector3(-1, 1, 1), new Vector3(1, 2, 1), Vector3.one * 8.001f, Vector3.one * .00001f })
            {
                avatar.transform.localScale = scale;
                Assert.Throws<System.InvalidOperationException>(() => SensaShaderCaptureBuilder.BuildNativeRig(avatar, marker, 10, new Rect(0, 0, .25f, .2f)));
                Assert.That(avatar.GetComponentsInChildren<Camera>(true), Is.Empty);
            }
        }

        [Test]
        public void AuthoredShearThatQuantizesToParallelAxesIsRejected()
        {
            var parent = Child("Thin frame", Vector3.up).transform;
            parent.localScale = new Vector3(Mathf.Sqrt(2), 1, .000155563f);
            var marker = new GameObject("Sheared X/Z frame").transform;
            marker.SetParent(parent, false); marker.localRotation = Quaternion.Euler(0, 45, 0);
            var relative = avatar.transform.worldToLocalMatrix * marker.localToWorldMatrix;
            Assert.That(SensaShaderCaptureBuilder.SupportedBasis(relative.MultiplyVector(Vector3.right), relative.MultiplyVector(Vector3.forward)), Is.True);
            Assert.Throws<System.InvalidOperationException>(() => SensaShaderCaptureBuilder.BuildNativeRig(avatar, marker, 11, new Rect(0, 0, .25f, .2f)));
            Assert.That(avatar.GetComponentsInChildren<Camera>(true), Is.Empty);
        }

        [Test]
        public void CaptureBoundsIntersectTheCameraAtBothScaleExtremesAndTheQuantizationBoundary()
        {
            var marker = Child("Root", Vector3.up).transform;
            var rig = SensaShaderCaptureBuilder.BuildNativeRig(avatar, marker, 1, new Rect(0, 0, .25f, .2f));
            rig.SetActive(true);
            var camera = rig.GetComponentInChildren<Camera>();
            camera.enabled = false;
            var skin = rig.GetComponentInChildren<SkinnedMeshRenderer>();
            var minimumEncodedScale = SensaShaderCapture.MaximumAvatarScale / (2 * 65535f) * 1.001f;
            foreach (var scale in new[] { 8f, .001f, minimumEncodedScale })
            {
                avatar.transform.localScale = Vector3.one * scale;
                var bounds = skin.sharedMesh.bounds;
                var worldBounds = new Bounds(skin.transform.TransformPoint(bounds.center), bounds.size * scale);
                Assert.That(camera.nearClipPlane, Is.EqualTo(SensaShaderCaptureBuilder.CaptureNearClipPlane));
                Assert.That(GeometryUtility.TestPlanesAABB(GeometryUtility.CalculateFrustumPlanes(camera), worldBounds), Is.True,
                    "The native encoder must remain inside the capture frustum at scale " + scale);
                Assert.That(GeometryUtility.TestPlanesAABB(GeometryUtility.CalculateFrustumPlanes(camera), skin.bounds), Is.True,
                    "The renderer's persisted native bounds must also remain visible at scale " + scale);
            }
        }
    }

    // These tests require a graphics-enabled PC Editor and explicit selection in Test Runner.
    // They render only a disposable local avatar into an in-memory RenderTexture.
    public sealed class ShaderCapturePixelContracts : AvatarBuildFixture
    {
        private const string GraphicsRun = "Select explicitly in a graphics-enabled PC Built-in Unity Editor; nographics is not GPU evidence.";

        [TestCase(1f)]
        [TestCase(8f)]
        [TestCase(.001f)]
        [Explicit(GraphicsRun)]
        public void NativeRootFramePixelsMatchProtocolAndRedundantCopies(float worldScale)
        {
            var marker = Child("Measured root", Vector3.up).transform;
            var packet = RenderPacket(marker, () => avatar.transform.localScale = Vector3.one * worldScale);
            Assert.That(packet[3], Is.EqualTo(3), "An in-range native frame must have its valid bit set.");
            foreach (var offset in new[] { 6, 8, 10 }) Assert.That(Read16(packet, offset), Is.EqualTo(32768).Within(1));
            Assert.That(ReadSigned16(packet, 14), Is.EqualTo(4096).Within(1));
            Assert.That(ReadSigned16(packet, 24), Is.EqualTo(4096).Within(1));
            foreach (var offset in new[] { 16, 18, 20, 22 }) Assert.That(ReadSigned16(packet, offset), Is.EqualTo(0).Within(1));
            Assert.That(Read16(packet, 26), Is.EqualTo(Mathf.RoundToInt(worldScale / 8 * 65535)).Within(1));
        }

        [Test]
        [Explicit(GraphicsRun)]
        public void NativeRootFramePixelsFollowNonuniformTargetMotion()
        {
            var marker = Child("Measured root", Vector3.up).transform;
            var packet = RenderPacket(marker, () => {
                marker.localRotation = Quaternion.Euler(0, 90, 0);
                marker.localScale = new Vector3(1.5f, .25f, 2.5f);
                avatar.transform.localScale = Vector3.one * 2;
            });
            Assert.That(packet[3], Is.EqualTo(3));
            var right = avatar.transform.InverseTransformVector(marker.TransformVector(Vector3.right));
            var forward = avatar.transform.InverseTransformVector(marker.TransformVector(Vector3.forward));
            for (var axis = 0; axis < 3; axis++)
            {
                Assert.That(ReadSigned16(packet, 14 + axis * 2), Is.EqualTo(Mathf.RoundToInt(right[axis] / 8 * 32767)).Within(1));
                Assert.That(ReadSigned16(packet, 20 + axis * 2), Is.EqualTo(Mathf.RoundToInt(forward[axis] / 8 * 32767)).Within(1));
            }
            Assert.That(Read16(packet, 26), Is.EqualTo(16384).Within(1));
        }

        [TestCase("mirrored-avatar")]
        [TestCase("nonuniform-avatar")]
        [TestCase("oversized-avatar")]
        [TestCase("collapsed-target")]
        [TestCase("oversized-target")]
        [Explicit(GraphicsRun)]
        public void NativeRootFramePixelsClearValidityForUnsupportedRuntimeFrames(string scenario)
        {
            var marker = Child("Measured root", Vector3.up).transform;
            var packet = RenderPacket(marker, () => {
                if (scenario == "mirrored-avatar") avatar.transform.localScale = new Vector3(-1, 1, 1);
                if (scenario == "nonuniform-avatar") avatar.transform.localScale = new Vector3(1, 2, 1);
                if (scenario == "oversized-avatar") avatar.transform.localScale = Vector3.one * 9;
                if (scenario == "collapsed-target") marker.localScale = new Vector3(0, 1, 1);
                if (scenario == "oversized-target") marker.localScale = new Vector3(9, 1, 1);
            });
            Assert.That(packet[3], Is.EqualTo(2), "Unsupported runtime measurements must encode an invalid native frame.");
        }

        private byte[] RenderPacket(Transform marker, System.Action animate)
        {
            Assert.That(SystemInfo.graphicsDeviceType, Is.Not.EqualTo(UnityEngine.Rendering.GraphicsDeviceType.Null), GraphicsRun);
            Assert.That(SystemInfo.supportsGeometryShaders, Is.True, GraphicsRun);
            Assert.That(SystemInfo.graphicsDeviceType, Is.Not.EqualTo(UnityEngine.Rendering.GraphicsDeviceType.Metal), GraphicsRun);
            var previousActive = RenderTexture.active;
            var previousMirrorMode = Shader.GetGlobalFloat("_VRChatMirrorMode");
            var previousCameraMode = Shader.GetGlobalFloat("_VRChatCameraMode");
            GameObject rig = null;
            Camera camera = null;
            Material material = null;
            Mesh mesh = null;
            RenderTexture target = null;
            Texture2D pixels = null;
            try
            {
                rig = SensaShaderCaptureBuilder.BuildNativeRig(avatar, marker, 42, new Rect(0, 0, 1, 1));
                var skin = rig.GetComponentInChildren<SkinnedMeshRenderer>(true);
                material = skin.sharedMaterial; mesh = skin.sharedMesh;
                camera = rig.GetComponentInChildren<Camera>(true);
                camera.enabled = false;
                target = new RenderTexture(160, 128, 24, RenderTextureFormat.ARGB32, RenderTextureReadWrite.Linear) { antiAliasing = 1 };
                target.Create(); camera.targetTexture = target;
                RenderTexture.active = target;
                GL.Clear(true, true, Color.magenta);
                Shader.SetGlobalFloat("_VRChatMirrorMode", 0); Shader.SetGlobalFloat("_VRChatCameraMode", 0);
                animate(); rig.SetActive(true);
                camera.Render();
                RenderTexture.active = target;
                pixels = new Texture2D(160, 128, TextureFormat.RGBA32, false, true);
                pixels.ReadPixels(new Rect(0, 0, 160, 128), 0, 0, false); pixels.Apply(false, false);
                var samples = pixels.GetPixels32();
                var modules = new int[40, 32];
                for (var row = 0; row < 32; row++) for (var column = 0; column < 40; column++)
                {
                    var color = samples[(row * 4 + 2) * 160 + column * 4 + 2];
                    Assert.That(color.r == color.g && color.g == color.b && (color.r == 0 || color.r == 255), Is.True,
                        "A module must be pure black/white; magenta means the primitive was not rendered.");
                    modules[column, row] = color.r == 255 ? 1 : 0;
                    if (column < 2 || column >= 38 || row < 2 || row >= 30)
                        Assert.That(modules[column, row], Is.EqualTo(1), "Two outer modules must remain white.");
                }
                var copies = new byte[3][];
                for (var bank = 0; bank < 3; bank++)
                {
                    copies[bank] = new byte[32];
                    for (var column = 0; column < 32; column++) for (var bit = 0; bit < 8; bit++)
                        copies[bank][(column + bank * 11) % 32] |= (byte)(modules[column + 4, bank * 8 + bit + 4] << bit);
                }
                CollectionAssert.AreEqual(copies[0], copies[1]); CollectionAssert.AreEqual(copies[0], copies[2]);
                var packet = copies[0];
                CollectionAssert.AreEqual(new byte[] { 83, 78, 1 }, packet.Take(3).ToArray());
                Assert.That(Read16(packet, 12), Is.EqualTo(42));
                Assert.That(Read32(packet, 28), Is.EqualTo(Crc32(packet, 28)), "Rendered measurements need a complete IEEE CRC32.");
                var golden = new byte[] { 83, 78, 1, 3, 0, 1, 0, 128, 0, 128, 0, 128, 42, 0, 0, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 16, 0, 32 };
                Assert.That(Crc32(golden, golden.Length), Is.EqualTo(0x0398563Eu), "Independent C# CRC agrees with the shared fixed vector.");
                for (var row = 2; row < 30; row++) for (var column = 2; column < 38; column++)
                {
                    int expected;
                    if (row < 4) expected = (int)((0xD3A69C57u >> ((column + 28) & 31)) & 1) ^ (row - 2);
                    else if (row >= 28) expected = (int)((0x69C57D3Au >> ((column + 28) & 31)) & 1) ^ (row - 28);
                    else if (column < 4) expected = (int)((0xA5D36Bu >> (row - 4)) & 1) ^ (column - 2);
                    else if (column >= 36) expected = (int)((0x6E29C7u >> (row - 4)) & 1) ^ (column - 36);
                    else continue;
                    Assert.That(modules[column, row], Is.EqualTo(expected), "Rendered edge markers must match the capture protocol.");
                }
                return packet;
            }
            finally
            {
                if (camera != null) { camera.enabled = false; camera.targetTexture = null; }
                RenderTexture.active = previousActive;
                Shader.SetGlobalFloat("_VRChatMirrorMode", previousMirrorMode); Shader.SetGlobalFloat("_VRChatCameraMode", previousCameraMode);
                if (target != null) { target.Release(); Object.DestroyImmediate(target); }
                if (pixels != null) Object.DestroyImmediate(pixels);
                if (rig != null) Object.DestroyImmediate(rig);
                if (material != null) Object.DestroyImmediate(material);
                if (mesh != null) Object.DestroyImmediate(mesh);
            }
        }

        private static int Read16(byte[] packet, int offset) => packet[offset] | packet[offset + 1] << 8;
        private static int ReadSigned16(byte[] packet, int offset) => (short)Read16(packet, offset);
        private static uint Read32(byte[] packet, int offset) => (uint)Read16(packet, offset) | (uint)Read16(packet, offset + 2) << 16;
        private static uint Crc32(byte[] packet, int count)
        {
            uint crc = 0xFFFFFFFFu;
            for (var index = 0; index < count; index++)
            {
                crc ^= packet[index];
                for (var bit = 0; bit < 8; bit++) crc = (crc >> 1) ^ ((crc & 1) != 0 ? 0xEDB88320u : 0u);
            }
            return crc ^ 0xFFFFFFFFu;
        }
    }
}
#endif
