#if UNITY_INCLUDE_TESTS
using System;
using System.Linq;
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
    public class FixedRootBuildContracts : AvatarBuildFixture
    {
        private VRCContactSender Target()
        {
            var target = Child("Selected root", new Vector3(.1f, 1, .2f)).AddComponent<VRCContactSender>();
            target.position = new Vector3(.02f, .03f, .04f); target.radius = .12f;
            return target;
        }
        private GameObject Build(VRCContactSender target) =>
            SensaFixedRootBuilder.Build(avatar, "Root", target, "UniqueChannel");
        private AnimatorController Controller(GameObject host) =>
            (AnimatorController)host.GetComponent<ModularAvatarMergeAnimator>().animator;
        [Test] public void FixedAnchorsAndOwnTinySphereUseAvatarRootFrameRatherThanSocketOrOriginalRadius()
        {
            var target = Target(); var original = target.transform.localPosition;
            target.transform.localScale = Vector3.one * 2;
            var host = Build(target);
            Assert.AreEqual(avatar.transform, host.transform.parent);
            Assert.AreEqual(Vector3.zero, host.transform.localPosition);
            Assert.AreEqual(Vector3.one, host.transform.localScale);
            var receivers = host.GetComponentsInChildren<VRCContactReceiver>(true);
            Assert.AreEqual(4, receivers.Length);
            for (int i = 0; i < 4; i++)
            {
                Assert.AreEqual(new Vector3(SensaFixedAnchorProtocol.AnchorX(i), SensaFixedAnchorProtocol.AnchorY(i), SensaFixedAnchorProtocol.AnchorZ(i)),
                    avatar.transform.InverseTransformPoint(receivers[i].transform.position));
                Assert.AreEqual(2f, receivers[i].radius);
                Assert.IsTrue(receivers[i].allowSelf && !receivers[i].allowOthers && receivers[i].localOnly);
            }
            var sender = host.GetComponentInChildren<VRCContactSender>(true);
            Assert.AreEqual(.001f, sender.radius); Assert.IsTrue(sender.localOnly);
            CollectionAssert.AreEqual(sender.collisionTags, receivers[0].collisionTags);
            Assert.AreEqual(.12f, target.radius); Assert.AreEqual(original, target.transform.localPosition);
            var follow = sender.GetComponent<ParentConstraint>(); Assert.AreEqual(1, follow.sourceCount);
            var source = follow.GetSource(0).sourceTransform;
            Assert.AreEqual(target.transform, source.parent); Assert.AreEqual(target.position, source.localPosition);
            Assert.AreEqual(Vector3.one, sender.transform.localScale);
            Assert.IsFalse(receivers[0].gameObject.activeInHierarchy);
        }
        [Test] public void FxCopiesFourPrivateRangesThenPublishesOneValidSampleCounter()
        {
            var host = Build(Target()); var controller = Controller(host); var machine = controller.layers[0].stateMachine;
            CollectionAssert.AreEquivalent(new[] { "Sensa/SPS/Root/P0", "Sensa/SPS/Root/P1", "Sensa/SPS/Root/P2",
                "Sensa/SPS/Root/P3", "Sensa/SPS/Root/Sample" }, host.GetComponent<ModularAvatarParameters>().parameters.Select(p => p.nameOrPrefix));
            var receivers = host.GetComponentsInChildren<VRCContactReceiver>(true);
            for (int i = 0; i < 4; i++)
            {
                Assert.AreEqual("Sensa/Internal/SPS/Root/RawP" + i, receivers[i].parameter);
                Assert.IsTrue(controller.parameters.Any(p => p.name == receivers[i].parameter && p.type == AnimatorControllerParameterType.Float));
            }
            var sample = machine.states.Single(s => s.state.name == "Sample 0").state;
            var writes = sample.behaviours.OfType<VRCAvatarParameterDriver>().Single().parameters;
            Assert.AreEqual(5, writes.Count);
            for (int i = 0; i < 4; i++)
            {
                Assert.AreEqual("Sensa/SPS/Root/P" + i, writes[i].name);
                Assert.AreEqual(receivers[i].parameter, writes[i].source);
                Assert.AreEqual(VRC_AvatarParameterDriver.ChangeType.Copy, writes[i].type);
            }
            Assert.AreEqual("Sensa/SPS/Root/Sample", writes.Last().name); Assert.AreEqual(1f / 32, writes.Last().value);
            var counts = machine.states.Where(s => s.state.name.StartsWith("Sample ", StringComparison.Ordinal))
                .Select(s => s.state.behaviours.OfType<VRCAvatarParameterDriver>().Single().parameters.Last().value).ToArray();
            CollectionAssert.AreEqual(Enumerable.Range(1, 32).Select(i => i / 32f), counts);
            Assert.IsTrue(counts.All(SensaFixedAnchorProtocol.IsSampleActive));
            foreach (float invalid in new[] { 0f, -.1f, .1f, 1.01f, float.NaN, float.PositiveInfinity })
                Assert.IsFalse(SensaFixedAnchorProtocol.IsSampleActive(invalid), invalid.ToString());
            Assert.Greater(SensaFixedAnchorProtocol.SampleSteps * SensaFixedAnchorProtocol.SamplePeriodSeconds * 1000,
                SensaFixedAnchorProtocol.MaximumSampleAgeMs);
            var allowed = machine.defaultState.transitions.Single().conditions;
            Assert.IsTrue(allowed.Any(c => c.parameter == "IsLocal" && c.mode == AnimatorConditionMode.If));
            Assert.IsTrue(allowed.Any(c => c.parameter == "ScaleFactor" && c.mode == AnimatorConditionMode.Less && c.threshold > 1.49f && c.threshold < 1.5f));
            var invalidScale = machine.anyStateTransitions.Single(t => t.conditions.Any(c => c.parameter == "ScaleFactor" && c.mode == AnimatorConditionMode.Greater));
            Assert.AreEqual(machine.defaultState, invalidScale.destinationState);
            var contacts = host.transform.Find("Contacts").gameObject;
            ((AnimationClip)sample.motion).SampleAnimation(avatar, 0); Assert.IsTrue(contacts.activeSelf);
            ((AnimationClip)machine.defaultState.motion).SampleAnimation(avatar, 0); Assert.IsFalse(contacts.activeSelf);
            Assert.AreEqual(0, machine.defaultState.behaviours.OfType<VRCAvatarParameterDriver>().Single().parameters.Last().value);
        }
        [Test] public void ScaleGuardEntryAndExitConditionsNeverOverlapAtFormerBoundaryBands()
        {
            var machine = Controller(Build(Target())).layers[0].stateMachine;
            var entry = machine.defaultState.transitions.Single();
            var exits = machine.anyStateTransitions.Where(t => t.conditions.All(c => c.parameter == "ScaleFactor")).ToArray();
            bool ScaleCondition(AnimatorCondition condition, float scale) => condition.mode == AnimatorConditionMode.Greater
                ? scale > condition.threshold : condition.mode == AnimatorConditionMode.Less && scale < condition.threshold;
            bool Enters(float scale) => entry.conditions.Where(c => c.parameter == "ScaleFactor").All(c => ScaleCondition(c, scale));
            bool Exits(float scale) => exits.Any(t => t.conditions.All(c => ScaleCondition(c, scale)));
            var formerUpperOverlap = 1.1995995044708252f;
            Assert.IsTrue(Enters(formerUpperOverlap), "The still-supported upper-band value should enter. / 上限内合法值应能进入。");
            Assert.IsFalse(Exits(formerUpperOverlap), "A supported value must not exit at the same time. / 合法值不能同时触发退出。");
            Assert.IsFalse(Enters(.0000005f), "Sub-minimum scale must not re-enter. / 低于下限不得反复进入。");
            Assert.IsTrue(Exits(.0000005f));
            float maximum = SensaFixedAnchorProtocol.MaximumScaleFactor(1);
            foreach (float scale in new[] { 0f, .0000005f, .000001f, .5f, 1f, formerUpperOverlap, maximum, maximum + .000001f, 1.3f })
                Assert.IsFalse(Enters(scale) && Exits(scale), "Contradictory scale transitions: " + scale);
            Assert.IsFalse(Enters(.000001f)); Assert.IsFalse(Exits(.000001f));
            Assert.IsFalse(Enters(maximum)); Assert.IsFalse(Exits(maximum));
            // Existing samples must keep committing at exact boundaries; AnyState guards own invalidation.
            // 已激活采样在精确边界仍持续提交，失效由 AnyState 守卫处理。
            foreach (var sample in machine.states.Select(s => s.state).Where(s => s != machine.defaultState))
            {
                var cycle = sample.transitions.Single();
                Assert.IsTrue(cycle.hasExitTime); Assert.AreEqual(1, cycle.exitTime); Assert.AreEqual(0, cycle.duration);
                Assert.IsEmpty(cycle.conditions);
            }
            Assert.IsTrue(Enters(1f)); Assert.IsFalse(Exits(1f));
            Assert.IsFalse(Enters(0)); Assert.IsTrue(Exits(0));
            Assert.IsFalse(Enters(maximum + .000001f)); Assert.IsTrue(Exits(maximum + .000001f));
        }
        [TestCase(2, 1, 1)]
        [TestCase(1.6f, 1.6f, 1.6f)]
        public void InvalidAuthoredScaleFailsBeforeGeneration(float x, float y, float z)
        {
            var target = Target(); avatar.transform.localScale = new Vector3(x,y,z);
            Assert.Throws<InvalidOperationException>(() => Build(target));
            Assert.IsNull(avatar.transform.Find("SensaFixedRoot_Root"));
        }
        [Test] public void AnimatedOrConstrainedAvatarRootScaleIsRejected()
        {
            var target = Target();
            var clip = new AnimationClip(); clip.SetCurve("", typeof(Transform), "m_LocalScale.x", AnimationCurve.Linear(0, 1, 1, 2));
            var controller = new AnimatorController(); var machine = new AnimatorStateMachine();
            controller.AddLayer(new AnimatorControllerLayer { name = "Root scale", stateMachine = machine, defaultWeight = 1 });
            machine.AddState("Scaled").motion = clip;
            avatar.GetComponent<Animator>().runtimeAnimatorController = controller;
            Assert.Throws<InvalidOperationException>(() => Build(target));
            avatar.GetComponent<Animator>().runtimeAnimatorController = null;
            avatar.AddComponent<ScaleConstraint>();
            Assert.Throws<InvalidOperationException>(() => Build(target));
        }
        [TestCase(false)]
        [TestCase(true)]
        public void NativeScaleConstraintTargetingAvatarRootFailsBeforeGeneratingContacts(bool redirected)
        {
            var type = AppDomain.CurrentDomain.GetAssemblies().Select(assembly => assembly.GetType(
                "VRC.SDK3.Dynamics.Constraint.Components.VRCScaleConstraint")).FirstOrDefault(candidate => candidate != null);
            Assert.NotNull(type, "Supported SDKs expose their native Scale Constraint.");
            var owner = redirected ? Child("Scale driver", Vector3.zero) : avatar;
            var constraint = (VRCConstraintBase)owner.AddComponent(type);
            if (redirected) constraint.TargetTransform = avatar.transform;
            Assert.Throws<InvalidOperationException>(() => Build(Target()));
            Assert.IsEmpty(avatar.GetComponentsInChildren<VRCContactReceiver>(true));
            Assert.IsNull(avatar.transform.Find("SensaFixedRoot_Root"));
        }
        [Test] public void NativeScaleConstraintForAChildDoesNotRejectRootTracking()
        {
            var type = AppDomain.CurrentDomain.GetAssemblies().Select(assembly => assembly.GetType(
                "VRC.SDK3.Dynamics.Constraint.Components.VRCScaleConstraint")).FirstOrDefault(candidate => candidate != null);
            Assert.NotNull(type);
            Child("Scaled child", Vector3.zero).AddComponent(type);
            Assert.DoesNotThrow(() => Build(Target()));
        }
        private AnimatorController RootScaleController()
        {
            var clip = new AnimationClip(); clip.SetCurve("", typeof(Transform), "m_LocalScale.x", AnimationCurve.Linear(0, 1, 1, 2));
            var controller = new AnimatorController(); var machine = new AnimatorStateMachine();
            controller.AddLayer(new AnimatorControllerLayer { name = "Relative root scale", stateMachine = machine, defaultWeight = 1 });
            machine.AddState("Scaled").motion = clip; return controller;
        }
        [Test] public void RelativeMergeAnimatorExplicitlyTargetingAvatarRootRejectsRootScaleAnimation()
        {
            var merge = Child("Nested merge", Vector3.zero).AddComponent<ModularAvatarMergeAnimator>();
            merge.animator = RootScaleController(); merge.pathMode = MergeAnimatorPathMode.Relative;
            merge.relativePathRoot.Set(avatar);
            Assert.Throws<InvalidOperationException>(() => Build(Target()));
            Assert.IsEmpty(avatar.GetComponentsInChildren<VRCContactReceiver>(true));
        }
        [Test] public void RelativeMergeAnimatorOnAvatarRootCanAnimateAChildScale()
        {
            var merge = avatar.AddComponent<ModularAvatarMergeAnimator>();
            merge.animator = RootScaleController(); merge.pathMode = MergeAnimatorPathMode.Relative;
            merge.relativePathRoot.Set(Child("Animation root", Vector3.zero));
            Assert.DoesNotThrow(() => Build(Target()));
        }
        [Test] public void DuplicateSenderIdentityAndForeignTargetFailClosed()
        {
            var target = Target(); Build(target);
            Assert.Throws<InvalidOperationException>(() => SensaFixedRootBuilder.Build(avatar, "Other", target, "UniqueChannel"));
            var foreign = Own(new GameObject("Foreign")).AddComponent<VRCContactSender>();
            Assert.Throws<InvalidOperationException>(() => SensaFixedRootBuilder.Build(avatar, "Other", foreign, "OtherChannel"));
        }
        [Test] public void SensaOwnedSocketAndPlugUseExplicitRootTransforms()
        {
            var component = Child("Owned SPS", Vector3.zero).AddComponent<SensaComponent>();
            component.depthAxis = Child("Socket root", Vector3.up).transform;
            component.rootBone = Child("Plug root", Vector3.forward).transform;
            Assert.AreSame(component.depthAxis, SensaSpsAdapter.ReadRoot(component).root);
            component.role = BridgeRole.Plug;
            Assert.AreSame(component.rootBone, SensaSpsAdapter.ReadRoot(component).root);
        }
        [Test] public void PublicRootPrefabRequiresExplicitTargetAndPublishesExactlyFiveSpsFields()
        {
            var instance = Prefab("SensaSpsRootProbe"); instance.transform.SetParent(avatar.transform, false);
            Assert.IsNull(instance.GetComponent<SensaPoseSocket>());
            var probe = instance.GetComponent<SensaFixedRootProbe>(); Assert.NotNull(probe); Assert.IsNull(probe.target);
            Assert.Throws<InvalidOperationException>(() => SensaFixedRootBuilder.ProcessAvatar(avatar));
            Assert.IsEmpty(avatar.GetComponentsInChildren<VRCContactReceiver>(true));
            probe.target = Target();
            SensaFixedRootBuilder.ProcessAvatar(avatar);
            Assert.IsNull(instance.GetComponent<SensaFixedRootProbe>());
            var host = avatar.transform.Find("SensaFixedRoot_Root").gameObject;
            Assert.AreEqual(4, host.GetComponentsInChildren<VRCContactReceiver>(true).Length);
            Assert.AreEqual(1, host.GetComponentsInChildren<VRCContactSender>(true).Length);
            var controller = Controller(host);
            CollectionAssert.AreEquivalent(new[] { "Sensa/SPS/Root/P0", "Sensa/SPS/Root/P1", "Sensa/SPS/Root/P2",
                "Sensa/SPS/Root/P3", "Sensa/SPS/Root/Sample" }, host.GetComponent<ModularAvatarParameters>().parameters.Select(p => p.nameOrPrefix));
            var sample = controller.layers[0].stateMachine.states.Single(s => s.state.name == "Sample 0").state;
            Assert.AreEqual(1f / 32, sample.behaviours.OfType<VRCAvatarParameterDriver>().Single().parameters.Last().value);
            var animator = avatar.GetComponent<Animator>(); animator.runtimeAnimatorController = controller; animator.Rebind();
            foreach (var receiver in host.GetComponentsInChildren<VRCContactReceiver>(true))
            {
                animator.SetFloat(receiver.parameter, .4f); Assert.AreEqual(.4f, animator.GetFloat(receiver.parameter));
            }
        }
        [Test] public void PublicRootMenuInstantiatesTheMigratedFixedRootAuthor()
        {
            var previous = Selection.activeGameObject;
            try
            {
                Selection.activeGameObject = avatar;
                Assert.IsTrue(EditorApplication.ExecuteMenuItem("GameObject/Sensa/SPS four-anchor tracking"));
                var created = Own(Selection.activeGameObject);
                Assert.AreEqual(avatar.transform, created.transform.parent);
                Assert.NotNull(created.GetComponent<SensaFixedRootProbe>());
                Assert.IsNull(created.GetComponent<SensaPoseSocket>());
                Assert.IsNull(created.GetComponent<SensaFixedRootProbe>().target);
            }
            finally { Selection.activeGameObject = previous; }
        }
        [Test] public void ProcessorRemovesAuthorAndNdmfMergesActualWritableParameters()
        {
            var target = Target(); var probe = avatar.AddComponent<SensaFixedRootProbe>();
            probe.target = target; probe.instanceName = "Root"; probe.collisionChannel = "BuildContract";
            nadena.dev.ndmf.AvatarProcessor.ProcessAvatar(avatar);
            Assert.IsNull(avatar.GetComponent<SensaFixedRootProbe>());
            var descriptor = avatar.GetComponent<VRCAvatarDescriptor>();
            var exported = descriptor.expressionParameters.parameters.Where(p => p.name.StartsWith("Sensa/SPS/", StringComparison.Ordinal)).ToArray();
            CollectionAssert.AreEquivalent(new[] { "Sensa/SPS/Root/P0", "Sensa/SPS/Root/P1", "Sensa/SPS/Root/P2",
                "Sensa/SPS/Root/P3", "Sensa/SPS/Root/Sample" }, exported.Select(p => p.name));
            Assert.IsTrue(exported.All(p => !p.networkSynced));
            Assert.IsFalse(descriptor.expressionParameters.parameters.Any(p => p.name.Contains("RawP")));
            var fx = (AnimatorController)descriptor.baseAnimationLayers.Single(l => l.type == VRCAvatarDescriptor.AnimLayerType.FX).animatorController;
            foreach (var receiver in avatar.GetComponentsInChildren<VRCContactReceiver>(true).Where(r => r.parameter.Contains("/RawP")))
                Assert.IsTrue(fx.parameters.Any(p => p.name == receiver.parameter && p.type == AnimatorControllerParameterType.Float));
            Assert.IsTrue(descriptor.baseAnimationLayers.Any(l => l.type == VRCAvatarDescriptor.AnimLayerType.FX && l.animatorController != null));
        }
    }
}
#endif
