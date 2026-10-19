using System;
using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;
using UnityEngine.Animations;
using VRC.Dynamics;
using VRC.SDK3.Avatars.Components;
using VRC.SDK3.Dynamics.Contact.Components;
using VRC.SDKBase;
using nadena.dev.modular_avatar.core;

namespace UnityBox.Sensa
{
    public static class SensaFixedRootBuilder
    {
        public const string TagPrefix = "SensaFixedRoot_";
        public static void ProcessAvatar(GameObject avatar)
        {
            var all = avatar.GetComponentsInChildren<SensaFixedRootProbe>(true);
            var probes = all.Where(p => p.enabled).ToArray();
            if (probes.GroupBy(p => p.instanceName).Any(g => g.Count() > 1)
                || probes.GroupBy(p => p.collisionChannel).Any(g => g.Count() > 1))
                throw new InvalidOperationException("Fixed-root names and collision channels must be unique. / 固定根名称与碰撞通道必须唯一。");
            foreach (var probe in probes) Validate(avatar, probe.instanceName, probe.target, probe.collisionChannel);
            SensaSensorUtility.Budget(avatar, probes.Sum(p => p.othersDiagnostic ? 9 : 5));
            foreach (var probe in probes) Build(avatar, probe.instanceName, probe.target, probe.collisionChannel, probe.othersDiagnostic);
            foreach (var probe in all) UnityEngine.Object.DestroyImmediate(probe);
        }

        public static void Validate(GameObject avatar, string id, Component target, string channel)
        {
            SensaSensorUtility.Name(id); SensaSensorUtility.Name(channel);
            if (target == null || !target.transform.IsChildOf(avatar.transform) && target.transform != avatar.transform)
                throw new InvalidOperationException("Select a supported root on this avatar. / 请选择当前头像上的受支持根部。");
            SensaSensorUtility.Uniform(avatar.transform);
            ValidateRootScaleAnimation(avatar);
            if (!SensaFixedAnchorProtocol.IsScaleSupported(avatar.transform.lossyScale.x, 1))
                throw new InvalidOperationException("Fixed-root receiver exceeds the 3 m world-radius limit. / 固定根接收器超出 3 米世界半径限制。");
            var placement = SensaSpsAdapter.ReadRoot(target);
            if (placement.root != avatar.transform && !placement.root.IsChildOf(avatar.transform))
                throw new InvalidOperationException("The selected root must belong to this avatar. / 所选根部必须属于当前头像。");
            string tag = TagPrefix + channel;
            if (avatar.GetComponentsInChildren<VRCContactSender>(true).Any(s => s.collisionTags != null && s.collisionTags.Contains(tag)))
                throw new InvalidOperationException("Fixed-root collision channel already has a sender. / 固定根碰撞通道已有发送器。");
            if (avatar.transform.Find("SensaFixedRoot_" + id) != null)
                throw new InvalidOperationException("Fixed-root instance already exists. / 固定根实例已经存在。");
        }

        private static void ValidateRootScaleAnimation(GameObject avatar)
        {
            // ScaleFactor observes VRChat avatar scaling, not arbitrary root scale animation. / ScaleFactor 不观测任意根缩放动画。
            if (avatar.GetComponent<ScaleConstraint>() != null)
                throw new InvalidOperationException("Fixed anchors do not support an avatar-root ScaleConstraint. / 固定锚点不支持头像根 ScaleConstraint。");
            var controllers = new List<RuntimeAnimatorController>();
            var animator = avatar.GetComponent<Animator>();
            if (animator != null && animator.runtimeAnimatorController != null) controllers.Add(animator.runtimeAnimatorController);
            var descriptor = avatar.GetComponent<VRCAvatarDescriptor>();
            if (descriptor != null)
            {
                controllers.AddRange((descriptor.baseAnimationLayers ?? Array.Empty<VRCAvatarDescriptor.CustomAnimLayer>()).Where(l => l.animatorController != null).Select(l => l.animatorController));
                controllers.AddRange((descriptor.specialAnimationLayers ?? Array.Empty<VRCAvatarDescriptor.CustomAnimLayer>()).Where(l => l.animatorController != null).Select(l => l.animatorController));
            }
            controllers.AddRange(avatar.GetComponentsInChildren<ModularAvatarMergeAnimator>(true)
                .Where(m => m.animator != null && (m.pathMode == MergeAnimatorPathMode.Absolute || m.transform == avatar.transform)).Select(m => m.animator));
            if (controllers.Distinct().SelectMany(c => c.animationClips).Distinct().Any(c => AnimationUtility.GetCurveBindings(c)
                .Any(b => b.path == "" && b.type == typeof(Transform) && b.propertyName.StartsWith("m_LocalScale", StringComparison.Ordinal))))
                throw new InvalidOperationException("Fixed anchors do not support animated avatar-root scale. / 固定锚点不支持头像根缩放动画。");
        }

        public static GameObject Build(GameObject avatar, string id, Component target, string channel,
            bool othersDiagnostic = false, string selector = null, int selectedSlot = 0)
        {
            Validate(avatar, id, target, channel);
            SensaSensorUtility.Budget(avatar, othersDiagnostic ? 9 : 5);
            var placement = SensaSpsAdapter.ReadRoot(target);
            var source = SensaSensorUtility.Child(placement.root, "SensaRootSource_" + id);
            source.localPosition = placement.position; source.localRotation = placement.rotation;
            var host = SensaSensorUtility.Child(avatar.transform, "SensaFixedRoot_" + id).gameObject;
            var contacts = SensaSensorUtility.Child(host.transform, "Contacts").gameObject;
            var marker = SensaSensorUtility.Child(contacts.transform, "RootMarker");
            marker.SetPositionAndRotation(source.position, source.rotation);
            var follow = marker.gameObject.AddComponent<ParentConstraint>();
            follow.AddSource(new ConstraintSource { sourceTransform = source, weight = 1 });
            follow.SetTranslationOffset(0, Vector3.zero); follow.SetRotationOffset(0, Vector3.zero);
            follow.locked = true; follow.constraintActive = true;
            string tag = TagPrefix + channel;
            var sender = marker.gameObject.AddComponent<VRCContactSender>();
            sender.shapeType = ContactBase.ShapeType.Sphere; sender.radius = SensaFixedAnchorProtocol.MarkerRadius;
            sender.localOnly = !othersDiagnostic; sender.collisionTags = new List<string> { tag };
            var prefixes = new List<string> { SensaFixedAnchorProtocol.Prefix + "/" + id + "/Self" };
            if (othersDiagnostic) prefixes.Add(SensaFixedAnchorProtocol.Prefix + "/" + id + "/Others");
            foreach (string prefix in prefixes)
            {
                bool self = prefix.EndsWith("/Self", StringComparison.Ordinal);
                for (int i = 0; i < SensaFixedAnchorProtocol.AnchorCount; i++)
                {
                    var node = SensaSensorUtility.Child(contacts.transform, (self ? "SelfA" : "OthersA") + i);
                    node.localPosition = new Vector3(SensaFixedAnchorProtocol.AnchorX(i), SensaFixedAnchorProtocol.AnchorY(i), SensaFixedAnchorProtocol.AnchorZ(i));
                    var receiver = node.gameObject.AddComponent<VRCContactReceiver>();
                    receiver.shapeType = ContactBase.ShapeType.Sphere; receiver.radius = SensaFixedAnchorProtocol.ReceiverRadius;
                    receiver.receiverType = ContactReceiver.ReceiverType.Proximity; receiver.localOnly = true;
                    receiver.allowSelf = self; receiver.allowOthers = !self; receiver.collisionTags = new List<string> { tag };
                    receiver.parameter = prefix + "/Root/RawA" + i;
                    SensaSensorUtility.Parameter(host, receiver.parameter); SensaSensorUtility.Parameter(host, prefix + "/Root/A" + i);
                }
                foreach (string suffix in new[] { SensaFixedAnchorProtocol.ProfileSuffix, SensaFixedAnchorProtocol.ScaleSuffix, SensaFixedAnchorProtocol.HeartbeatSuffix })
                    SensaSensorUtility.Parameter(host, prefix + suffix);
                SensaSensorUtility.Parameter(host, prefix + SensaFixedAnchorProtocol.ValidSuffix, ParameterSyncType.Bool);
            }
            BuildAnimator(avatar, host, contacts, prefixes, selector, selectedSlot);
            contacts.SetActive(false); // No measurements until the local scale guard is active. / 守卫生效前禁用测量。
            return host;
        }

        private static void BuildAnimator(GameObject avatar, GameObject host, GameObject contacts, List<string> prefixes, string selector, int slot)
        {
            var controller = new AnimatorController { name = "Sensa fixed root " + host.name };
            foreach (var p in host.GetComponent<ModularAvatarParameters>().parameters)
                controller.AddParameter(p.nameOrPrefix, p.syncType == ParameterSyncType.Bool ? AnimatorControllerParameterType.Bool : AnimatorControllerParameterType.Float);
            controller.AddParameter(new AnimatorControllerParameter { name = "ScaleFactor", type = AnimatorControllerParameterType.Float, defaultFloat = 1 });
            controller.AddParameter("IsLocal", AnimatorControllerParameterType.Bool);
            if (selector != null) controller.AddParameter(selector, AnimatorControllerParameterType.Int);
            var machine = new AnimatorStateMachine { name = "Fixed root scale guard" };
            controller.AddLayer(new AnimatorControllerLayer { name = machine.name, stateMachine = machine, defaultWeight = 1 });
            AnimatorState State(string name, bool active, float heartbeat)
            {
                var state = machine.AddState(name); state.writeDefaultValues = false;
                var clip = new AnimationClip { name = name };
                clip.SetCurve(AnimationUtility.CalculateTransformPath(contacts.transform, avatar.transform), typeof(GameObject), "m_IsActive",
                    AnimationCurve.Constant(0, SensaFixedAnchorProtocol.HeartbeatPeriodSeconds, active ? 1 : 0));
                state.motion = clip;
                var driver = state.AddStateMachineBehaviour<VRCAvatarParameterDriver>(); driver.localOnly = true;
                driver.parameters = new List<VRC_AvatarParameterDriver.Parameter>();
                foreach (string prefix in prefixes)
                {
                    for (int i = 0; i < SensaFixedAnchorProtocol.AnchorCount; i++)
                    {
                        if (!active) driver.parameters.Add(new VRC_AvatarParameterDriver.Parameter { name = prefix + "/Root/RawA" + i, value = 0 });
                        driver.parameters.Add(new VRC_AvatarParameterDriver.Parameter { name = prefix + "/Root/A" + i,
                            type = active ? VRC_AvatarParameterDriver.ChangeType.Copy : VRC_AvatarParameterDriver.ChangeType.Set,
                            source = prefix + "/Root/RawA" + i, value = 0 });
                    }
                    driver.parameters.Add(new VRC_AvatarParameterDriver.Parameter { name = prefix + SensaFixedAnchorProtocol.ProfileSuffix, value = SensaFixedAnchorProtocol.ProfileValue });
                    driver.parameters.Add(new VRC_AvatarParameterDriver.Parameter { name = prefix + SensaFixedAnchorProtocol.ScaleSuffix, type = VRC_AvatarParameterDriver.ChangeType.Copy, source = "ScaleFactor" });
                    driver.parameters.Add(new VRC_AvatarParameterDriver.Parameter { name = prefix + SensaFixedAnchorProtocol.ValidSuffix, value = active && prefix.EndsWith("/Self", StringComparison.Ordinal) ? 1 : 0 });
                    // Submit last. OSC packets remain independent, not an atomic transaction. / 最后提交，但 OSC 数据包并非原子事务。
                    driver.parameters.Add(new VRC_AvatarParameterDriver.Parameter { name = prefix + SensaFixedAnchorProtocol.HeartbeatSuffix, value = heartbeat });
                }
                return state;
            }
            var off = State("Invalid scale or inactive", false, 0); machine.defaultState = off;
            var samples = Enumerable.Range(0, SensaFixedAnchorProtocol.HeartbeatSteps)
                .Select(i => State("Sample " + i, true, (float)i / (SensaFixedAnchorProtocol.HeartbeatSteps - 1))).ToArray();
            const float minimum = .000001f;
            float maximum = SensaFixedAnchorProtocol.MaximumScaleFactor(avatar.transform.lossyScale.x);
            void Valid(AnimatorStateTransition t)
            {
                t.duration = 0; t.AddCondition(AnimatorConditionMode.If, 0, "IsLocal");
                t.AddCondition(AnimatorConditionMode.Greater, minimum, "ScaleFactor");
                t.AddCondition(AnimatorConditionMode.Less, maximum, "ScaleFactor");
                if (selector != null) t.AddCondition(AnimatorConditionMode.Equals, slot, selector);
            }
            var start = off.AddTransition(samples[0]); start.hasExitTime = false; Valid(start);
            for (int i = 0; i < samples.Length; i++)
            {
                // AnyState invalid guards remain active at every step; exact safe boundaries must not freeze the heartbeat.
                // AnyState 失效守卫持续生效；恰在安全边界时不能冻结心跳。
                var t = samples[i].AddTransition(samples[(i + 1) % samples.Length]); t.hasExitTime = true; t.exitTime = 1; t.duration = 0;
            }
            void Invalid(AnimatorConditionMode mode, float value, string parameter)
            {
                var t = machine.AddAnyStateTransition(off); t.duration = 0; t.hasExitTime = false; t.canTransitionToSelf = false;
                t.AddCondition(mode, value, parameter);
            }
            Invalid(AnimatorConditionMode.IfNot, 0, "IsLocal");
            Invalid(AnimatorConditionMode.Less, minimum, "ScaleFactor");
            Invalid(AnimatorConditionMode.Greater, maximum, "ScaleFactor");
            if (selector != null) Invalid(AnimatorConditionMode.NotEqual, slot, selector);
            var merge = host.AddComponent<ModularAvatarMergeAnimator>(); merge.animator = controller;
            merge.layerType = VRCAvatarDescriptor.AnimLayerType.FX; merge.pathMode = MergeAnimatorPathMode.Absolute; merge.matchAvatarWriteDefaults = false;
        }
    }

    [CustomEditor(typeof(SensaFixedRootProbe))]
    public sealed class SensaFixedRootProbeEditor : Editor
    {
        public override void OnInspectorGUI()
        {
            EditorGUILayout.HelpBox("固定 Avatar 根局部四锚点；仅估计明确选中的根中心。输出仍需桌面实验许可。\nFour fixed avatar-root local anchors estimate the explicitly selected root center. Desktop experimental permission is still required.", MessageType.Info);
            SensaInspectorLabels.Draw(serializedObject);
        }
    }
}
