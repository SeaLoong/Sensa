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
