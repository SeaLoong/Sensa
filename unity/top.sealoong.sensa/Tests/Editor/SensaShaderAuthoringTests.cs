#if UNITY_INCLUDE_TESTS
using System;
using System.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using VRC.SDK3.Dynamics.Contact.Components;

namespace UnityBox.Sensa.Tests
{
    public sealed class ShaderRootAuthoringContracts : AvatarBuildFixture
    {
        private SensaShaderCapture Author(Component target, int id = 1)
        {
            var host = Child("Capture author " + id, Vector3.zero);
            var author = host.AddComponent<SensaShaderCapture>();
            author.target = target; author.producerId = id;
            return author;
        }

        private SkinnedMeshRenderer Encoder(int id = 1) => avatar.transform.Find("SensaShaderCapture_" + id)
            .GetComponentInChildren<SkinnedMeshRenderer>(true);

        [Test]
        public void ExplicitBoneTargetUsesThePackagedShaderWithoutWritingProjectAssets()
        {
            var bone = Child("Measured bone", new Vector3(.2f, 1.1f, -.15f)).transform;
            var author = Author(bone);
            var before = AssetDatabase.FindAssets("", new[] { "Assets" }).OrderBy(value => value).ToArray();
            SensaShaderCaptureBuilder.ProcessAvatar(avatar);
            Assert.That(author == null, Is.True);
            var encoder = Encoder();
            Assert.That(encoder.bones, Has.Length.EqualTo(1));
            Assert.That(encoder.bones[0].parent, Is.SameAs(bone));
            Assert.That(encoder.bones[0].position, Is.EqualTo(bone.position));
            Assert.That(AssetDatabase.GetAssetPath(encoder.sharedMaterial.shader), Is.EqualTo(SensaShaderCaptureBuilder.ShaderAssetPath));
            CollectionAssert.AreEqual(before, AssetDatabase.FindAssets("", new[] { "Assets" }).OrderBy(value => value).ToArray());
        }

        [Test]
        public void NativeContactTargetUsesItsExplicitShapeFrameAndOffset()
        {
            var frame = Child("Contact shape frame", new Vector3(.2f, 1, .1f)).transform;
            frame.localRotation = Quaternion.Euler(0, 35, 0);
            var receiver = Child("Native Receiver", Vector3.zero).AddComponent<VRCContactReceiver>();
            receiver.rootTransform = frame; receiver.position = new Vector3(.03f, -.02f, .05f);
            receiver.rotation = Quaternion.Euler(15, 0, 0);
            Author(receiver);
            SensaShaderCaptureBuilder.ProcessAvatar(avatar);
            var marker = Encoder().bones.Single();
            Assert.That(marker.parent, Is.SameAs(frame));
            Assert.That(Vector3.Distance(marker.position, frame.TransformPoint(receiver.position)), Is.LessThan(.00001f));
            Assert.That(Quaternion.Angle(marker.rotation, frame.rotation * receiver.rotation), Is.LessThan(.001f));
        }

        [Test]
        public void AuthoredOriginAndAxesFollowTheSelectedRootAfterArbitraryBodyMotion()
        {
            var frame = Child("Moving surface", new Vector3(.2f, 1, -.1f)).transform;
            frame.localRotation = Quaternion.Euler(20, 35, -15);
            var receiver = Child("Contact frame", Vector3.zero).AddComponent<VRCContactReceiver>();
            receiver.rootTransform = frame;
            receiver.position = new Vector3(.04f, -.02f, .03f);
            receiver.rotation = Quaternion.Euler(10, -25, 5);
            var author = Author(receiver);
            var offset = author.positionOffset = new Vector3(.03f, .02f, -.04f);
            var rotation = author.rotationOffset = new Vector3(65, 20, -30);
            var sourcePosition = receiver.position; var sourceRotation = receiver.rotation;
            SensaShaderCaptureBuilder.ProcessAvatar(avatar);
            var encoder = Encoder(); var marker = encoder.bones.Single();
            Assert.That(Vector3.Distance(marker.localPosition, sourcePosition + sourceRotation * offset), Is.LessThan(.00001f));
            Assert.That(Quaternion.Angle(marker.localRotation, sourceRotation * Quaternion.Euler(rotation)), Is.LessThan(.001f));
            avatar.transform.SetPositionAndRotation(new Vector3(3, -2, 5), Quaternion.Euler(17, -60, 43));
            avatar.transform.localScale = Vector3.one * 1.7f;
            frame.localPosition = new Vector3(-.3f, 1.2f, .2f);
            frame.localRotation = Quaternion.Euler(-75, 113, 21);
            var skin = encoder.transform.worldToLocalMatrix * marker.localToWorldMatrix * encoder.sharedMesh.bindposes.Single();
            var measured = encoder.sharedMesh.vertices.Select(skin.MultiplyPoint3x4).ToArray();
            var expected = avatar.transform.worldToLocalMatrix * frame.localToWorldMatrix
                * Matrix4x4.TRS(sourcePosition, sourceRotation, Vector3.one)
                * Matrix4x4.TRS(offset, Quaternion.Euler(rotation), Vector3.one);
            Assert.That(Vector3.Distance(measured[0], expected.MultiplyPoint3x4(Vector3.zero)), Is.LessThan(.00001f));
            Assert.That(Vector3.Distance((measured[1] - measured[0]) / SensaShaderCapture.ProbeArmLength,
                expected.MultiplyVector(Vector3.right)), Is.LessThan(.00001f));
            Assert.That(Vector3.Distance((measured[2] - measured[0]) / SensaShaderCapture.ProbeArmLength,
                expected.MultiplyVector(Vector3.forward)), Is.LessThan(.00001f));
            Assert.That(encoder.transform.localToWorldMatrix, Is.EqualTo(avatar.transform.localToWorldMatrix));
        }

        [Test]
        public void AxisRotationLeavesTheOriginOffsetInTheSelectedRootsAxes()
        {
            var bone = Child("Root", Vector3.up).transform;
            var author = Author(bone);
            author.positionOffset = new Vector3(.1f, .2f, .3f);
            var before = SensaShaderCaptureBuilder.ResolvePlacement(author);
            author.rotationOffset = new Vector3(90, 0, 0);
            var after = SensaShaderCaptureBuilder.ResolvePlacement(author);
            Assert.That(after.position, Is.EqualTo(before.position));
            Assert.That(Vector3.Distance(after.rotation * Vector3.forward, Vector3.down), Is.LessThan(.00001f));
        }

        [Test]
        public void NonfiniteOffsetsAreRejectedBeforeAnyNativeObjectsAreCreated()
        {
            var author = Author(Child("Root", Vector3.up).transform);
            foreach (var invalid in new[] { float.NaN, float.PositiveInfinity, float.NegativeInfinity })
            {
                author.positionOffset = new Vector3(0, invalid, 0);
                author.rotationOffset = Vector3.zero;
                Assert.Throws<InvalidOperationException>(() => SensaShaderCaptureBuilder.ProcessAvatar(avatar));
                author.positionOffset = Vector3.zero;
                author.rotationOffset = new Vector3(0, 0, invalid);
                Assert.Throws<InvalidOperationException>(() => SensaShaderCaptureBuilder.ProcessAvatar(avatar));
                Assert.That(avatar.GetComponentsInChildren<Camera>(true), Is.Empty);
                Assert.That(avatar.GetComponentsInChildren<SkinnedMeshRenderer>(true), Is.Empty);
            }
        }

        [Test]
        public void OwnedSensaRootAndExplicitTargetPrecedenceWorkWithoutVrcfury()
        {
            var component = Child("Owned Socket", Vector3.zero).AddComponent<SensaComponent>();
            component.depthAxis = Child("Socket frame", new Vector3(.1f, .9f, .2f)).transform;
            var author = Author(component);
            // A new explicit target takes precedence over an old serialized GameObject field.
            author.spsTarget = Own(new GameObject("Old reference outside this avatar"));
            SensaShaderCaptureBuilder.ProcessAvatar(avatar);
            Assert.That(Encoder().bones.Single().parent, Is.SameAs(component.depthAxis));
        }

        [Test]
        public void ExistingSpsObjectReferenceResolvesItsOriginalComponent()
        {
            var socket = Socket("Existing SPS Socket", Vector3.up);
            var author = Author(null); author.spsTarget = socket;
            Assert.That(SensaShaderCaptureBuilder.ResolveTarget(author).gameObject, Is.SameAs(socket));
        }

        [Test]
        public void InvalidSecondAuthorLeavesEveryAuthorAndCreatesNoNativeObjects()
        {
            var bone = Child("Measured bone", Vector3.up).transform;
            var first = Author(bone);
            var second = Author(Own(new GameObject("Foreign root")).transform, 2);
            Assert.Throws<InvalidOperationException>(() => SensaShaderCaptureBuilder.ProcessAvatar(avatar));
            Assert.That(first != null && second != null, Is.True);
            Assert.That(avatar.GetComponentsInChildren<Camera>(true), Is.Empty);
            Assert.That(avatar.GetComponentsInChildren<Transform>(true).Any(node =>
                node.name.StartsWith("SensaShaderRoot_", StringComparison.Ordinal)
                || node.name.StartsWith("SensaShaderCapture_", StringComparison.Ordinal)), Is.False);
        }

        [Test]
        public void DisabledAuthorIsRemovedWithoutGeneratingOrResolvingATarget()
        {
            var author = Author(null); author.enabled = false;
            SensaShaderCaptureBuilder.ProcessAvatar(avatar);
            Assert.That(author == null, Is.True);
            Assert.That(avatar.GetComponentsInChildren<Camera>(true), Is.Empty);
            Assert.That(avatar.GetComponentsInChildren<Renderer>(true), Is.Empty);
        }

        [Test]
        public void ReprocessingIsIdempotentAndADirectDuplicateProducerIsRejected()
        {
            var bone = Child("Measured bone", Vector3.up).transform;
            Author(bone); SensaShaderCaptureBuilder.ProcessAvatar(avatar);
            var first = Encoder();
            SensaShaderCaptureBuilder.ProcessAvatar(avatar);
            Assert.That(avatar.GetComponentsInChildren<Camera>(true), Has.Length.EqualTo(1));
            Assert.That(Encoder(), Is.SameAs(first));
            Assert.Throws<InvalidOperationException>(() => SensaShaderCaptureBuilder.BuildNativeRig(avatar, bone, 1, new Rect(0, 0, .25f, .15f)));
            Assert.That(avatar.GetComponentsInChildren<Camera>(true), Has.Length.EqualTo(1));
        }
    }
}
#endif
