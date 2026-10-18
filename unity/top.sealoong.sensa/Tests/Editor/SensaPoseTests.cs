#if UNITY_INCLUDE_TESTS
using System;
using System.Linq;
using NUnit.Framework;
using UnityEngine;
using VRC.SDK3.Dynamics.Contact.Components;
using nadena.dev.modular_avatar.core;

namespace UnityBox.Sensa.Tests
{
    public class PoseAuthoringContracts : AvatarBuildFixture
    {
        [Test]
        public void StandardProbeCreatesOnlyEightRootReceivers()
        {
            var instance = Prefab("SensaSpsRootProbe");
            SensaPoseBuilder.ProcessAvatar(instance);
            var contacts = instance.GetComponentsInChildren<VRCContactReceiver>();
            Assert.That(contacts, Has.Length.EqualTo(8));
            Assert.That(contacts.All(contact => contact.localOnly && contact.allowOthers && !contact.allowSelf), Is.True);
            Assert.That(contacts.All(contact => contact.collisionTags.SequenceEqual(new[] { "TPS_Pen_Root" })), Is.True);
            Assert.That(contacts.All(contact => contact.parameter.StartsWith("Sensa/SpsRoot/v1/")), Is.True);
            Assert.That(instance.GetComponentsInChildren<VRCContactSender>(), Is.Empty);
        }

        [Test]
        public void SocketCreatesDistinctLocalFloatReceiversAndConsumesItsAuthoringInput()
        {
            var instance = Prefab("SensaPoseSocket");
            SensaPoseBuilder.ProcessAvatar(instance);
            var contacts = instance.GetComponentsInChildren<VRCContactReceiver>();
            Assert.That(contacts, Has.Length.EqualTo(24));
            Assert.That(contacts.Select(contact => contact.parameter).Distinct().Count(), Is.EqualTo(24));
            Assert.That(contacts.All(contact => contact.localOnly && contact.allowOthers && !contact.allowSelf), Is.True);
            var parameters = instance.GetComponent<ModularAvatarParameters>().parameters;
            Assert.That(parameters.All(parameter => parameter.syncType == ParameterSyncType.Float && parameter.localOnly), Is.True);
            Assert.That(instance.GetComponent<SensaPoseSocket>(), Is.Null);
        }

        [TestCase("SensaPoseSocket")]
        [TestCase("SensaSpsRootProbe")]
        public void StandaloneSpatialReceiverParametersAreWritableInFx(string prefab)
        {
            var instance = Prefab(prefab); instance.transform.SetParent(avatar.transform, false);
            SensaPoseBuilder.ProcessAvatar(avatar);
            var merge = instance.GetComponent<ModularAvatarMergeAnimator>();
            Assert.That(merge, Is.Not.Null);
            var animator = avatar.GetComponent<Animator>(); animator.runtimeAnimatorController = merge.animator; animator.Rebind();
            foreach (var receiver in instance.GetComponentsInChildren<VRCContactReceiver>())
            {
                Assert.That(animator.parameters.Any(parameter => parameter.name == receiver.parameter && parameter.type == AnimatorControllerParameterType.Float), Is.True);
                animator.SetFloat(receiver.parameter, .35f);
                Assert.That(animator.GetFloat(receiver.parameter), Is.EqualTo(.35f));
            }
        }

        [Test]
        public void PlugCreatesThreePeerVisibleSphericalMarkersWithoutMovingLandmarks()
        {
            var instance = Prefab("SensaPosePlug");
            var input = instance.GetComponent<SensaPosePlug>();
            var landmarks = new[] { input.rootMarker, input.tipMarker, input.sideMarker };
            var positions = landmarks.Select(marker => marker.position).ToArray();
            SensaPoseBuilder.ProcessAvatar(instance);
            var contacts = instance.GetComponentsInChildren<VRCContactSender>();
            Assert.That(contacts, Has.Length.EqualTo(3));
            Assert.That(contacts.SelectMany(contact => contact.collisionTags).Distinct().Count(), Is.EqualTo(3));
            Assert.That(contacts.All(contact => !contact.localOnly && Mathf.Approximately(contact.radius, .001f)), Is.True);
            Assert.That(contacts.All(contact => contact.rootTransform != null), Is.True);
            CollectionAssert.AreEquivalent(landmarks, contacts.Select(contact => contact.rootTransform));
            CollectionAssert.AreEqual(positions, landmarks.Select(marker => marker.position));
            Assert.That(instance.GetComponent<SensaPosePlug>(), Is.Null);
        }

        [TestCase(1, 2, 1)]
        [TestCase(0, 0, 0)]
        [TestCase(-1, -1, -1)]
        public void InvalidScaleFailsBeforeGeneratingContacts(float x, float y, float z)
        {
            var instance = Prefab("SensaPoseSocket");
            instance.transform.localScale = new Vector3(x, y, z);
            Assert.Throws<InvalidOperationException>(() => SensaPoseBuilder.ProcessAvatar(instance));
            Assert.That(instance.GetComponentsInChildren<VRCContactReceiver>(), Is.Empty);
            Assert.That(instance.GetComponent<SensaPoseSocket>(), Is.Not.Null);
        }

        [Test]
        public void EveryInputIsValidatedBeforeAnySocketIsBaked()
        {
            var first = Prefab("SensaPoseSocket");
            var second = Prefab("SensaPoseSocket");
            first.transform.SetParent(avatar.transform, false);
            second.transform.SetParent(avatar.transform, false);
            second.GetComponent<SensaPoseSocket>().instanceName = "Second";
            second.transform.localScale = new Vector3(1, 2, 1);

            Assert.Throws<InvalidOperationException>(() => SensaPoseBuilder.ProcessAvatar(avatar));
            Assert.That(avatar.GetComponentsInChildren<VRCContactReceiver>(), Is.Empty);
            Assert.That(first.GetComponent<SensaPoseSocket>(), Is.Not.Null);
            Assert.That(second.GetComponent<SensaPoseSocket>(), Is.Not.Null);
        }

        [Test]
        public void DuplicateSocketNamesFailBeforeAnyContactIsGenerated()
        {
            Prefab("SensaPoseSocket").transform.SetParent(avatar.transform, false);
            Prefab("SensaPoseSocket").transform.SetParent(avatar.transform, false);
            Assert.Throws<InvalidOperationException>(() => SensaPoseBuilder.ProcessAvatar(avatar));
            Assert.That(avatar.GetComponentsInChildren<VRCContactReceiver>(), Is.Empty);
        }

        [Test]
        public void DisabledAuthoringIsConsumedWithoutAddingContacts()
        {
            var instance = Prefab("SensaPoseSocket");
            instance.GetComponent<SensaPoseSocket>().enabled = false;
            SensaPoseBuilder.ProcessAvatar(instance);
            Assert.That(instance.GetComponent<SensaPoseSocket>(), Is.Null);
            Assert.That(instance.GetComponentsInChildren<VRCContactReceiver>(), Is.Empty);
        }

        [Test]
        public void AncestorScaleAndDegeneratePlugGeometryAreRejected()
        {
            var socket = Prefab("SensaPoseSocket");
            socket.transform.SetParent(avatar.transform, false);
            avatar.transform.localScale = new Vector3(1, 2, 1);
            Assert.Throws<InvalidOperationException>(() => SensaPoseBuilder.ProcessAvatar(avatar));
            Assert.That(avatar.GetComponentsInChildren<VRCContactReceiver>(), Is.Empty);

            var plug = Prefab("SensaPosePlug");
            var input = plug.GetComponent<SensaPosePlug>();
            input.sideMarker.position = Vector3.Lerp(input.rootMarker.position, input.tipMarker.position, .5f);
            Assert.Throws<InvalidOperationException>(() => SensaPoseBuilder.ProcessAvatar(plug));
            Assert.That(plug.GetComponentsInChildren<VRCContactSender>(), Is.Empty);
        }
    }
}
#endif
