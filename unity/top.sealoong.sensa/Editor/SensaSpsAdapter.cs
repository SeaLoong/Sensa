using System;
using System.Linq;
using System.Reflection;
using UnityEngine;

namespace UnityBox.Sensa
{
    public static class SensaSpsAdapter
    {
        public const string SocketType = "VF.Component.VRCFuryHapticSocket";
        public const string PlugType = "VF.Component.VRCFuryHapticPlug";
        public sealed class Placement { public Component source; public Vector3 position; public Quaternion rotation; public float length; }
        private static Type Type(string name) => AppDomain.CurrentDomain.GetAssemblies().Select(a=>a.GetType(name)).FirstOrDefault(t=>t!=null)
            ?? throw new InvalidOperationException(SensaEditorLocalization.Text("Install supported VRCFury SPS: missing ")+name);
        public static bool IsTarget(Component c) => c!=null && (c.GetType().FullName==SocketType || c.GetType().FullName==PlugType);
        public static bool IsRootTarget(Component component) => component is Transform || component is SensaComponent
            || component is VRC.Dynamics.ContactBase || IsTarget(component);
        public sealed class RootPlacement { public Transform root; public Vector3 position; public Quaternion rotation; }
        public static RootPlacement ReadRoot(Component component)
        {
            if (component == null) throw new InvalidOperationException(SensaEditorLocalization.Text("Choose a root target: a bone, marker, SPS component or Contact."));
            if (component is Transform transform)
                return new RootPlacement { root = transform, rotation = Quaternion.identity };
            if (IsTarget(component))
            {
                var placement = ReadGeometry(component, false);
                return new RootPlacement { root = component.transform, position = placement.position, rotation = placement.rotation };
            }
            if (component is SensaComponent owned)
            {
                var root = owned.role == BridgeRole.Socket ? owned.depthAxis : owned.rootBone;
                if (root == null) throw new InvalidOperationException(SensaEditorLocalization.Text("Sensa root is not configured."));
                return new RootPlacement { root = root, rotation = Quaternion.identity };
            }
            if (component is VRC.Dynamics.ContactBase contact)
                return new RootPlacement { root = contact.rootTransform != null ? contact.rootTransform : contact.transform,
                    position = contact.position, rotation = contact.rotation };
            throw new InvalidOperationException(SensaEditorLocalization.Text("Choose a Transform, Sensa component, SPS component or native Contact as the root target."));
        }
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
