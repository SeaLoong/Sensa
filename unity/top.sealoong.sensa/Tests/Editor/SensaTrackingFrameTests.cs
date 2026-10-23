#if UNITY_INCLUDE_TESTS
using System;
using System.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.Animations;
using nadena.dev.modular_avatar.core;
using VRC.SDK3.Avatars.Components;
using VRC.SDK3.Dynamics.Contact.Components;
using VRC.SDKBase;
using Object = UnityEngine.Object;

namespace UnityBox.Sensa.Tests
{
    public sealed class TrackingFrameContracts : AvatarBuildFixture
    {
        private static void SameRotation(Quaternion actual, Quaternion expected)
        {
            // Compare two basis axes without amplifying float roundoff through acos.
            Assert.That(Vector3.Distance(actual * Vector3.forward, expected * Vector3.forward), Is.LessThan(.00001f));
            Assert.That(Vector3.Distance(actual * Vector3.right, expected * Vector3.right), Is.LessThan(.00001f));
        }
        private SensaTrackingFrame Author(bool contact = false)
        {
            if (contact && !SensaContactRootBuilder.IsSupported)
                Assert.Ignore("Contact frame contracts need SDK advanced Contact parameters.");
            var author = Child("Frame author", Vector3.zero).AddComponent<SensaTrackingFrame>();
            author.reference = Child("Reference bone", Vector3.up).transform;
            author.trackingMethod = contact ? SensaRootTrackingMethod.ContactDirect : SensaRootTrackingMethod.FourAnchor;
            return author;
        }

        [TestCase(false, 15, 15)]
        [TestCase(true, 6, 36)]
        public void ThreeDistinctPointsReuseExistingAvatarRootContracts(bool contact, int contactCount, int publicCount)
        {
            var author = Author(contact);
            SensaTrackingFrameBuilder.ProcessAvatar(avatar);
            Assert.That(author == null, Is.True);
            Assert.That(avatar.GetComponentsInChildren<VRCContactReceiver>(true).Length
                + avatar.GetComponentsInChildren<VRCContactSender>(true).Length, Is.EqualTo(contactCount));
            var publicNames = avatar.GetComponentsInChildren<ModularAvatarParameters>(true)
                .SelectMany(parameters => parameters.parameters).Select(parameter => parameter.nameOrPrefix).ToArray();
            Assert.That(publicNames, Has.Length.EqualTo(publicCount));
            var prefix = contact ? SensaContactProtocol.Prefix : SensaFixedAnchorProtocol.Prefix;
            CollectionAssert.AreEquivalent(new[] { "Frame_Origin", "Frame_Forward", "Frame_Right" },
                publicNames.Select(name => name.Substring(prefix.Length + 1).Split('/')[0]).Distinct());
            Assert.That(avatar.GetComponentsInChildren<VRCContactSender>(true).Select(sender => sender.collisionTags.Single()).Distinct().Count(), Is.EqualTo(3));
            if (contact)
                Assert.That(avatar.GetComponentsInChildren<VRCContactReceiver>(true).All(receiver =>
                    receiver.rootTransform == avatar.transform && receiver.position == Vector3.zero && receiver.rotation == Quaternion.identity), Is.True);
            else
                Assert.That(avatar.transform.Find("SensaFixedRoot_Frame_Origin/Contacts/P0").localPosition,
                    Is.EqualTo(new Vector3(SensaFixedAnchorProtocol.AnchorX(0), SensaFixedAnchorProtocol.AnchorY(0), SensaFixedAnchorProtocol.AnchorZ(0))));
            int children = avatar.GetComponentsInChildren<Transform>(true).Length;
            SensaTrackingFrameBuilder.ProcessAvatar(avatar);
            Assert.That(avatar.GetComponentsInChildren<Transform>(true), Has.Length.EqualTo(children));
        }

        [TestCase(false)]
        [TestCase(true)]
        public void RigidFrameFollowsPositionAndRotationWithAvatarScaleAndIgnoresBoneScale(bool contact)
        {
            var author = Author(contact);
            avatar.transform.SetPositionAndRotation(new Vector3(2, 3, 4), Quaternion.Euler(5, 20, 30));
            avatar.transform.localScale = Vector3.one * 1.2f;
            var bone = author.reference.transform;
            bone.localScale = new Vector3(.5f, 2, 3);
            bone.localRotation = Quaternion.Euler(25, 40, 12);
            author.positionOffset = new Vector3(.1f, -.05f, .03f);
            author.rotationOffset = new Vector3(15, 90, 5);
            var frame = SensaTrackingFrameBuilder.Build(avatar, author).transform;
            var source = bone.Find("SensaFrameSource_Frame");
            Assert.That(source, Is.Not.Null);
            Assert.That(source.localPosition, Is.EqualTo(author.positionOffset));
            Assert.That(Vector3.Distance(frame.position, bone.TransformPoint(author.positionOffset)), Is.LessThan(.00001f));
            SameRotation(frame.rotation, bone.rotation * Quaternion.Euler(author.rotationOffset));
            Assert.That(frame.parent, Is.SameAs(avatar.transform)); Assert.That(frame.localScale, Is.EqualTo(Vector3.one));
            var follow = frame.GetComponent<ParentConstraint>();
            Assert.That(follow.sourceCount, Is.EqualTo(1)); Assert.That(follow.GetSource(0).sourceTransform, Is.SameAs(source));
            Assert.That(follow.constraintActive && follow.locked, Is.True);
            Assert.That(follow.GetTranslationOffset(0), Is.EqualTo(Vector3.zero)); Assert.That(follow.GetRotationOffset(0), Is.EqualTo(Vector3.zero));
            var origin = frame.Find("Origin").position;
            var forward = frame.Find("Forward").position - origin;
            var right = frame.Find("Right").position - origin;
            Assert.That(forward.magnitude, Is.EqualTo(author.axisLength * 1.2f).Within(.00001f));
            Assert.That(right.magnitude, Is.EqualTo(author.axisLength * 1.2f).Within(.00001f));
            Assert.That(Vector3.Dot(forward.normalized, right.normalized), Is.EqualTo(0).Within(.00001f));
            Assert.That(Vector3.Dot(Vector3.Cross(forward, right).normalized, frame.up), Is.EqualTo(1).Within(.00001f));
            Assert.That(bone.localScale, Is.EqualTo(new Vector3(.5f, 2, 3)));
        }

        [Test] public void NativeContactOffsetsAreComposedBeforeMeasurementRotation()
        {
            var author = Author();
            var receiver = author.reference.gameObject.AddComponent<VRCContactReceiver>();
            receiver.rootTransform = Child("Actual Contact root", Vector3.up).transform;
            receiver.position = new Vector3(.1f, .2f, .3f); receiver.rotation = Quaternion.Euler(0, 90, 0);
            author.reference = receiver; author.positionOffset = Vector3.forward * .2f; author.rotationOffset = new Vector3(90, 0, 0);
            var placement = SensaTrackingFrameBuilder.ResolvePlacement(author);
            Assert.That(placement.root, Is.SameAs(receiver.rootTransform));
            Assert.That(Vector3.Distance(placement.position, receiver.position + receiver.rotation * author.positionOffset), Is.LessThan(.00001f));
            SameRotation(placement.rotation, receiver.rotation * Quaternion.Euler(author.rotationOffset));
        }

        [Test] public void SpsSocketReferenceUsesItsResolvedRootGeometry()
        {
            var author = Author();
            author.reference = Socket("SPS Socket", Vector3.up).GetComponents<Component>().Single(SensaSpsAdapter.IsTarget);
            author.positionOffset = new Vector3(.01f, .02f, .03f); author.rotationOffset = new Vector3(0, 90, 0);
            var root = SensaSpsAdapter.ReadRoot(author.reference);
            var frame = SensaTrackingFrameBuilder.Build(avatar, author).transform;
            Assert.That(Vector3.Distance(frame.position, root.root.TransformPoint(root.position + root.rotation * author.positionOffset)), Is.LessThan(.00001f));
            SameRotation(frame.rotation, root.root.rotation * root.rotation * Quaternion.Euler(author.rotationOffset));
        }

        [Test] public void BuildCopyRemapsTheReferenceAndConsumesOnlyTheCopyAuthor()
        {
            var author = Author();
            var originalBone = author.reference;
            var copy = Own(Object.Instantiate(avatar));
            var copiedAuthor = copy.GetComponentInChildren<SensaTrackingFrame>();
            Assert.That(copiedAuthor.reference, Is.Not.SameAs(originalBone));
            Assert.That(copiedAuthor.reference.transform.IsChildOf(copy.transform), Is.True);
            SensaBuildPipeline.Generate(copy);
            Assert.That(copy.GetComponentsInChildren<MonoBehaviour>(true).Any(component => component is IEditorOnly), Is.False);
            Assert.That(author.reference, Is.SameAs(originalBone));
            Assert.That(avatar.GetComponentsInChildren<VRCContactReceiver>(true), Is.Empty);
            var frame = copy.transform.Find("SensaTrackingFrame_Frame");
            Assert.That(frame.GetComponent<ParentConstraint>().GetSource(0).sourceTransform.IsChildOf(copy.transform), Is.True);
        }

        [Test] public void DisabledIncompleteAuthorIsRemovedWithoutGeneratingContacts()
        {
            var author = avatar.AddComponent<SensaTrackingFrame>(); author.enabled = false;
            SensaBuildPipeline.Generate(avatar);
            Assert.That(avatar.GetComponent<SensaTrackingFrame>(), Is.Null);
            Assert.That(avatar.GetComponentsInChildren<VRCContactReceiver>(true), Is.Empty);
        }

        [Test] public void SensaRootReferenceIsResolvedBeforeItsAuthoringComponentIsConsumed()
        {
            var source = avatar.AddComponent<SensaComponent>();
            source.instanceName = "SocketSource";
            source.depthAxis = Child("Socket axis", Vector3.up).transform;
            var author = Child("Frame author", Vector3.zero).AddComponent<SensaTrackingFrame>(); author.reference = source;
            SensaBuildPipeline.Generate(avatar);
            Assert.That(avatar.GetComponent<SensaComponent>(), Is.Null);
            var frame = avatar.transform.Find("SensaTrackingFrame_Frame");
            Assert.That(frame.GetComponent<ParentConstraint>().GetSource(0).sourceTransform.parent.name, Is.EqualTo("Socket axis"));
        }

        [TestCase(false)]
        [TestCase(true)]
        public void DeclaredPublicParameterConflictIsReportedBeforeCreatingAnyFramePoint(bool contact)
        {
            Author(contact);
            var prefix = contact ? SensaContactProtocol.Prefix : SensaFixedAnchorProtocol.Prefix;
            SensaSensorUtility.Parameter(avatar, prefix + "/Frame_Right/Sample");
            Assert.Throws<InvalidOperationException>(() => SensaTrackingFrameBuilder.ProcessAvatar(avatar));
            Assert.That(avatar.transform.Find("SensaTrackingFrame_Frame"), Is.Null);
            Assert.That(avatar.GetComponentsInChildren<VRCContactReceiver>(true), Is.Empty);
        }

        [TestCase(false)]
        [TestCase(true)]
        public void ExistingPointIdentityAndContactBudgetFailBeforeFrameCreation(bool contact)
        {
            var author = Author(contact);
            if (contact) SensaContactRootBuilder.Build(avatar, "Frame_Forward", author.reference, "");
            else SensaFixedRootBuilder.Build(avatar, "Frame_Forward", author.reference, "");
            Assert.Throws<InvalidOperationException>(() => SensaTrackingFrameBuilder.ProcessAvatar(avatar));
            Assert.That(avatar.transform.Find("SensaTrackingFrame_Frame"), Is.Null);
            author.instanceName = "Other";
            int existing = avatar.GetComponentsInChildren<VRCContactReceiver>(true).Length + avatar.GetComponentsInChildren<VRCContactSender>(true).Length;
            for (int i = existing; i < 256 - SensaTrackingFrameBuilder.ContactCount(author) + 1; i++)
                Child("Existing contact " + i, Vector3.zero).AddComponent<VRCContactSender>();
            Assert.Throws<InvalidOperationException>(() => SensaTrackingFrameBuilder.ProcessAvatar(avatar));
            Assert.That(avatar.transform.Find("SensaTrackingFrame_Other"), Is.Null);
        }

        [Test] public void DuplicateNamesAndInvalidReferencesFailBeforeGeneration()
        {
            var author = Author(); var second = Author();
            Assert.Throws<InvalidOperationException>(() => SensaTrackingFrameBuilder.ProcessAvatar(avatar));
            second.enabled = false;
            var target = author.reference;
            author.reference = Own(new GameObject("Foreign reference")).transform;
            Assert.Throws<InvalidOperationException>(() => SensaTrackingFrameBuilder.ProcessAvatar(avatar));
            author.reference = target; author.rotationOffset = new Vector3(float.NaN, 0, 0);
            Assert.Throws<InvalidOperationException>(() => SensaTrackingFrameBuilder.ProcessAvatar(avatar));
            author.rotationOffset = Vector3.zero; author.axisLength = float.PositiveInfinity;
            Assert.Throws<InvalidOperationException>(() => SensaTrackingFrameBuilder.ProcessAvatar(avatar));
            author.axisLength = .2f; author.instanceName = new string('A', 41);
            Assert.Throws<InvalidOperationException>(() => SensaTrackingFrameBuilder.ProcessAvatar(avatar));
            Assert.That(avatar.GetComponentsInChildren<VRCContactReceiver>(true), Is.Empty);
            Assert.That(avatar.transform.Find("SensaTrackingFrame_Frame"), Is.Null);
        }

        [Test] public void NdmfMergesFrameParametersAndConsumesAuthoringComponent()
        {
            Author();
            nadena.dev.ndmf.AvatarProcessor.ProcessAvatar(avatar);
            Assert.That(avatar.GetComponentInChildren<SensaTrackingFrame>(), Is.Null);
            var parameters = avatar.GetComponent<VRCAvatarDescriptor>().expressionParameters.parameters
                .Where(parameter => parameter.name.StartsWith("Sensa/SPS/Frame_", StringComparison.Ordinal)).ToArray();
            Assert.That(parameters, Has.Length.EqualTo(15));
            Assert.That(parameters.All(parameter => !parameter.networkSynced), Is.True);
        }

        [Test] public void PrefabAndMenuKeepReferencesEditableAndAllocateUniqueNames()
        {
            var prefab = Prefab("SensaTrackingFrame");
            var settings = prefab.GetComponent<SensaTrackingFrame>();
            Assert.That(settings, Is.Not.Null); Assert.That(settings.reference, Is.Null);
            Assert.That(settings.axisLength, Is.EqualTo(.2f));
            var previous = Selection.activeGameObject;
            try
            {
                var bone = Child("Chosen bone", Vector3.up);
                var other = avatar.AddComponent<SensaFixedRootProbe>(); other.instanceName = "Frame_Forward"; other.enabled = false;
                Selection.activeGameObject = bone; SensaPoseMenus.TrackingFrame();
                var first = Selection.activeGameObject.GetComponent<SensaTrackingFrame>();
                Selection.activeGameObject = bone; SensaPoseMenus.TrackingFrame();
                var second = Selection.activeGameObject.GetComponent<SensaTrackingFrame>();
                Assert.That(first.reference, Is.SameAs(bone.transform)); Assert.That(first.instanceName, Is.EqualTo("Frame_2"));
                Assert.That(second.instanceName, Is.EqualTo("Frame_3"));
                Assert.That(PrefabUtility.IsPartOfPrefabInstance(first), Is.True);
                SensaTrackingFrameEditor.SetDepthDirection(first, Vector3.right);
                Assert.That(PrefabUtility.GetPropertyModifications(first).Any(change => change.propertyPath == "rotationOffset.y"), Is.True);
                bone.transform.localRotation = Quaternion.Euler(10, 20, 0);
                bone.transform.localScale = new Vector3(.5f, 2, 1);
                var position = bone.transform.TransformPoint(new Vector3(.03f, .02f, .01f));
                var rotation = bone.transform.rotation * Quaternion.Euler(5, 15, 25);
                SensaTrackingFrameEditor.SetWorldPose(first, position, rotation);
                var placement = SensaTrackingFrameBuilder.ResolvePlacement(first);
                Assert.That(Vector3.Distance(placement.root.TransformPoint(placement.position), position), Is.LessThan(.00001f));
                SameRotation(placement.root.rotation * placement.rotation, rotation);
                Assert.That(PrefabUtility.GetPropertyModifications(first).Any(change => change.propertyPath == "positionOffset.z"), Is.True);
                Assert.That(avatar.GetComponentsInChildren<VRCContactReceiver>(true), Is.Empty);
            }
            finally { Selection.activeGameObject = previous; }
        }

        [Test] public void InspectorAxisChoicesKeepTheDepthNormalAndHorizontalAxisOrthogonal()
        {
            foreach (var direction in new[] { Vector3.forward, Vector3.back, Vector3.right, Vector3.left, Vector3.up, Vector3.down })
            {
                var rotation = SensaTrackingFrameEditor.DepthRotation(direction);
                Assert.That(Vector3.Distance(rotation * Vector3.forward, direction), Is.LessThan(.00001f));
                Assert.That(Vector3.Dot(rotation * Vector3.forward, rotation * Vector3.right), Is.EqualTo(0).Within(.00001f));
            }
        }
    }
}
#endif
