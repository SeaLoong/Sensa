#if UNITY_INCLUDE_TESTS
using System;
using System.Collections.Generic;
using System.Linq;
using NUnit.Framework;
using UnityEditor.Animations;
using UnityEngine;
using nadena.dev.modular_avatar.core;
using VRC.Dynamics;
using VRC.SDK3.Dynamics.Contact.Components;
using VRC.SDK3.Dynamics.PhysBone.Components;

namespace UnityBox.Sensa.Tests
{
    public sealed class SensaComponentBuildTests : AvatarBuildFixture
    {
        private SensaComponent SocketAuthor(string name = "Socket author")
        {
            var host = Child(name, Vector3.zero);
            var author = host.AddComponent<SensaComponent>();
            author.depthAxis = Child(name + " axis", Vector3.up).transform;
            return author;
        }
        private static Dictionary<string, AnimatorControllerParameterType> Writers(GameObject host) => host
            .GetComponentsInChildren<ModularAvatarMergeAnimator>(true)
            .SelectMany(merge => ((AnimatorController)merge.animator).parameters)
            .ToDictionary(parameter => parameter.name, parameter => parameter.type);
        private static Vector3 Center(ContactBase contact) => contact.rootTransform.TransformPoint(contact.position);

        [Test] public void DisabledAuthorKeepsItsObjectAndCreatesNoRuntimeOutputs()
        {
            var author = SocketAuthor(); var host = author.gameObject;
            author.enabled = false; author.depthAxis = null;
            SensaProcessor.ProcessAvatar(avatar);
            Assert.IsNull(host.GetComponent<SensaComponent>()); Assert.IsNotNull(host);
            Assert.IsEmpty(avatar.GetComponentsInChildren<ContactBase>(true));
            Assert.IsEmpty(avatar.GetComponentsInChildren<ModularAvatarParameters>(true));
            Assert.IsEmpty(avatar.GetComponentsInChildren<ModularAvatarMergeAnimator>(true));
            SensaProcessor.ProcessAvatar(avatar);
            Assert.IsEmpty(avatar.GetComponentsInChildren<ContactBase>(true));
        }

        [TestCase("depthAxis")]
        [TestCase("tipBone")]
        [TestCase("rootBone")]
        [TestCase("physBoneRoot")]
        [TestCase("raycastOrigin")]
        public void AvatarExternalReferencesFailBeforeSourceOrGeneratedObjectsChange(string reference)
        {
            var author = SocketAuthor();
            var external = Own(new GameObject("External source stays untouched"));
            external.transform.position = new Vector3(2, 3, 4);
            if (reference == "depthAxis") author.depthAxis = external.transform;
            else if (reference == "tipBone") author.tipBone = external.transform;
            else if (reference == "rootBone") author.rootBone = external.transform;
            else author.auxSignals.Add(new AuxSignal {
                sourceType = reference == "physBoneRoot" ? AuxSignalSourceType.PhysBone : AuxSignalSourceType.Raycast,
                physBoneRoot = reference == "physBoneRoot" ? external.transform : null,
                raycastOrigin = reference == "raycastOrigin" ? external.transform : null,
            });
            Assert.Throws<InvalidOperationException>(() => SensaProcessor.ProcessAvatar(avatar));
            Assert.AreEqual(new Vector3(2, 3, 4), external.transform.position);
            Assert.AreEqual(0, external.transform.childCount);
            Assert.IsNull(external.GetComponent<VRCPhysBone>());
            Assert.IsEmpty(avatar.GetComponentsInChildren<ContactBase>(true));
            Assert.IsEmpty(avatar.GetComponentsInChildren<ModularAvatarParameters>(true));
            Assert.IsNotNull(author);
        }

        [Test] public void LaterInvalidAuthorIsRejectedBeforeTheFirstAuthorGeneratesAnything()
        {
            var first = SocketAuthor("First"); first.instanceName = "First";
            var last = SocketAuthor("Last"); last.instanceName = "Last"; last.depthAxis = null;
            Assert.Throws<InvalidOperationException>(() => SensaProcessor.ProcessAvatar(avatar));
            Assert.IsNotNull(first); Assert.IsNotNull(last);
            Assert.IsEmpty(avatar.GetComponentsInChildren<ContactBase>(true));
            Assert.IsEmpty(avatar.GetComponentsInChildren<ModularAvatarMergeAnimator>(true));
        }

        [TestCase(1f)]
        [TestCase(2f)] public void SocketReceiversFollowTheChosenAxisAndEveryGeneratedFloatHasAnFxWriter(float axisScale)
        {
            var author = SocketAuthor(); var host = author.gameObject; var axis = author.depthAxis;
            axis.localScale = Vector3.one * axisScale;
            author.socketLength = .2f; author.depthRingCount = 5; author.generateSelfParam = true;
            var expected = author.GetExpectedParameters(false);
            SensaProcessor.ProcessAvatar(avatar);
            var receivers = host.GetComponentsInChildren<VRCContactReceiver>(true);
            CollectionAssert.AreEquivalent(expected, receivers.Select(receiver => receiver.parameter));
            Assert.IsTrue(receivers.All(receiver => receiver.rootTransform == axis));
            var middle = receivers.Single(receiver => receiver.parameter.EndsWith("/TouchZones/Middle", StringComparison.Ordinal));
            Assert.That(Vector3.Distance(middle.position, new Vector3(0, 0, .1f)), Is.LessThan(1e-6));
            var before = Center(middle);
            axis.position += new Vector3(.2f, .3f, .4f); axis.rotation = Quaternion.Euler(0, 90, 0);
            Assert.That(Vector3.Distance(Center(middle), axis.TransformPoint(Vector3.forward * .1f)), Is.LessThan(1e-6));
            Assert.That(Vector3.Distance(Center(middle), before), Is.GreaterThan(.1f));
            var writers = Writers(host);
            CollectionAssert.AreEquivalent(expected, writers.Keys);
            Assert.IsTrue(writers.Values.All(type => type == AnimatorControllerParameterType.Float));
            Assert.IsNull(host.GetComponent<SensaComponent>());
        }

        [Test] public void PlugSendersFollowTheirOwnBonesAndTouchIsAContinuousBool()
        {
            var author = SocketAuthor("Plug author"); var host = author.gameObject;
            author.role = BridgeRole.Plug; author.rootBone = Child("Root bone", Vector3.up).transform;
            author.tipBone = Child("Tip bone", Vector3.up + Vector3.forward * .15f).transform; author.selfPenetration = true;
            var root = author.rootBone; var tip = author.tipBone; var expected = author.GetExpectedParameters(false);
            SensaProcessor.Process(author);
            var senders = host.GetComponentsInChildren<VRCContactSender>(true);
            Assert.AreEqual(root, senders.Single(sender => sender.collisionTags.Contains("TPS_Pen_Root")).rootTransform);
            Assert.AreEqual(tip, senders.Single(sender => sender.collisionTags.Contains("TPS_Pen_Penetrating")).rootTransform);
            var receivers = host.GetComponentsInChildren<VRCContactReceiver>(true);
            CollectionAssert.AreEquivalent(expected, receivers.Select(receiver => receiver.parameter));
            Assert.IsTrue(receivers.All(receiver => receiver.rootTransform == tip && receiver.position == Vector3.zero));
            var writers = Writers(host);
            foreach (var receiver in receivers)
            {
                var touch = receiver.parameter.Contains("/Touch");
                Assert.AreEqual(touch ? ContactReceiver.ReceiverType.Constant : ContactReceiver.ReceiverType.Proximity, receiver.receiverType);
                Assert.AreEqual(touch ? AnimatorControllerParameterType.Bool : AnimatorControllerParameterType.Float, writers[receiver.parameter]);
            }
            tip.position = new Vector3(.3f, 1.2f, .4f); root.position = new Vector3(-.1f, .8f, .1f);
            Assert.IsTrue(receivers.All(receiver => Vector3.Distance(Center(receiver), tip.position) < 1e-6));
            Assert.That(Vector3.Distance(Center(senders.Single(sender => sender.rootTransform == root)), root.position), Is.LessThan(1e-6));
        }

        [Test] public void AuxiliaryContactUsesMatchingTagsAndExistingBoolReferencesKeepTheirType()
        {
            var author = SocketAuthor(); var host = author.gameObject;
            author.auxSignals.Add(new AuxSignal { contactTags = new List<string> { "A", "B", "A" } });
            author.auxSignals.Add(new AuxSignal { sourceType = AuxSignalSourceType.ExistingParameter, existingParameterName = "Existing/IsActive" });
            var existing = avatar.AddComponent<ModularAvatarParameters>();
            existing.parameters = new List<ParameterConfig> { new ParameterConfig { nameOrPrefix = "Existing/IsActive", syncType = ParameterSyncType.Bool } };
            Assert.Contains("Existing/IsActive", author.GetExpectedParameters());
            Assert.IsFalse(author.GetExpectedParameters(false).Contains("Existing/IsActive"));
            SensaProcessor.ProcessAvatar(avatar);
            var contact = host.GetComponentsInChildren<VRCContactReceiver>(true).Single(receiver => receiver.parameter == "Sensa/Main/Aux0/Vibrate");
            CollectionAssert.AreEquivalent(new[] { "A", "B" }, contact.collisionTags);
            Assert.AreEqual(host.transform, contact.rootTransform);
            Assert.AreEqual(AnimatorControllerParameterType.Float, Writers(host)[contact.parameter]);
            Assert.IsFalse(Writers(host).ContainsKey("Existing/IsActive"));
            var declarations = avatar.GetComponentsInChildren<ModularAvatarParameters>(true)
                .SelectMany(config => config.parameters).Where(parameter => parameter.nameOrPrefix == "Existing/IsActive").ToArray();
            Assert.AreEqual(1, declarations.Length); Assert.AreEqual(ParameterSyncType.Bool, declarations[0].syncType);
        }

        [Test] public void InvalidAuxiliaryInputsAreCheckedBeforeAnyPhysBoneOrContactMutation()
        {
            var author = SocketAuthor(); var bone = Child("Existing PB root", Vector3.zero);
            var pb = bone.AddComponent<VRCPhysBone>(); pb.parameter = "AuthoredPrefix";
            author.auxSignals.Add(new AuxSignal { sourceType = AuxSignalSourceType.PhysBone, physBoneRoot = bone.transform });
            Assert.Throws<InvalidOperationException>(() => SensaProcessor.ProcessAvatar(avatar));
            Assert.AreEqual("AuthoredPrefix", pb.parameter); Assert.IsEmpty(avatar.GetComponentsInChildren<ContactBase>(true));
            author.auxSignals.Clear(); author.auxSignals.Add(new AuxSignal { contactTags = new List<string>() });
            Assert.Throws<InvalidOperationException>(() => SensaProcessor.ProcessAvatar(avatar));
            Assert.IsEmpty(avatar.GetComponentsInChildren<ContactBase>(true));
        }

        [Test] public void PhysBoneSelectedBoolAndFloatSuffixesReceiveWritableParameters()
        {
            var author = SocketAuthor(); var host = author.gameObject;
            var grabbed = Child("Grabbed bone", Vector3.zero); var stretched = Child("Stretch bone", Vector3.zero);
            author.auxSignals.Add(new AuxSignal { sourceType = AuxSignalSourceType.PhysBone, physBoneRoot = grabbed.transform, physBoneSignal = PhysBoneSignal.IsGrabbed });
            author.auxSignals.Add(new AuxSignal { sourceType = AuxSignalSourceType.PhysBone, physBoneRoot = stretched.transform, physBoneSignal = PhysBoneSignal.Stretch });
            SensaProcessor.ProcessAvatar(avatar);
            Assert.AreEqual("Sensa/Main/Aux0/Vibrate", grabbed.GetComponent<VRCPhysBone>().parameter);
            Assert.AreEqual("Sensa/Main/Aux1/Vibrate", stretched.GetComponent<VRCPhysBone>().parameter);
            var writers = Writers(host);
            Assert.AreEqual(AnimatorControllerParameterType.Bool, writers["Sensa/Main/Aux0/Vibrate_IsGrabbed"]);
            Assert.AreEqual(AnimatorControllerParameterType.Float, writers["Sensa/Main/Aux1/Vibrate_Stretch"]);
        }

        [TestCase(.003f)]
        [TestCase(.3f)] public void RaycastDeclaresAllThreeNativeReportsAndPreservesTheWorldMetreRange(float range)
        {
            var raycastType = typeof(VRC.SDK3.Avatars.Components.VRCAvatarDescriptor).Assembly
                .GetType("VRC.SDK3.Avatars.Components.VRCRaycast");
            if (raycastType == null) Assert.Ignore("Raycast requires VRChat SDK 3.10.3 or newer.");
            var author = SocketAuthor(); var host = author.gameObject;
            var origin = Child("Ray origin", new Vector3(.1f, .2f, .3f)).transform;
            origin.localScale = Vector3.one * 3;
            author.auxSignals.Add(new AuxSignal {
                sourceType = AuxSignalSourceType.Raycast, role = AuxSignalRole.DepthOverride,
                raycastOrigin = origin, raycastMaxRange = range,
            });
            const string prefix = "Sensa/Main/Aux0/DepthOverride";
            var expectedTypes = new Dictionary<string, AnimatorControllerParameterType> {
                { prefix + "_Hit", AnimatorControllerParameterType.Bool },
                { prefix + "_Ratio", AnimatorControllerParameterType.Float },
                { prefix + "_Distance", AnimatorControllerParameterType.Float },
            };
            CollectionAssert.AreEquivalent(expectedTypes.Keys,
                author.GetExpectedParameters(false).Where(name => name.StartsWith(prefix + "_", StringComparison.Ordinal)));
            SensaProcessor.ProcessAvatar(avatar);
            var raycast = avatar.GetComponentsInChildren(raycastType, true).Single();
            Assert.AreEqual(prefix, raycastType.GetProperty("Parameter").GetValue(raycast));
            Assert.AreSame(origin, raycastType.GetProperty("RootTransform").GetValue(raycast));
            Assert.AreEqual(range, (float)raycastType.GetProperty("Distance").GetValue(raycast));
            Assert.AreEqual(false, raycastType.GetProperty("ApplyTransformScale").GetValue(raycast));
            var writers = Writers(host);
            var declarations = host.GetComponentsInChildren<ModularAvatarParameters>(true)
                .SelectMany(config => config.parameters).ToDictionary(parameter => parameter.nameOrPrefix, parameter => parameter.syncType);
            foreach (var expected in expectedTypes)
            {
                Assert.AreEqual(expected.Value, writers[expected.Key]);
                Assert.AreEqual(expected.Value == AnimatorControllerParameterType.Bool ? ParameterSyncType.Bool : ParameterSyncType.Float,
                    declarations[expected.Key]);
            }
        }

        [Test] public void ConsumedAuthorsMakeARepeatedGenerationPassANoOp()
        {
            var author = SocketAuthor(); var host = author.gameObject;
            SensaProcessor.ProcessAvatar(avatar);
            var contacts = avatar.GetComponentsInChildren<ContactBase>(true).Length;
            var controllers = avatar.GetComponentsInChildren<ModularAvatarMergeAnimator>(true).Length;
            SensaProcessor.ProcessAvatar(avatar);
            Assert.AreEqual(contacts, avatar.GetComponentsInChildren<ContactBase>(true).Length);
            Assert.AreEqual(controllers, avatar.GetComponentsInChildren<ModularAvatarMergeAnimator>(true).Length);
            Assert.IsNotNull(host);
        }
    }
}
#endif
