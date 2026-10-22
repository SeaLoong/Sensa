using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
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
    public static class SensaContactRootBuilder
    {
        public const string TagPrefix = "SensaContact_";
        private const string RequiredSdk = "Contact direct tracking (SDK Beta) requires advanced proximity parameters. Install VRChat Avatars SDK 3.10.6-beta.2 or a newer SDK with this feature, or choose SPS four-anchor tracking.";

        // Reflection keeps the package loadable on stable SDKs without the beta field.
        internal static FieldInfo AdvancedProximityField(Type receiverType)
        {
            var field = receiverType?.GetField("advancedProximityParameters", BindingFlags.Instance | BindingFlags.Public);
            return field != null && field.FieldType == typeof(bool) ? field : null;
        }
        public static bool IsSupported => AdvancedProximityField(typeof(VRCContactReceiver)) != null;
        internal static void RequireSupport(Type receiverType)
        {
            if (AdvancedProximityField(receiverType) == null)
                throw new InvalidOperationException(SensaEditorLocalization.Text(RequiredSdk));
        }

        public static void ProcessAvatar(GameObject avatar)
        {
            var all = avatar.GetComponentsInChildren<SensaContactRootProbe>(true);
            var probes = all.Where(p => p.enabled).ToArray();
            if (probes.GroupBy(p => p.instanceName).Any(g => g.Count() > 1)
                || probes.GroupBy(p => SensaSensorUtility.ResolveRootChannel(p.instanceName, p.collisionChannel)).Any(g => g.Count() > 1))
                throw new InvalidOperationException(SensaEditorLocalization.Text("Contact root names and collision channels must be unique."));
            foreach (var probe in probes) Validate(avatar, probe.instanceName, probe.target, probe.collisionChannel);
            SensaSensorUtility.Budget(avatar, probes.Length * 2);
            foreach (var probe in probes) Build(avatar, probe.instanceName, probe.target, probe.collisionChannel);
            foreach (var probe in all) UnityEngine.Object.DestroyImmediate(probe);
        }

        public static void Validate(GameObject avatar, string id, Component target, string channel)
        {
            RequireSupport(typeof(VRCContactReceiver));
            var resolvedChannel = SensaSensorUtility.ResolveRootChannel(id, channel);
            if (target == null || target.transform != avatar.transform && !target.transform.IsChildOf(avatar.transform))
                throw new InvalidOperationException(SensaEditorLocalization.Text("Select a supported root on this avatar."));
            SensaSensorUtility.Uniform(avatar.transform);
            SensaFixedRootBuilder.ValidateRootScaleAnimation(avatar);
            if (!SensaContactProtocol.IsScaleSupported(avatar.transform.lossyScale.x, 1))
                throw new InvalidOperationException(SensaEditorLocalization.Text("Contact root receiver exceeds the 3 m world-radius limit."));
            var placement = SensaSpsAdapter.ReadRoot(target);
            if (placement.root != avatar.transform && !placement.root.IsChildOf(avatar.transform))
                throw new InvalidOperationException(SensaEditorLocalization.Text("The selected root must belong to this avatar."));
            string tag = TagPrefix + resolvedChannel;
            if (avatar.GetComponentsInChildren<VRCContactSender>(true).Any(sender => sender.collisionTags != null && sender.collisionTags.Contains(tag)))
                throw new InvalidOperationException(SensaEditorLocalization.Text("Contact root collision channel already has a sender."));
            if (avatar.transform.Find("SensaContactRoot_" + id) != null)
                throw new InvalidOperationException(SensaEditorLocalization.Text("Contact root instance already exists."));
        }

        public static GameObject Build(GameObject avatar, string id, Component target, string channel,
            string selector = null, int selectedSlot = 0)
        {
            Validate(avatar, id, target, channel);
            SensaSensorUtility.Budget(avatar, 2);
            var placement = SensaSpsAdapter.ReadRoot(target);
            var source = SensaSensorUtility.Child(placement.root, "SensaContactSource_" + id);
            source.localPosition = placement.position; source.localRotation = placement.rotation;
            var host = SensaSensorUtility.Child(avatar.transform, "SensaContactRoot_" + id).gameObject;
            var contacts = SensaSensorUtility.Child(host.transform, "Contacts").gameObject;
            var marker = SensaSensorUtility.Child(contacts.transform, "RootMarker");
            marker.SetPositionAndRotation(source.position, source.rotation);
            var follow = marker.gameObject.AddComponent<ParentConstraint>();
            follow.AddSource(new ConstraintSource { sourceTransform = source, weight = 1 });
            follow.SetTranslationOffset(0, Vector3.zero); follow.SetRotationOffset(0, Vector3.zero);
            follow.locked = true; follow.constraintActive = true;
            string tag = TagPrefix + SensaSensorUtility.ResolveRootChannel(id, channel);
            var sender = marker.gameObject.AddComponent<VRCContactSender>();
            sender.shapeType = ContactBase.ShapeType.Sphere; sender.radius = SensaContactProtocol.MarkerRadius;
            sender.localOnly = true; sender.collisionTags = new List<string> { tag };

            // Identity local transform and zero shape offsets establish avatar-root origin/axes.
            var receiver = contacts.AddComponent<VRCContactReceiver>();
            receiver.rootTransform = avatar.transform; receiver.position = Vector3.zero; receiver.rotation = Quaternion.identity;
            receiver.shapeType = ContactBase.ShapeType.Sphere; receiver.radius = SensaContactProtocol.ReceiverRadius;
            receiver.receiverType = ContactReceiver.ReceiverType.Proximity; receiver.localOnly = true;
            receiver.allowSelf = true; receiver.allowOthers = false; receiver.collisionTags = new List<string> { tag };
            string prefix = SensaContactProtocol.Prefix + "/" + id;
            receiver.parameter = prefix + "/" + SensaContactProtocol.ProximityLeaf;
            AdvancedProximityField(typeof(VRCContactReceiver)).SetValue(receiver, true);
            foreach (var leaf in SensaContactProtocol.PublicLeaves)
                SensaSensorUtility.Parameter(host, prefix + "/" + leaf,
                    leaf == SensaContactProtocol.SenderTypeLeaf ? ParameterSyncType.Int : ParameterSyncType.Float);
            BuildAnimator(avatar, host, contacts, prefix, receiver, selector, selectedSlot);
            contacts.SetActive(false);
            return host;
        }

        private static void BuildAnimator(GameObject avatar, GameObject host, GameObject contacts, string prefix,
            VRCContactReceiver receiver, string selector, int slot)
        {
            var controller = new AnimatorController { name = "Sensa Contact " + host.name };
            foreach (var parameter in host.GetComponent<ModularAvatarParameters>().parameters)
                controller.AddParameter(parameter.nameOrPrefix, parameter.syncType == ParameterSyncType.Int
                    ? AnimatorControllerParameterType.Int : AnimatorControllerParameterType.Float);
            // The SDK binds one Bool for each collision tag when advanced reporting is enabled.
            // These writable parameters belong to FX only, outside the twelve public declarations.
            var collisionTagParameters = receiver.collisionTags.Where(tag => !string.IsNullOrWhiteSpace(tag)).Distinct()
                .Select(tag => receiver.parameter + "_CollisionTag_" + tag).ToArray();
            foreach (var parameter in collisionTagParameters)
                controller.AddParameter(parameter, AnimatorControllerParameterType.Bool);
            controller.AddParameter(new AnimatorControllerParameter { name = "ScaleFactor", type = AnimatorControllerParameterType.Float, defaultFloat = 1 });
            controller.AddParameter("IsLocal", AnimatorControllerParameterType.Bool);
            if (selector != null) controller.AddParameter(selector, AnimatorControllerParameterType.Int);
            var machine = new AnimatorStateMachine { name = "Contact root scale guard" };
            controller.AddLayer(new AnimatorControllerLayer { name = machine.name, stateMachine = machine, defaultWeight = 1 });
            AnimatorState State(string name, bool active, float sample)
            {
                var state = machine.AddState(name); state.writeDefaultValues = false;
                var clip = new AnimationClip { name = name };
                clip.SetCurve(AnimationUtility.CalculateTransformPath(contacts.transform, avatar.transform), typeof(GameObject), "m_IsActive",
                    AnimationCurve.Constant(0, SensaContactProtocol.SamplePeriodSeconds, active ? 1 : 0));
                state.motion = clip;
                var driver = state.AddStateMachineBehaviour<VRCAvatarParameterDriver>(); driver.localOnly = true;
                driver.parameters = new List<VRC_AvatarParameterDriver.Parameter>();
                // SDK writes all ten native report parameters directly. Reset them only while inactive.
                if (!active) foreach (var leaf in SensaContactProtocol.ReportLeaves)
                    driver.parameters.Add(new VRC_AvatarParameterDriver.Parameter { name = prefix + "/" + leaf, value = 0 });
                if (!active) foreach (var parameter in collisionTagParameters)
                    driver.parameters.Add(new VRC_AvatarParameterDriver.Parameter { name = parameter, value = 0 });
                // These controls prove producer activity and receiver scale, not atomic SDK sampling.
                driver.parameters.Add(new VRC_AvatarParameterDriver.Parameter {
                    name = prefix + "/" + SensaContactProtocol.RadiusLeaf,
                    type = active ? VRC_AvatarParameterDriver.ChangeType.Copy : VRC_AvatarParameterDriver.ChangeType.Set,
                    source = "ScaleFactor", value = 0, convertRange = active,
                    sourceMin = 0, sourceMax = SensaContactProtocol.MaximumWorldContactRadius / (SensaContactProtocol.ReceiverRadius * avatar.transform.lossyScale.x),
                    destMin = 0, destMax = SensaContactProtocol.MaximumWorldContactRadius
                });
                driver.parameters.Add(new VRC_AvatarParameterDriver.Parameter { name = prefix + "/" + SensaContactProtocol.SampleLeaf, value = sample });
                return state;
            }
            var off = State("Invalid scale or inactive", false, 0); machine.defaultState = off;
            var samples = Enumerable.Range(0, SensaContactProtocol.SampleSteps)
                .Select(i => State("Sample " + i, true, (float)(i + 1) / SensaContactProtocol.SampleSteps)).ToArray();
            const float minimum = .000001f;
            float maximum = SensaContactProtocol.MaximumScaleFactor(avatar.transform.lossyScale.x);
            var start = off.AddTransition(samples[0]); start.duration = 0; start.hasExitTime = false;
            start.AddCondition(AnimatorConditionMode.If, 0, "IsLocal");
            start.AddCondition(AnimatorConditionMode.Greater, minimum, "ScaleFactor");
            start.AddCondition(AnimatorConditionMode.Less, maximum, "ScaleFactor");
            if (selector != null) start.AddCondition(AnimatorConditionMode.Equals, slot, selector);
            for (int i = 0; i < samples.Length; i++)
            {
                var cycle = samples[i].AddTransition(samples[(i + 1) % samples.Length]);
                cycle.hasExitTime = true; cycle.exitTime = 1; cycle.duration = 0;
            }
            void Invalid(AnimatorConditionMode mode, float value, string parameter)
            {
                var transition = machine.AddAnyStateTransition(off); transition.duration = 0;
                transition.hasExitTime = false; transition.canTransitionToSelf = false;
                transition.AddCondition(mode, value, parameter);
            }
            Invalid(AnimatorConditionMode.IfNot, 0, "IsLocal");
            Invalid(AnimatorConditionMode.Less, minimum, "ScaleFactor");
            Invalid(AnimatorConditionMode.Greater, maximum, "ScaleFactor");
            if (selector != null) Invalid(AnimatorConditionMode.NotEqual, slot, selector);
            var merge = host.AddComponent<ModularAvatarMergeAnimator>(); merge.animator = controller;
            merge.layerType = VRCAvatarDescriptor.AnimLayerType.FX; merge.pathMode = MergeAnimatorPathMode.Absolute;
            merge.matchAvatarWriteDefaults = false;
        }
    }

    [CustomEditor(typeof(SensaContactRootProbe))]
    public sealed class SensaContactRootProbeEditor : Editor
    {
        public override void OnInspectorGUI()
        {
            EditorGUILayout.LabelField(SensaEditorLocalization.Text("Contact direct tracking (SDK Beta)"), EditorStyles.boldLabel);
            EditorGUILayout.HelpBox(SensaEditorLocalization.Text("Choose a bone, marker, SPS component, Sensa component or native Contact as the root. A dedicated Sender and Receiver report position in avatar-root axes (m) and relative contact-point velocity (m/s). Sample indicates publishing activity. Verify parameter delivery and motion in the client."), MessageType.Info);
            if (!SensaContactRootBuilder.IsSupported)
                EditorGUILayout.HelpBox(SensaEditorLocalization.Text("Install VRChat Avatars SDK 3.10.6-beta.2 or a newer SDK with advanced proximity parameters, or choose SPS four-anchor tracking."), MessageType.Warning);
            SensaInspectorLabels.Draw(serializedObject);
        }
        private void OnSceneGUI()
        {
            var probe = (SensaContactRootProbe)target;
            var avatar = probe.GetComponentInParent<VRCAvatarDescriptor>();
            if (avatar == null) return;
            using (new Handles.DrawingScope(avatar.transform.localToWorldMatrix))
            {
                Handles.color = new Color(.2f, .8f, .4f, .8f);
                Handles.DrawWireDisc(Vector3.zero, Vector3.up, SensaContactProtocol.ReceiverRadius);
                Handles.DrawWireDisc(Vector3.zero, Vector3.right, SensaContactProtocol.ReceiverRadius);
                Handles.DrawWireDisc(Vector3.zero, Vector3.forward, SensaContactProtocol.ReceiverRadius);
            }
        }
    }
}
