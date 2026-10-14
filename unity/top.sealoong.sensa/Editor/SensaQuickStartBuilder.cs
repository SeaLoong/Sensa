using System;
using System.Linq;
using System.Collections.Generic;
using UnityEngine;
using UnityEditor;
using VRC.Dynamics;
using VRC.SDK3.Avatars.Components;
using VRC.SDK3.Dynamics.Contact.Components;
using nadena.dev.modular_avatar.core;

namespace UnityBox.Sensa
{
    public static class SensaQuickStartBuilder
    {
        public static void ProcessAvatar(GameObject avatar)
        {
            var all = avatar.GetComponentsInChildren<SensaQuickStart>(true);
            var enabled = all.Where(c => c.enabled && c.gameObject.activeInHierarchy).ToArray();
            if (enabled.Length > 1) throw new InvalidOperationException("Only one Sensa Quick Start World Receiver is allowed per avatar.");
            if (enabled.Length == 1) Build(avatar);
            foreach (var component in all) UnityEngine.Object.DestroyImmediate(component);
        }

        public static void Build(GameObject avatar)
        {
            var descriptor = avatar.GetComponent<VRCAvatarDescriptor>();
            var animator = avatar.GetComponent<Animator>();
            if (descriptor == null || animator == null || !animator.isHuman)
                throw new InvalidOperationException("Sensa Quick Start requires a humanoid Avatar Descriptor and Animator on the avatar root.");
            var hand = animator.GetBoneTransform(HumanBodyBones.RightHand);
            if (hand == null) throw new InvalidOperationException("Sensa Quick Start requires a mapped RightHand bone.");
            SensaSensorUtility.Uniform(hand);
            float eyeHeight = descriptor.ViewPosition.y * avatar.transform.lossyScale.y;
            if (float.IsNaN(eyeHeight) || float.IsInfinity(eyeHeight) || eyeHeight < .1f || eyeHeight > 5f)
                throw new InvalidOperationException("Sensa Quick Start requires an avatar view height between 0.1 and 5 metres.");
            if (hand.Find("SensaQuickStart") != null) throw new InvalidOperationException("Sensa Quick Start has already been generated.");
            SensaSensorUtility.Budget(avatar, 2);
            var host = SensaSensorUtility.Child(hand, "SensaQuickStart");
            Receiver(host, "Depth", eyeHeight * SensaQuickStartProtocol.RadiusPerEyeHeight,
                SensaQuickStartProtocol.DepthTag, SensaQuickStartProtocol.Depth, false);
            Receiver(host, "Active", eyeHeight * .02f,
                SensaQuickStartProtocol.ActiveTag, SensaQuickStartProtocol.Active, true);
        }

        static void Receiver(Transform parent, string name, float worldRadius, string tag, string parameter, bool gate)
        {
            var node = SensaSensorUtility.Child(parent, name);
            var receiver = node.gameObject.AddComponent<VRCContactReceiver>();
            receiver.radius = worldRadius / node.lossyScale.x;
            receiver.receiverType = gate ? ContactReceiver.ReceiverType.Constant : ContactReceiver.ReceiverType.Proximity;
            receiver.localOnly = true;
            receiver.allowSelf = false;
            receiver.allowOthers = false; // World senders are independent of these avatar-only filters.
            receiver.collisionTags = new List<string> { tag };
            receiver.parameter = parameter;
            SensaSensorUtility.Parameter(parent.gameObject, parameter, gate ? ParameterSyncType.Bool : ParameterSyncType.Float);
        }
    }

    [CustomEditor(typeof(SensaQuickStart))]
    public sealed class SensaQuickStartEditor : Editor
    {
        public override void OnInspectorGUI()
        {
            EditorGUILayout.HelpBox("入门测试：上传时自动在右手骨骼生成两个本地 Contact，无需摆放、无需 SPS。进入测试世界的 START HERE 操作台，并在 Sensa 导入“入门 · 测试世界 → 我的 Avatar”预设。它验证信号链路，不测量 SPS 插入深度。", MessageType.Info);
            if (GUILayout.Button("打开 OSR 首次使用指南")) Application.OpenURL("https://github.com/SeaLoong/Sensa/blob/main/docs/quick-start.md");
        }
    }
}
