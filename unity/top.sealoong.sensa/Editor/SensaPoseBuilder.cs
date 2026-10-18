using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using nadena.dev.modular_avatar.core;
using UnityEngine;
using VRC.SDK3.Dynamics.Contact.Components;
using VRC.Dynamics;
using Object = UnityEngine.Object;

namespace UnityBox.Sensa
{
    public static class SensaPoseBuilder
    {
        public static void ProcessAvatar(GameObject avatar)
        {
            var allSockets = avatar.GetComponentsInChildren<SensaPoseSocket>(true);
            var allPlugs = avatar.GetComponentsInChildren<SensaPosePlug>(true);
            var sockets = allSockets.Where(c => c.enabled).ToArray();
            var duplicate = sockets.GroupBy(c => c.instanceName).FirstOrDefault(g => g.Count() > 1);
            if (duplicate != null) throw new InvalidOperationException("Sensa Pose Socket names must be unique: " + duplicate.Key);
            var plugs = allPlugs.Where(c => c.enabled).ToArray();
            foreach (var socket in sockets) Validate(socket);
            foreach (var plug in plugs) Validate(plug);
            foreach (var plug in plugs)
                foreach (var marker in new[] { plug.rootMarker, plug.tipMarker, plug.sideMarker })
                    if (!marker.IsChildOf(avatar.transform)) throw new InvalidOperationException("Pose landmarks must belong to the avatar being built.");
            var added = sockets.Sum(c => 24 * ((c.profile.receiveSelf ? 1 : 0) + (c.profile.receiveOthers ? 1 : 0))) + plugs.Length * 3;
            var existing = avatar.GetComponentsInChildren<VRCContactReceiver>(true).Length + avatar.GetComponentsInChildren<VRCContactSender>(true).Length;
            if (existing + added > 256) throw new InvalidOperationException("Sensa Pose would exceed the avatar's 256 Contact limit.");
            foreach (var socket in sockets) { BuildSocket(socket); Object.DestroyImmediate(socket); }
            foreach (var plug in plugs) { BuildPlug(plug); Object.DestroyImmediate(plug); }
            foreach (var socket in allSockets.Where(c => c != null && !c.enabled)) Object.DestroyImmediate(socket);
            foreach (var plug in allPlugs.Where(c => c != null && !c.enabled)) Object.DestroyImmediate(plug);
        }

        public static void Validate(SensaPoseSocket socket)
        {
            if (socket.standardSpsRoot)
                throw new InvalidOperationException("旧八路 SPS Root 作者已停用。请替换为 SensaFixedRootProbe 或 Automatic SPS Setup，并明确选择真实根部。 / Legacy eight-channel SPS Root authoring is disabled. Replace it with SensaFixedRootProbe or Automatic SPS Setup and select the actual root explicitly.");
            CheckName(socket.instanceName, "Socket instance"); CheckProfile(socket.profile);
            CheckScale(socket.transform);
            if (SensaPoseProtocol.ReceiverRadius * socket.transform.lossyScale.x > 3f)
                throw new InvalidOperationException("Sensa Pose receiver radius exceeds VRChat's 3 metre limit at this scale.");
            if (!socket.profile.receiveSelf && !socket.profile.receiveOthers)
                throw new InvalidOperationException("Sensa Pose profile must enable Self or Others.");
        }

        public static void Validate(SensaPosePlug plug)
        {
            CheckProfile(plug.profile);
            if (plug.rootMarker == null || plug.tipMarker == null || plug.sideMarker == null)
                throw new InvalidOperationException("Sensa Pose Plug needs Root, Tip and Side landmarks.");
            foreach (var marker in new[] { plug.rootMarker, plug.tipMarker, plug.sideMarker }) CheckScale(marker);
            var root = plug.rootMarker.position; var axis = plug.tipMarker.position - root;
            if (axis.magnitude < 0.02f) throw new InvalidOperationException("Sensa Pose Root and Tip must be at least 2 cm apart at authoring scale.");
            if (Vector3.Cross(axis.normalized, plug.sideMarker.position - root).magnitude < 0.005f)
                throw new InvalidOperationException("Sensa Pose Side must be at least 5 mm away from the Root/Tip axis.");
        }

        private static void CheckProfile(SensaPoseProfile profile)
        {
            if (profile == null) throw new InvalidOperationException("Assign a Sensa Pose pair profile.");
            CheckName(profile.channel, "Pair channel");
        }
        private static void CheckName(string value, string label)
        {
            if (string.IsNullOrEmpty(value) || !Regex.IsMatch(value, "^[A-Za-z0-9_-]{1,48}$"))
                throw new InvalidOperationException(label + " must contain 1–48 ASCII letters, digits, '_' or '-'.");
        }
        private static void CheckScale(Transform target)
        {
            for (var current = target; current != null; current = current.parent)
            {
                var scale = current.localScale;
                if (scale.x <= 0 || scale.y <= 0 || scale.z <= 0 || float.IsNaN(scale.x + scale.y + scale.z)
                    || float.IsInfinity(scale.x + scale.y + scale.z)
                    || Mathf.Abs(scale.x - scale.y) > .0001f * scale.x || Mathf.Abs(scale.x - scale.z) > .0001f * scale.x)
                    throw new InvalidOperationException("Sensa Pose requires positive uniform scale throughout the landmark hierarchy: " + current.name);
            }
        }

        public static void BuildSocket(SensaPoseSocket socket)
        {
            Validate(socket);
            if (socket.transform.Find("SensaPose_Contacts") != null) throw new InvalidOperationException("Sensa Pose Socket is already baked.");
            var container = Child(socket.transform, "SensaPose_Contacts");
            var parameters = socket.GetComponent<ModularAvatarParameters>() ?? socket.gameObject.AddComponent<ModularAvatarParameters>();
            if (parameters.parameters == null) parameters.parameters = new List<ParameterConfig>();
            foreach (var self in new[] { false, true })
            {
                if (self ? !socket.profile.receiveSelf : !socket.profile.receiveOthers) continue;
                var party = self ? "Self" : "Others";
                foreach (var marker in SensaPoseProtocol.Markers)
                for (var i = 0; i < SensaPoseProtocol.AnchorsPerMarker; i++)
                {
                    var name = party + "_" + marker + "_A" + i;
                    var node = Child(container, name);
                    node.localPosition = new Vector3(SensaPoseProtocol.AnchorX(i), SensaPoseProtocol.AnchorY(i), SensaPoseProtocol.AnchorZ(i));
                    var receiver = node.gameObject.AddComponent<VRCContactReceiver>();
                    receiver.radius = SensaPoseProtocol.ReceiverRadius;
                    receiver.shapeType = ContactBase.ShapeType.Sphere;
                    receiver.receiverType = ContactReceiver.ReceiverType.Proximity;
                    receiver.allowSelf = self; receiver.allowOthers = !self; receiver.localOnly = true;
                    receiver.collisionTags = new List<string> { SensaPoseProtocol.Tag(socket.profile.channel, marker) };
                    receiver.parameter = SensaPoseProtocol.Prefix + "/" + socket.instanceName + "/" + party + "/" + marker + "/A" + i;
                    parameters.parameters.Add(new ParameterConfig
                    {
                        nameOrPrefix = receiver.parameter, remapTo = "", internalParameter = false, isPrefix = false,
                        syncType = ParameterSyncType.Float, localOnly = true, saved = false, defaultValue = 0,
                        hasExplicitDefaultValue = true,
                    });
                }
            }
            SensaSensorUtility.WritableParameters(socket.gameObject, "Sensa pose " + socket.instanceName);
        }

        public static void BuildPlug(SensaPosePlug plug)
        {
            Validate(plug);
            if (plug.transform.Find("SensaPose_Markers") != null) throw new InvalidOperationException("Sensa Pose Plug is already baked.");
            var container = Child(plug.transform, "SensaPose_Markers");
            var targets = new[] { plug.rootMarker, plug.tipMarker, plug.sideMarker };
            for (var i = 0; i < targets.Length; i++)
            {
                var marker = SensaPoseProtocol.Markers[i];
                var name = "SensaPose_Sender_" + plug.profile.channel + "_" + marker;
                var sender = Child(container, name).gameObject.AddComponent<VRCContactSender>();
                sender.rootTransform = targets[i]; // Follow landmarks without modifying their hierarchy.
                sender.shapeType = ContactBase.ShapeType.Sphere;
                sender.radius = SensaPoseProtocol.MarkerRadius;
                sender.collisionTags = new List<string> { SensaPoseProtocol.Tag(plug.profile.channel, marker) };
                sender.localOnly = false; // Peers must be able to detect these three markers.
            }
        }

        private static Transform Child(Transform parent, string name)
        {
            var node = new GameObject(name).transform; node.SetParent(parent, false); return node;
        }
    }
}
