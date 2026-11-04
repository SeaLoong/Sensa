using System;
using System.Linq;
using System.Reflection;
using UnityEngine;
using UnityEngine.Animations;
using VRC.SDK3.Avatars.Components;
using VRC.SDK3.Dynamics.Contact.Components;

namespace UnityBox.Sensa
{
    public static class SensaSpsAdapter
    {
        public const string SocketType = "VF.Component.VRCFuryHapticSocket";
        public const string PlugType = "VF.Component.VRCFuryHapticPlug";
        public sealed class Placement { public Component source; public Vector3 position; public Quaternion rotation; public float length; }
        private static Type FindType(string name) => AppDomain.CurrentDomain.GetAssemblies().Select(a=>a.GetType(name)).FirstOrDefault(t=>t!=null);
        private static Type Type(string name) => FindType(name)
            ?? throw new InvalidOperationException(SensaEditorLocalization.Text("Install supported VRCFury SPS: missing ")+name);
        // SPS3 beta 59fa4fa keeps the authoring component geometry API, but adds a
        // distinct channel-tag/encoded-scale ABI. Recognize its contract, not a package version.
        public static bool HasSps3ContactApi => IsSps3ContactApiSchema(FindType("VF.Builder.Haptics.SpsTags"));
        internal static bool IsSps3ContactApiSchema(Type schema)
        {
            if (schema == null) return false;
            bool Constant(string name, string expected)
            {
                var field = schema.GetField(name, BindingFlags.Public | BindingFlags.Static);
                return field != null && field.IsLiteral && field.FieldType == typeof(string)
                    && Equals(field.GetRawConstantValue(), expected);
            }
            return Constant("Prefix", "SPS/") && Constant("PublicChannel", "_public")
                && Constant("NotHipsChannel", "_nothips")
                && Constant("LegacyPlugSphere", "TPS_Pen_Penetrating")
                && Constant("LegacySocket", "TPS_Orf_Root")
                && Constant("LegacySocket2", "SPSLL_Socket_Root")
                && new[] { "FormatPlug", "FormatSocket", "FormatSocketPath" }.All(name =>
                {
                    var method = schema.GetMethod(name, BindingFlags.Public | BindingFlags.Static,
                        null, new[] { typeof(string) }, null);
                    return method != null && method.ReturnType == typeof(string);
                });
        }
        public static bool IsTarget(Component c) => c!=null && (c.GetType().FullName==SocketType || c.GetType().FullName==PlugType);
        public static bool IsRootTarget(Component component) => component is Transform || component is SensaComponent
            || component is VRC.Dynamics.ContactBase || IsTarget(component);
        public sealed class RootPlacement
        {
            public Transform root;
            public Vector3 position;
            public Quaternion rotation;
            public bool encodedContactScale;
            internal Vector3 contactPosition;
            internal Quaternion contactRotation;
            internal float referenceScale = 1;
            public Matrix4x4 WorldMatrix => (encodedContactScale
                ? Matrix4x4.TRS(root.TransformPoint(contactPosition), root.rotation * contactRotation,
                    Vector3.one * referenceScale)
                : root.localToWorldMatrix) * Matrix4x4.TRS(position, rotation, Vector3.one);
            public Quaternion WorldRotation => root.rotation
                * (encodedContactScale ? contactRotation : Quaternion.identity) * rotation;
        }
        internal static bool HasEncodedSps3Scale(VRC.Dynamics.ContactBase contact) => contact is VRCContactSender sender
            && sender.collisionTags != null && sender.collisionTags.Any(tag => tag != null
                && new[] { "SPS/Plug/", "SPS/Socket/", "SPS/SocketPath/" }
                    .Any(prefix => tag.StartsWith(prefix, StringComparison.Ordinal) && tag.Length > prefix.Length));
        public static Transform BuildRootSource(GameObject avatar, RootPlacement placement, string name)
        {
            var parent = placement.root;
            if (placement.encodedContactScale)
            {
                // SPS3 scale carries channel geometry/flags, not the size of a root coordinate frame.
                // Follow the actual shape center and quaternion; the rigid basis uses Avatar-root units.
                var center = SensaSensorUtility.Child(parent, name + "_ContactCenter");
                center.localPosition = placement.contactPosition;
                center.localRotation = placement.contactRotation;
                parent = SensaSensorUtility.Child(avatar.transform, name + "_ContactFrame");
                parent.SetPositionAndRotation(center.position, center.rotation);
                var follow = parent.gameObject.AddComponent<ParentConstraint>();
                follow.AddSource(new ConstraintSource { sourceTransform = center, weight = 1 });
                follow.SetTranslationOffset(0, Vector3.zero); follow.SetRotationOffset(0, Vector3.zero);
                follow.locked = true; follow.constraintActive = true;
            }
            var source = SensaSensorUtility.Child(parent, name);
            source.localPosition = placement.position;
            source.localRotation = placement.rotation;
            return source;
        }
        public static RootPlacement ReadRoot(Component component)
        {
            if (component == null) throw new InvalidOperationException(SensaEditorLocalization.Text("Choose a root target: a bone, marker, SPS component or Contact."));
            if (component is Transform transform)
                return CheckedRoot(new RootPlacement { root = transform, rotation = Quaternion.identity });
            if (IsTarget(component))
            {
                var placement = ReadGeometry(component, false);
                return CheckedRoot(new RootPlacement { root = component.transform, position = placement.position, rotation = placement.rotation });
            }
            if (component is SensaComponent owned)
            {
                var root = owned.role == BridgeRole.Socket ? owned.depthAxis : owned.rootBone;
                if (root == null) throw new InvalidOperationException(SensaEditorLocalization.Text("Sensa root is not configured."));
                return CheckedRoot(new RootPlacement { root = root, rotation = Quaternion.identity });
            }
            if (component is VRC.Dynamics.ContactBase contact)
            {
                var placement = CheckedRoot(new RootPlacement {
                    root = contact.rootTransform != null ? contact.rootTransform : contact.transform,
                    position = contact.position, rotation = contact.rotation });
                if (!HasEncodedSps3Scale(contact)) return placement;
                var avatar = contact.GetComponentInParent<VRCAvatarDescriptor>(true);
                if (avatar == null)
                    throw new InvalidOperationException(SensaEditorLocalization.Text("Select a supported root on this avatar."));
                return CheckedRoot(new RootPlacement { root = placement.root, position = Vector3.zero,
                    rotation = Quaternion.identity, encodedContactScale = true,
                    contactPosition = placement.position, contactRotation = placement.rotation,
                    referenceScale = avatar.transform.lossyScale.x });
            }
            throw new InvalidOperationException(SensaEditorLocalization.Text("Choose a Transform, Sensa component, SPS component or native Contact as the root target."));
        }
        private static RootPlacement CheckedRoot(RootPlacement placement)
        {
            var p = placement.position;
            var q = placement.rotation;
            var squaredLength = (double)q.x * q.x + (double)q.y * q.y + (double)q.z * q.z + (double)q.w * q.w;
            if (!Finite(p.x) || !Finite(p.y) || !Finite(p.z)
                || !Finite(q.x) || !Finite(q.y) || !Finite(q.z) || !Finite(q.w) || squaredLength <= 0
                || placement.encodedContactScale && (!Finite(placement.referenceScale) || placement.referenceScale <= 0))
                throw new InvalidOperationException(SensaEditorLocalization.Text("Configure a finite root offset and a valid root rotation."));
            // Resolve serialized Contact offsets consistently before any Transform is created.
            var length = Math.Sqrt(squaredLength);
            placement.rotation = new Quaternion((float)(q.x / length), (float)(q.y / length), (float)(q.z / length), (float)(q.w / length));
            return placement;
        }
        private static bool Finite(float value) => !float.IsNaN(value) && !float.IsInfinity(value);
        public static Placement Read(Component component) => ReadGeometry(component, true);
        private static Placement ReadGeometry(Component component, bool requireLength)
        {
            SensaSensorUtility.Uniform(component.transform);
            if(component.GetType().FullName==SocketType) {
                var method=Type("VF.Inspector.VRCFuryHapticSocketBaker").GetMethod("GetInfoFromLightsOrComponent",BindingFlags.NonPublic|BindingFlags.Static);
                if(method==null)throw new InvalidOperationException(SensaEditorLocalization.Text("Unsupported VRCFury socket geometry API; no guessed placement was generated."));
                var result=method.Invoke(null,new object[]{component,null});var t=result.GetType();
                return new Placement{source=component,position=(Vector3)t.GetProperty("Item2").GetValue(result),rotation=(Quaternion)t.GetProperty("Item3").GetValue(result)};
            }
            var sizeMethod=Type("VF.Builder.Haptics.PlugSizeDetector").GetMethod("GetWorldSize",BindingFlags.Public|BindingFlags.Static);
            if(sizeMethod==null)throw new InvalidOperationException(SensaEditorLocalization.Text("Unsupported VRCFury plug geometry API."));
            var size=sizeMethod.Invoke(null,new object[]{component});var type=size.GetType();
            var length=(float)type.GetField("worldLength").GetValue(size)/component.transform.lossyScale.x;
            if(requireLength && (float.IsNaN(length)||float.IsInfinity(length)||length<.02f))throw new InvalidOperationException(SensaEditorLocalization.Text("SPS plug length could not be resolved."));
            return new Placement{source=component,position=(Vector3)type.GetField("localPosition").GetValue(size),rotation=(Quaternion)type.GetField("localRotation").GetValue(size),length=length};
        }
    }
}
