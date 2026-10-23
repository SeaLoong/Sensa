#if UNITY_INCLUDE_TESTS
using System;
using System.Linq;
using System.Reflection;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;
using UnityEngine.Animations;
using VRC.Dynamics;
using VRC.SDK3.Avatars.Components;
using VRC.SDK3.Dynamics.Contact.Components;
using VRC.SDKBase;
using nadena.dev.modular_avatar.core;

namespace UnityBox.Sensa.Tests
{
    public class ContactRootBuildContracts : AvatarBuildFixture
    {
        private class OldReceiver { }
        private class WrongReceiver { public int advancedProximityParameters; }
        private class AdvancedReceiver { public bool advancedProximityParameters; }
        private class InheritedReceiver : AdvancedReceiver { }

        private void RequireBeta()
        {
            if (!SensaContactRootBuilder.IsSupported)
                Assert.Ignore("Positive native Contact build contracts require an SDK with advanced proximity parameters.");
        }
        private VRCContactSender Target()
        {
            var target = Child("Explicit native root", new Vector3(.1f, 1, .2f)).AddComponent<VRCContactSender>();
            target.position = new Vector3(.02f, .03f, .04f); target.rotation = Quaternion.Euler(10, 20, 30);
            target.radius = .12f; target.collisionTags = new System.Collections.Generic.List<string> { "OriginalSpsTag" };
            return target;
        }
        private GameObject Build(Component target) => SensaContactRootBuilder.Build(avatar, "Root", target, "ContactBuildContract");
        private AnimatorController Controller(GameObject host) => (AnimatorController)host.GetComponent<ModularAvatarMergeAnimator>().animator;

        [Test] public void BetaFeatureDetectionAcceptsOnlyBooleanFieldAndFindsInheritedSdkFeature()
        {
            Assert.IsNull(SensaContactRootBuilder.AdvancedProximityField(typeof(OldReceiver)));
            Assert.IsNull(SensaContactRootBuilder.AdvancedProximityField(typeof(WrongReceiver)));
            Assert.NotNull(SensaContactRootBuilder.AdvancedProximityField(typeof(InheritedReceiver)));
            using (new MemoryEditorLocale())
            {
                var error = Assert.Throws<InvalidOperationException>(() => SensaContactRootBuilder.RequireSupport(typeof(OldReceiver)));
                StringAssert.Contains("3.10.6-beta.2", error.Message);
                StringAssert.Contains("SPS four-anchor tracking", error.Message);
            }
            Assert.AreEqual(typeof(VRCContactReceiver).GetField("advancedProximityParameters")?.FieldType == typeof(bool),
                SensaContactRootBuilder.IsSupported);
        }

        [Test] public void StableSdkRejectsSelectedContactMethodBeforeGeneratingAnything()
        {
            if (SensaContactRootBuilder.IsSupported) Assert.Ignore("This assertion covers an installed SDK without the beta field.");
            var probe = avatar.AddComponent<SensaContactRootProbe>(); probe.target = Target();
            Assert.Throws<InvalidOperationException>(() => SensaContactRootBuilder.ProcessAvatar(avatar));
            Assert.IsNull(avatar.transform.Find("SensaContactRoot_Root"));
            Assert.NotNull(probe);
        }

        [Test] public void NativeReportNamesMatchActualSdkSuffixConstants()
        {
            RequireBeta();
            string[] sdkFields = { "PARAM_SENDER_TYPE", "PARAM_SENDER_LOCAL_POSITION_X", "PARAM_SENDER_LOCAL_POSITION_Y",
                "PARAM_SENDER_LOCAL_POSITION_Z", "PARAM_SENDER_VELOCITY_X", "PARAM_SENDER_VELOCITY_Y", "PARAM_SENDER_VELOCITY_Z",
                "PARAM_SENDER_VELOCITY_MAGNITUDE", "PARAM_PROXIMITY_SPEED" };
            var actual = sdkFields.Select(name => typeof(ContactReceiver).GetField(name, BindingFlags.Public | BindingFlags.Static)
                ?.GetRawConstantValue()).ToArray();
            Assert.IsTrue(actual.All(value => value is string), "The installed SDK must expose the verified native parameter suffixes.");
            CollectionAssert.AreEqual(SensaContactProtocol.ReportLeaves.Skip(1), actual.Select(suffix => "Proximity" + suffix));
            Assert.AreEqual(10, SensaContactProtocol.ReportLeaves.Length);
            Assert.AreEqual(12, SensaContactProtocol.PublicLeaves.Distinct().Count());
        }

        [Test] public void DedicatedPairUsesAvatarRootAxesAndOriginalNativeRootOffsetWithoutChangingSps()
        {
            RequireBeta();
            avatar.transform.SetPositionAndRotation(new Vector3(3, 4, 5), Quaternion.Euler(0, 67, 0));
            var target = Target(); var original = JsonUtility.ToJson(target);
            var host = Build(target);
            Assert.AreEqual(original, JsonUtility.ToJson(target));
            Assert.AreEqual(avatar.transform, host.transform.parent);
            Assert.AreEqual(Vector3.zero, host.transform.localPosition);
            Assert.AreEqual(Quaternion.identity, host.transform.localRotation);
            var receiver = host.GetComponentInChildren<VRCContactReceiver>(true);
            Assert.AreEqual(avatar.transform, receiver.rootTransform);
            Assert.AreEqual(Vector3.zero, receiver.position); Assert.AreEqual(Quaternion.identity, receiver.rotation);
            Assert.AreEqual(Vector3.zero, avatar.transform.InverseTransformPoint(receiver.transform.position));
            Assert.Less(Quaternion.Angle(avatar.transform.rotation, receiver.transform.rotation), .0001f);
            Assert.AreEqual(2f, receiver.radius); Assert.AreEqual(ContactBase.ShapeType.Sphere, receiver.shapeType);
            Assert.IsTrue(receiver.allowSelf && !receiver.allowOthers && receiver.localOnly);
            Assert.IsTrue((bool)SensaContactRootBuilder.AdvancedProximityField(receiver.GetType()).GetValue(receiver));
            var sender = host.GetComponentInChildren<VRCContactSender>(true);
            Assert.AreEqual(.001f, sender.radius); Assert.IsTrue(sender.localOnly);
            CollectionAssert.AreEqual(sender.collisionTags, receiver.collisionTags);
            var source = sender.GetComponent<ParentConstraint>().GetSource(0).sourceTransform;
            Assert.AreEqual(target.transform, source.parent); Assert.AreEqual(target.position, source.localPosition);
            Assert.That(Quaternion.Angle(target.rotation, source.localRotation), Is.LessThan(.001f));
            Assert.AreEqual(Vector3.one, sender.transform.localScale);
            Assert.IsFalse(receiver.gameObject.activeSelf);
        }

        [Test] public void AnimatorExportsExactlyTwelveNativeAndControlFieldsWithIntSenderType()
        {
            RequireBeta();
            var host = Build(Target()); var controller = Controller(host);
            var declarations = host.GetComponent<ModularAvatarParameters>().parameters;
            CollectionAssert.AreEquivalent(SensaContactProtocol.PublicLeaves.Select(leaf => "Sensa/Contact/Root/" + leaf),
                declarations.Select(parameter => parameter.nameOrPrefix));
            Assert.IsTrue(declarations.All(parameter => parameter.localOnly && !parameter.saved && parameter.defaultValue == 0));
            foreach (var parameter in declarations)
            {
                var expected = parameter.nameOrPrefix.EndsWith("/Proximity_SenderType", StringComparison.Ordinal)
                    ? ParameterSyncType.Int : ParameterSyncType.Float;
                Assert.AreEqual(expected, parameter.syncType);
                Assert.AreEqual(expected == ParameterSyncType.Int ? AnimatorControllerParameterType.Int : AnimatorControllerParameterType.Float,
                    controller.parameters.Single(value => value.name == parameter.nameOrPrefix).type);
            }
            Assert.AreEqual("Sensa/Contact/Root/Proximity", host.GetComponentInChildren<VRCContactReceiver>(true).parameter);
            var animator = avatar.GetComponent<Animator>(); animator.runtimeAnimatorController = controller; animator.Rebind();
            foreach (var parameter in declarations.Where(parameter => parameter.syncType == ParameterSyncType.Float))
            { animator.SetFloat(parameter.nameOrPrefix, -.25f); Assert.AreEqual(-.25f, animator.GetFloat(parameter.nameOrPrefix)); }
            animator.SetInteger("Sensa/Contact/Root/Proximity_SenderType", 1);
            Assert.AreEqual(1, animator.GetInteger("Sensa/Contact/Root/Proximity_SenderType"));
        }

        [Test] public void SamplingClockWritesOnlyRadiusThenSampleAndOffResetsEveryPublicField()
        {
            RequireBeta(); avatar.transform.localScale = Vector3.one * 1.2f;
            var host = Build(Target()); var machine = Controller(host).layers[0].stateMachine;
            var samples = machine.states.Select(entry => entry.state).Where(state => state != machine.defaultState).ToArray();
            Assert.AreEqual(32, samples.Length);
            for (int i = 0; i < samples.Length; i++)
            {
                var driver = samples[i].behaviours.OfType<VRCAvatarParameterDriver>().Single(); Assert.IsTrue(driver.localOnly);
                var writes = driver.parameters; Assert.AreEqual(2, writes.Count);
                var radius = writes[0];
                Assert.AreEqual("Sensa/Contact/Root/Radius", radius.name); Assert.AreEqual("ScaleFactor", radius.source);
                Assert.AreEqual(VRC_AvatarParameterDriver.ChangeType.Copy, radius.type); Assert.IsTrue(radius.convertRange);
                Assert.AreEqual(0, radius.sourceMin); Assert.AreEqual(0, radius.destMin); Assert.AreEqual(3, radius.destMax);
                Assert.AreEqual(2 * 1.2f, radius.destMax / radius.sourceMax, .00001f);
                Assert.AreEqual("Sensa/Contact/Root/Sample", writes.Last().name); Assert.AreEqual((i + 1) / 32f, writes.Last().value);
                Assert.IsTrue(SensaContactProtocol.IsSampleActive(writes.Last().value));
                var transition = samples[i].transitions.Single();
                Assert.IsTrue(transition.hasExitTime); Assert.AreEqual(1, transition.exitTime);
                Assert.IsEmpty(transition.conditions); Assert.AreEqual(samples[(i + 1) % samples.Length], transition.destinationState);
                Assert.AreEqual(SensaContactProtocol.SamplePeriodSeconds, ((AnimationClip)samples[i].motion).length, .00001f);
            }
            Assert.Greater(SensaContactProtocol.SampleSteps * SensaContactProtocol.SamplePeriodSeconds * 1000,
                SensaContactProtocol.MaximumSampleAgeMs);
            var reset = machine.defaultState.behaviours.OfType<VRCAvatarParameterDriver>().Single().parameters;
            CollectionAssert.IsSubsetOf(SensaContactProtocol.PublicLeaves.Select(leaf => "Sensa/Contact/Root/" + leaf), reset.Select(write => write.name));
            Assert.IsTrue(reset.All(write => write.value == 0 && write.type == VRC_AvatarParameterDriver.ChangeType.Set));
            Assert.AreEqual("Sensa/Contact/Root/Sample", reset.Last().name);
            var entryConditions = machine.defaultState.transitions.Single().conditions;
            Assert.IsTrue(entryConditions.Any(condition => condition.parameter == "IsLocal" && condition.mode == AnimatorConditionMode.If));
            Assert.IsTrue(entryConditions.Any(condition => condition.parameter == "ScaleFactor" && condition.mode == AnimatorConditionMode.Less
                && condition.threshold == SensaContactProtocol.MaximumScaleFactor(1.2f)));
            ((AnimationClip)samples[0].motion).SampleAnimation(avatar, 0); Assert.IsTrue(host.transform.Find("Contacts").gameObject.activeSelf);
            ((AnimationClip)machine.defaultState.motion).SampleAnimation(avatar, 0); Assert.IsFalse(host.transform.Find("Contacts").gameObject.activeSelf);
        }

        [Test] public void SdkCollisionTagBoolIsWritableInFxOnlyAndResetWhenInactive()
        {
            RequireBeta(); var host = Build(Target()); var controller = Controller(host);
            var receiver = host.GetComponentInChildren<VRCContactReceiver>(true);
            var sdkSuffix = typeof(ContactReceiver).GetField("PARAM_COLLISION_TAG_PREFIX", BindingFlags.Public | BindingFlags.Static)
                ?.GetRawConstantValue() as string;
            Assert.AreEqual("_CollisionTag_", sdkSuffix, "Match the SDK's actual advanced collision-tag binding.");
            var tag = receiver.collisionTags.Single();
            Assert.AreEqual(SensaContactRootBuilder.TagPrefix + "ContactBuildContract", tag);
            string parameter = receiver.parameter + sdkSuffix + tag;
            var declared = controller.parameters.Single(value => value.name == parameter);
            Assert.AreEqual(AnimatorControllerParameterType.Bool, declared.type); Assert.IsFalse(declared.defaultBool);
            var publicParameters = host.GetComponent<ModularAvatarParameters>().parameters;
            Assert.AreEqual(12, publicParameters.Count);
            Assert.IsFalse(publicParameters.Any(value => value.nameOrPrefix == parameter));
            var machine = controller.layers[0].stateMachine;
            var reset = machine.defaultState.behaviours.OfType<VRCAvatarParameterDriver>().Single().parameters;
            Assert.AreEqual(13, reset.Count);
            var tagReset = reset.Single(value => value.name == parameter);
            Assert.AreEqual(VRC_AvatarParameterDriver.ChangeType.Set, tagReset.type); Assert.AreEqual(0, tagReset.value);
            Assert.IsTrue(machine.states.Where(value => value.state != machine.defaultState).All(value =>
                value.state.behaviours.OfType<VRCAvatarParameterDriver>().Single().parameters.All(write => write.name != parameter)));
            var animator = avatar.GetComponent<Animator>(); animator.runtimeAnimatorController = controller; animator.Rebind();
            animator.SetBool(parameter, true); Assert.IsTrue(animator.GetBool(parameter));
        }

        [Test] public void PublicPrefabRequiresExplicitTargetAndNdmfRemovesAuthor()
        {
            RequireBeta(); var instance = Prefab("SensaContactRootProbe"); instance.transform.SetParent(avatar.transform, false);
            var probe = instance.GetComponent<SensaContactRootProbe>(); Assert.NotNull(probe); Assert.IsNull(probe.target);
            Assert.AreEqual("Root", probe.instanceName);
            Assert.Throws<InvalidOperationException>(() => SensaContactRootBuilder.ProcessAvatar(avatar));
            Assert.IsEmpty(avatar.GetComponentsInChildren<VRCContactReceiver>(true));
            probe.target = Target(); nadena.dev.ndmf.AvatarProcessor.ProcessAvatar(avatar);
            Assert.IsNull(instance.GetComponent<SensaContactRootProbe>());
            var exported = avatar.GetComponent<VRCAvatarDescriptor>().expressionParameters.parameters
                .Where(parameter => parameter.name.StartsWith("Sensa/Contact/", StringComparison.Ordinal)).ToArray();
            CollectionAssert.AreEquivalent(SensaContactProtocol.PublicLeaves.Select(leaf => "Sensa/Contact/Root/" + leaf),
                exported.Select(parameter => parameter.name));
            Assert.IsTrue(exported.All(parameter => !parameter.networkSynced));
        }

        [Test] public void InvalidRootScaleDuplicateChannelAndForeignTargetFailBeforeContactGeneration()
        {
            RequireBeta(); var target = Target(); avatar.transform.localScale = Vector3.one * 1.6f;
            Assert.Throws<InvalidOperationException>(() => Build(target));
            Assert.IsNull(avatar.transform.Find("SensaContactRoot_Root"));
            avatar.transform.localScale = new Vector3(1, 2, 1);
            Assert.Throws<InvalidOperationException>(() => Build(target));
            avatar.transform.localScale = Vector3.one;
            var foreign = Own(new GameObject("Foreign")).AddComponent<VRCContactSender>();
            Assert.Throws<InvalidOperationException>(() => Build(foreign));
            Build(target);
            Assert.Throws<InvalidOperationException>(() => SensaContactRootBuilder.Build(avatar, "Other", target, "ContactBuildContract"));
        }

        [Test] public void ScaleAndOwnershipExitGuardsStopContactsWithoutContradictingSafeEntry()
        {
            RequireBeta(); var host = Build(Target()); var machine = Controller(host).layers[0].stateMachine;
            var entry = machine.defaultState.transitions.Single();
            var scaleExits = machine.anyStateTransitions.Where(transition => transition.conditions.All(condition => condition.parameter == "ScaleFactor")).ToArray();
            bool Matches(AnimatorCondition condition, float scale) => condition.mode == AnimatorConditionMode.Greater
                ? scale > condition.threshold : condition.mode == AnimatorConditionMode.Less && scale < condition.threshold;
            bool Enters(float scale) => entry.conditions.Where(condition => condition.parameter == "ScaleFactor").All(condition => Matches(condition, scale));
            bool Exits(float scale) => scaleExits.Any(transition => transition.conditions.All(condition => Matches(condition, scale)));
            float maximum = SensaContactProtocol.MaximumScaleFactor(1);
            foreach (float scale in new[] { 0f, .0000005f, .000001f, .5f, 1f, maximum, maximum + .000001f })
                Assert.IsFalse(Enters(scale) && Exits(scale), "Entry/exit guards must not contradict each other: " + scale);
            Assert.IsTrue(Exits(0)); Assert.IsTrue(Exits(maximum + .000001f));
            Assert.IsTrue(Enters(1)); Assert.IsFalse(Exits(1));
            Assert.IsFalse(Enters(maximum)); Assert.IsFalse(Exits(maximum));
            Assert.IsTrue(machine.anyStateTransitions.Any(transition => transition.conditions.Any(condition =>
                condition.parameter == "IsLocal" && condition.mode == AnimatorConditionMode.IfNot)));
            Assert.IsTrue(machine.anyStateTransitions.All(transition => transition.destinationState == machine.defaultState
                && !transition.canTransitionToSelf && !transition.hasExitTime && transition.duration == 0));
        }

        [Test] public void AnimatedOrConstrainedRootScaleIsRejectedForSdkMeterTracking()
        {
            RequireBeta(); var target = Target();
            var clip = new AnimationClip(); clip.SetCurve("", typeof(Transform), "m_LocalScale.x", AnimationCurve.Linear(0, 1, 1, 2));
            var controller = new AnimatorController(); var machine = new AnimatorStateMachine();
            controller.AddLayer(new AnimatorControllerLayer { name = "Animated root scale", stateMachine = machine, defaultWeight = 1 });
            machine.AddState("Scaled").motion = clip;
            avatar.GetComponent<Animator>().runtimeAnimatorController = controller;
            Assert.Throws<InvalidOperationException>(() => Build(target));
            avatar.GetComponent<Animator>().runtimeAnimatorController = null;
            avatar.AddComponent<ScaleConstraint>();
            Assert.Throws<InvalidOperationException>(() => Build(target));
            Assert.IsNull(avatar.transform.Find("SensaContactRoot_Root"));
        }
        [Test] public void NativeScaleConstraintRedirectedToAvatarRootIsRejectedForSdkMeterTracking()
        {
            RequireBeta();
            var type = AppDomain.CurrentDomain.GetAssemblies().Select(assembly => assembly.GetType(
                "VRC.SDK3.Dynamics.Constraint.Components.VRCScaleConstraint")).FirstOrDefault(candidate => candidate != null);
            Assert.NotNull(type);
            var constraint = (VRCConstraintBase)Child("Root scale driver", Vector3.zero).AddComponent(type);
            constraint.TargetTransform = avatar.transform;
            Assert.Throws<InvalidOperationException>(() => Build(Target()));
            Assert.IsEmpty(avatar.GetComponentsInChildren<VRCContactReceiver>(true));
            Assert.IsNull(avatar.transform.Find("SensaContactRoot_Root"));
        }

        [TestCase(-1)]
        [TestCase(2)]
        public void UnknownRootMethodsFailBeforeGeneratingContacts(int value)
        {
            var setup = avatar.AddComponent<SensaAutoSetup>(); setup.rootTrackingMethod = (SensaRootTrackingMethod)value;
            Assert.Throws<InvalidOperationException>(() => SensaAutoBuilder.ProcessAvatar(avatar));
            Assert.IsEmpty(avatar.GetComponentsInChildren<VRCContactReceiver>(true));
            Assert.IsNull(avatar.transform.Find("SensaAuto_Auto"));
        }

        [Test] public void AutoContactMethodCostsOnePairAndSelectionResetsNativeAndControlFields()
        {
            RequireBeta(); Socket("A", Vector3.zero); Socket("B", Vector3.right * .1f);
            var setup = avatar.AddComponent<SensaAutoSetup>();
            Assert.AreEqual(SensaRootTrackingMethod.FourAnchor, setup.rootTrackingMethod);
            setup.rootTrackingMethod = SensaRootTrackingMethod.ContactDirect;
            Assert.AreEqual(4, SensaAutoBuilder.ContactCost(setup, SensaAutoBuilder.Targets(setup, avatar)));
            SensaAutoBuilder.ProcessAvatar(avatar);
            Assert.AreEqual(2, avatar.GetComponentsInChildren<VRCContactReceiver>(true).Length);
            Assert.AreEqual(2, avatar.GetComponentsInChildren<VRCContactSender>(true).Length);
            Assert.IsEmpty(avatar.GetComponentsInChildren<VRCContactReceiver>());
            var selection = avatar.GetComponentsInChildren<ModularAvatarMergeAnimator>(true)
                .Select(merge => merge.animator).OfType<AnimatorController>().Single(controller => controller.name.StartsWith("Sensa selection", StringComparison.Ordinal));
            var resets = selection.layers[0].stateMachine.defaultState.behaviours.OfType<VRCAvatarParameterDriver>().Single().parameters;
            Assert.AreEqual(24, resets.Count(write => write.name.StartsWith("Sensa/Contact/", StringComparison.Ordinal)));
            Assert.IsTrue(resets.All(write => write.value == 0));
            foreach (var sampler in avatar.GetComponentsInChildren<ModularAvatarMergeAnimator>(true)
                .Select(merge => merge.animator).OfType<AnimatorController>().Where(controller => controller.name.StartsWith("Sensa Contact", StringComparison.Ordinal)))
                Assert.IsTrue(sampler.layers[0].stateMachine.defaultState.transitions.Single().conditions.Any(condition => condition.parameter == "Sensa/Select/Auto"));
        }

        [Test] public void PublicMenuCreatesExplicitContactAuthorAndDisabledAuthorIsRemovedOnStableSdk()
        {
            var previous = Selection.activeGameObject;
            try
            {
                Selection.activeGameObject = avatar; SensaPoseMenus.ContactRoot();
                var instance = Own(Selection.activeGameObject); var probe = instance.GetComponent<SensaContactRootProbe>();
                Assert.NotNull(probe); Assert.IsNull(probe.target); Assert.AreEqual("Root", probe.instanceName); probe.enabled = false;
                SensaContactRootBuilder.ProcessAvatar(avatar); Assert.IsNull(instance.GetComponent<SensaContactRootProbe>());
                Assert.IsEmpty(avatar.GetComponentsInChildren<VRCContactReceiver>(true));
            }
            finally { Selection.activeGameObject = previous; }
        }
    }
}
#endif
