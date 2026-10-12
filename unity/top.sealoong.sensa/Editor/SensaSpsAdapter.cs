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
        public static Placement Read(Component component)
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
            if(float.IsNaN(length)||float.IsInfinity(length)||length<.02f)throw new InvalidOperationException("SPS plug length could not be resolved.");
            return new Placement{source=component,position=(Vector3)type.GetField("localPosition").GetValue(size),rotation=(Quaternion)type.GetField("localRotation").GetValue(size),length=length};
        }
    }
}
