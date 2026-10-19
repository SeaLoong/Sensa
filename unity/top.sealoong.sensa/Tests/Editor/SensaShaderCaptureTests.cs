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
            Assert.That(skin.sharedMesh.GetTopology(0), Is.EqualTo(MeshTopology.Points));
            Assert.That(skin.sharedMaterial.GetFloat("_SensaProducerId"), Is.EqualTo(42));
            Assert.That(skin.sharedMaterial.GetFloat("_SensaCameraFar"), Is.EqualTo(capture.farClipPlane));

            // Test the persisted inspector bounds, not a transient Renderer.localBounds override.
            var serialized = new SerializedObject(skin);
            var bounds = serialized.FindProperty("m_AABB").boundsValue;
            Assert.That(bounds.center, Is.EqualTo(new Vector3(0, 1, .2f)));
            Assert.That(bounds.size, Is.EqualTo(new Vector3(2, 1, .1f)));
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
            var actual = matrix.MultiplyPoint3x4(skin.sharedMesh.vertices[0]);
            var expected = avatar.transform.InverseTransformPoint(marker.position);
            Assert.That(Vector3.Distance(actual, expected), Is.LessThan(.00001f));
            Assert.That(skin.transform.localToWorldMatrix, Is.EqualTo(avatar.transform.localToWorldMatrix));
        }
    }
}
#endif
