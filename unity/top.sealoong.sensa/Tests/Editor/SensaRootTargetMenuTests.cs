#if UNITY_INCLUDE_TESTS
using System.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using VRC.SDK3.Dynamics.Contact.Components;

namespace UnityBox.Sensa.Tests
{
    public sealed class RootTargetMenuContracts : AvatarBuildFixture
    {
        [Test]
        public void ExplicitTransformRootPreservesTheSelectedBoneAndUsesItsOrigin()
        {
            var bone = Child("Measured bone", new Vector3(.1f, 1.1f, -.2f)).transform;
            bone.localRotation = Quaternion.Euler(15, 30, 0);
            var originalPosition = bone.localPosition; var originalRotation = bone.localRotation;
            var placement = SensaSpsAdapter.ReadRoot(bone);
            Assert.That(placement.root, Is.SameAs(bone)); Assert.That(placement.position, Is.EqualTo(Vector3.zero));
            Assert.That(placement.rotation, Is.EqualTo(Quaternion.identity));
            var author = Child("Root author", Vector3.zero).AddComponent<SensaFixedRootProbe>(); author.target = bone;
            SensaFixedRootBuilder.ProcessAvatar(avatar);
            var source = bone.Find("SensaRootSource_Root");
            Assert.That(source, Is.Not.Null); Assert.That(source.position, Is.EqualTo(bone.position));
            Assert.That(bone.localPosition, Is.EqualTo(originalPosition)); Assert.That(bone.localRotation, Is.EqualTo(originalRotation));
            Assert.That(avatar.GetComponentsInChildren<VRCContactReceiver>(true), Has.Length.EqualTo(4));
        }

        [Test]
        public void RootMenusBindAnExplicitBoneAndCreateDistinctEditableInstances()
        {
            var previous = Selection.activeGameObject;
            try
            {
                var bone = Child("Measured bone", Vector3.up);
                Selection.activeGameObject = bone; SensaPoseMenus.SpsRoot();
                var first = Selection.activeGameObject.GetComponent<SensaFixedRootProbe>();
                Selection.activeGameObject = bone; SensaPoseMenus.ContactRoot();
                var second = Selection.activeGameObject.GetComponent<SensaContactRootProbe>();
                Assert.That(first.target, Is.SameAs(bone.transform)); Assert.That(second.target, Is.SameAs(bone.transform));
                Assert.That(first.instanceName, Is.EqualTo("Root")); Assert.That(second.instanceName, Is.EqualTo("Root_2"));
                Assert.That(first.collisionChannel, Is.Null.Or.Empty); Assert.That(second.collisionChannel, Is.Null.Or.Empty);
                Assert.That(PrefabUtility.IsPartOfPrefabInstance(first), Is.True);
                Assert.That(PrefabUtility.IsPartOfPrefabInstance(second), Is.True);
                Assert.That(avatar.GetComponentsInChildren<VRCContactReceiver>(true), Is.Empty);
            }
            finally { Selection.activeGameObject = previous; }
        }

        [Test]
        public void AvatarRootAndAmbiguousComponentMenusLeaveTheTargetForAnExplicitChoice()
        {
            var previous = Selection.activeGameObject;
            try
            {
                Selection.activeGameObject = avatar; SensaPoseMenus.SpsRoot();
                Assert.That(Selection.activeGameObject.GetComponent<SensaFixedRootProbe>().target, Is.Null);
                var ambiguous = Child("Two root components", Vector3.zero);
                ambiguous.AddComponent<SensaComponent>(); ambiguous.AddComponent<VRCContactSender>();
                Selection.activeGameObject = ambiguous; SensaPoseMenus.ContactRoot();
                Assert.That(Selection.activeGameObject.GetComponent<SensaContactRootProbe>().target, Is.Null);
                var native = Child("One native Contact", Vector3.zero).AddComponent<VRCContactSender>();
                Selection.activeGameObject = native.gameObject; SensaPoseMenus.ContactRoot();
                Assert.That(Selection.activeGameObject.GetComponent<SensaContactRootProbe>().target, Is.SameAs(native));
            }
            finally { Selection.activeGameObject = previous; }
        }

        [Test]
        public void ShaderMenuUsesTheAuthoringPrefabAndChoosesAnUnusedProducerId()
        {
            var previous = Selection.activeGameObject;
            try
            {
                var bone = Child("Measured bone", Vector3.up);
                Selection.activeGameObject = bone; SensaPoseMenus.ShaderCapture();
                var first = Selection.activeGameObject.GetComponent<SensaShaderCapture>();
                Selection.activeGameObject = bone; SensaPoseMenus.ShaderCapture();
                var second = Selection.activeGameObject.GetComponent<SensaShaderCapture>();
                Assert.That(first.target, Is.SameAs(bone.transform)); Assert.That(second.target, Is.SameAs(bone.transform));
                Assert.That(first.producerId, Is.EqualTo(1)); Assert.That(second.producerId, Is.EqualTo(2));
                Assert.That(PrefabUtility.IsPartOfPrefabInstance(first), Is.True);
                Assert.That(avatar.GetComponentsInChildren<Camera>(true), Is.Empty);
            }
            finally { Selection.activeGameObject = previous; }
        }

        [Test]
        public void RootOnlyAutomaticTrackingDoesNotRequireOrCreateATip()
        {
            var plug = Plug("Measured Plug", Vector3.zero);
            var target = plug.GetComponents<Component>().Single(SensaSpsAdapter.IsTarget);
            var setup = avatar.AddComponent<SensaAutoSetup>();
            Assert.That(SensaAutoBuilder.ReadPlacement(setup, target).length, Is.Zero);
            setup.pairedPlugMarkers = true;
            Assert.That(SensaAutoBuilder.ReadPlacement(setup, target).length, Is.GreaterThan(.02f));
            setup.pairedPlugMarkers = false;
            SensaAutoBuilder.ProcessAvatar(avatar);
            Assert.That(plug.GetComponentsInChildren<Transform>(true).Any(node => node.name == "Tip"), Is.False);
            Assert.That(avatar.GetComponentsInChildren<VRCContactReceiver>(true), Has.Length.EqualTo(4));
        }
    }
}
#endif
