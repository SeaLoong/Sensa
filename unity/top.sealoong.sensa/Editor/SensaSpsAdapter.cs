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
            ?? throw new InvalidOperationException("Install supported VRCFury SPS: missing "+name);
        public static bool IsTarget(Component c) => c!=null && (c.GetType().FullName==SocketType || c.GetType().FullName==PlugType);
        public sealed class RootPlacement { public Transform root; public Vector3 position; public Quaternion rotation; }
        public static RootPlacement ReadRoot(Component component)
        {
            if (component == null) throw new InvalidOperationException("Choose an explicit SPS root. / 请选择明确的 SPS 根部。");
            if (IsTarget(component))
            {
                var placement = ReadGeometry(component, false);
                return new RootPlacement { root = component.transform, position = placement.position, rotation = placement.rotation };
            }
            if (component is SensaComponent owned)
            {
                var root = owned.role == BridgeRole.Socket ? owned.depthAxis : owned.rootBone;
                if (root == null) throw new InvalidOperationException("Sensa root is not configured. / Sensa 根部尚未配置。");
                return new RootPlacement { root = root, rotation = Quaternion.identity };
            }
            if (component is VRC.Dynamics.ContactBase contact)
                return new RootPlacement { root = contact.rootTransform != null ? contact.rootTransform : contact.transform,
                    position = contact.position, rotation = contact.rotation };
            throw new InvalidOperationException("Unsupported explicit SPS root component. / 不支持此 SPS 根部组件。");
        }
        public static Placement Read(Component component) => ReadGeometry(component, true);
        private static Placement ReadGeometry(Component component, bool requireLength)
        {
            SensaSensorUtility.Uniform(component.transform);
            if(component.GetType().FullName==SocketType) {
                var method=Type("VF.Inspector.VRCFuryHapticSocketBaker").GetMethod("GetInfoFromLightsOrComponent",BindingFlags.NonPublic|BindingFlags.Static);
                if(method==null)throw new InvalidOperationException("Unsupported VRCFury socket geometry API; no guessed placement was generated.");
                var result=method.Invoke(null,new object[]{component,null});var t=result.GetType();
                return new Placement{source=component,position=(Vector3)t.GetProperty("Item2").GetValue(result),rotation=(Quaternion)t.GetProperty("Item3").GetValue(result)};
            }
            var sizeMethod=Type("VF.Builder.Haptics.PlugSizeDetector").GetMethod("GetWorldSize",BindingFlags.Public|BindingFlags.Static);
            if(sizeMethod==null)throw new InvalidOperationException("Unsupported VRCFury plug geometry API.");
            var size=sizeMethod.Invoke(null,new object[]{component});var type=size.GetType();
            var length=(float)type.GetField("worldLength").GetValue(size)/component.transform.lossyScale.x;
            if(requireLength && (float.IsNaN(length)||float.IsInfinity(length)||length<.02f))throw new InvalidOperationException("SPS plug length could not be resolved.");
            return new Placement{source=component,position=(Vector3)type.GetField("localPosition").GetValue(size),rotation=(Quaternion)type.GetField("localRotation").GetValue(size),length=length};
        }
    }
}
