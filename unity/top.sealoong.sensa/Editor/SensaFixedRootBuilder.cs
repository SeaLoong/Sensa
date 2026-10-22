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
        public const string TagPrefix = "SensaSPS_";
        public static void ProcessAvatar(GameObject avatar)
        {
            var all = avatar.GetComponentsInChildren<SensaFixedRootProbe>(true);
            var probes = all.Where(p => p.enabled).ToArray();
            if (probes.GroupBy(p => p.instanceName).Any(g => g.Count() > 1)
                || probes.GroupBy(p => p.collisionChannel).Any(g => g.Count() > 1))
                throw new InvalidOperationException(SensaEditorLocalization.Text("SPS names and collision channels must be unique."));
            foreach (var probe in probes) Validate(avatar, probe.instanceName, probe.target, probe.collisionChannel);
            SensaSensorUtility.Budget(avatar, probes.Length * 5);
            foreach (var probe in probes) Build(avatar, probe.instanceName, probe.target, probe.collisionChannel);
            foreach (var probe in all) UnityEngine.Object.DestroyImmediate(probe);
        }

        public static void Validate(GameObject avatar, string id, Component target, string channel)
        {
            SensaSensorUtility.Name(id); SensaSensorUtility.Name(channel);
            if (target == null || !target.transform.IsChildOf(avatar.transform) && target.transform != avatar.transform)
                throw new InvalidOperationException(SensaEditorLocalization.Text("Select a supported root on this avatar."));
            SensaSensorUtility.Uniform(avatar.transform);
            ValidateRootScaleAnimation(avatar);
            if (!SensaFixedAnchorProtocol.IsScaleSupported(avatar.transform.lossyScale.x, 1))
                throw new InvalidOperationException(SensaEditorLocalization.Text("Fixed-root receiver exceeds the 3 m world-radius limit."));
            var placement = SensaSpsAdapter.ReadRoot(target);
            if (placement.root != avatar.transform && !placement.root.IsChildOf(avatar.transform))
                throw new InvalidOperationException(SensaEditorLocalization.Text("The selected root must belong to this avatar."));
            string tag = TagPrefix + channel;
            if (avatar.GetComponentsInChildren<VRCContactSender>(true).Any(s => s.collisionTags != null && s.collisionTags.Contains(tag)))
                throw new InvalidOperationException(SensaEditorLocalization.Text("Fixed-root collision channel already has a sender."));
            if (avatar.transform.Find("SensaFixedRoot_" + id) != null)
                throw new InvalidOperationException(SensaEditorLocalization.Text("Fixed-root instance already exists."));
        }

        internal static void ValidateRootScaleAnimation(GameObject avatar)
        {
            // ScaleFactor observes VRChat avatar scaling, not arbitrary root scale animation. / ScaleFactor 不观测任意根缩放动画。
            if (avatar.GetComponent<ScaleConstraint>() != null)
                throw new InvalidOperationException(SensaEditorLocalization.Text("Fixed anchors do not support an avatar-root ScaleConstraint."));
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
                throw new InvalidOperationException(SensaEditorLocalization.Text("Fixed anchors do not support animated avatar-root scale."));
        }

        public static GameObject Build(GameObject avatar, string id, Component target, string channel,
            string selector = null, int selectedSlot = 0)
        {
            Validate(avatar, id, target, channel);
            SensaSensorUtility.Budget(avatar, 5);
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
            sender.localOnly = true; sender.collisionTags = new List<string> { tag };
            string prefix = SensaFixedAnchorProtocol.Prefix + "/" + id;
            string rawPrefix = "Sensa/Internal/SPS/" + id + "/RawP";
            for (int i = 0; i < SensaFixedAnchorProtocol.AnchorCount; i++)
            {
                var node = SensaSensorUtility.Child(contacts.transform, "P" + i);
                node.localPosition = new Vector3(SensaFixedAnchorProtocol.AnchorX(i), SensaFixedAnchorProtocol.AnchorY(i), SensaFixedAnchorProtocol.AnchorZ(i));
                var receiver = node.gameObject.AddComponent<VRCContactReceiver>();
                receiver.shapeType = ContactBase.ShapeType.Sphere; receiver.radius = SensaFixedAnchorProtocol.ReceiverRadius;
                receiver.receiverType = ContactReceiver.ReceiverType.Proximity; receiver.localOnly = true;
                receiver.allowSelf = true; receiver.allowOthers = false; receiver.collisionTags = new List<string> { tag };
                // Raw values are FX-only, not Expression Parameters or the public OSC contract. / Raw 仅在 FX 声明，不注册公开表达参数。
                receiver.parameter = rawPrefix + i;
                SensaSensorUtility.Parameter(host, prefix + "/P" + i);
            }
            SensaSensorUtility.Parameter(host, prefix + SensaFixedAnchorProtocol.SampleSuffix);
            BuildAnimator(avatar, host, contacts, prefix, rawPrefix, selector, selectedSlot);
            contacts.SetActive(false);
            return host;
        }

        private static void BuildAnimator(GameObject avatar, GameObject host, GameObject contacts, string prefix,
            string rawPrefix, string selector, int slot)
        {
            var controller = new AnimatorController { name = "Sensa SPS " + host.name };
            foreach (var p in host.GetComponent<ModularAvatarParameters>().parameters)
                controller.AddParameter(p.nameOrPrefix, AnimatorControllerParameterType.Float);
            for (int i = 0; i < SensaFixedAnchorProtocol.AnchorCount; i++)
                controller.AddParameter(rawPrefix + i, AnimatorControllerParameterType.Float);
            controller.AddParameter(new AnimatorControllerParameter { name = "ScaleFactor", type = AnimatorControllerParameterType.Float, defaultFloat = 1 });
            controller.AddParameter("IsLocal", AnimatorControllerParameterType.Bool);
            if (selector != null) controller.AddParameter(selector, AnimatorControllerParameterType.Int);
            var machine = new AnimatorStateMachine { name = "SPS scale guard" };
            controller.AddLayer(new AnimatorControllerLayer { name = machine.name, stateMachine = machine, defaultWeight = 1 });
            AnimatorState State(string name, bool active, float sample)
            {
                var state = machine.AddState(name); state.writeDefaultValues = false;
                var clip = new AnimationClip { name = name };
                clip.SetCurve(AnimationUtility.CalculateTransformPath(contacts.transform, avatar.transform), typeof(GameObject), "m_IsActive",
                    AnimationCurve.Constant(0, SensaFixedAnchorProtocol.SamplePeriodSeconds, active ? 1 : 0));
                state.motion = clip;
                var driver = state.AddStateMachineBehaviour<VRCAvatarParameterDriver>(); driver.localOnly = true;
                driver.parameters = new List<VRC_AvatarParameterDriver.Parameter>();
                for (int i = 0; i < SensaFixedAnchorProtocol.AnchorCount; i++)
                {
                    if (!active) driver.parameters.Add(new VRC_AvatarParameterDriver.Parameter { name = rawPrefix + i, value = 0 });
                    driver.parameters.Add(new VRC_AvatarParameterDriver.Parameter { name = prefix + "/P" + i,
                        type = active ? VRC_AvatarParameterDriver.ChangeType.Copy : VRC_AvatarParameterDriver.ChangeType.Set,
                        source = rawPrefix + i, value = 0 });
                }
                // Submit last. OSC delivery is still not atomic. / 最后提交，但 OSC 传输仍不是原子事务。
                driver.parameters.Add(new VRC_AvatarParameterDriver.Parameter { name = prefix + SensaFixedAnchorProtocol.SampleSuffix, value = sample });
                return state;
            }
            var off = State("Invalid scale or inactive", false, 0); machine.defaultState = off;
            var samples = Enumerable.Range(0, SensaFixedAnchorProtocol.SampleSteps)
                .Select(i => State("Sample " + i, true, (float)(i + 1) / SensaFixedAnchorProtocol.SampleSteps)).ToArray();
            const float minimum = .000001f;
            float maximum = SensaFixedAnchorProtocol.MaximumScaleFactor(avatar.transform.lossyScale.x);
            var start = off.AddTransition(samples[0]); start.duration = 0; start.hasExitTime = false;
            start.AddCondition(AnimatorConditionMode.If, 0, "IsLocal");
            start.AddCondition(AnimatorConditionMode.Greater, minimum, "ScaleFactor");
            start.AddCondition(AnimatorConditionMode.Less, maximum, "ScaleFactor");
            if (selector != null) start.AddCondition(AnimatorConditionMode.Equals, slot, selector);
            for (int i = 0; i < samples.Length; i++)
            {
                // AnyState guards own invalidation; exact safe boundaries keep Sample advancing. / AnyState 处理失效，安全边界仍持续采样。
                var t = samples[i].AddTransition(samples[(i + 1) % samples.Length]);
                t.hasExitTime = true; t.exitTime = 1; t.duration = 0;
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
            EditorGUILayout.LabelField(SensaEditorLocalization.Text("Four-anchor tracking"), EditorStyles.boldLabel);
            EditorGUILayout.HelpBox(SensaEditorLocalization.Text("Track the selected root point with four 2 m receivers. The green scene-view slices show their common measurable volume; the whole coordinate box is not covered. Keep the target away from the tiny orange saturation zones at the anchor centers."), MessageType.Info);
            SensaInspectorLabels.Draw(serializedObject);
        }
        private void OnSceneGUI()
        {
            var probe = (SensaFixedRootProbe)target;
            var avatar = probe.GetComponentInParent<VRCAvatarDescriptor>();
            if (avatar != null) SensaCoverageGizmos.Fixed(avatar.transform);
        }
    }
}
