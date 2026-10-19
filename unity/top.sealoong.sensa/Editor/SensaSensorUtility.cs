using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using nadena.dev.modular_avatar.core;
using UnityEngine;
using UnityEditor.Animations;
using VRC.Dynamics;
using VRC.SDK3.Dynamics.Contact.Components;
using VRC.SDK3.Avatars.Components;

namespace UnityBox.Sensa
{
    public static class SensaSensorUtility
    {
        public static Transform Child(Transform parent, string name)
        { var node = new GameObject(name).transform; node.SetParent(parent, false); return node; }
        public static void Name(string value)
        { if (string.IsNullOrEmpty(value) || !Regex.IsMatch(value,"^[A-Za-z0-9_-]{1,48}$")) throw new InvalidOperationException("Sensa names require 1–48 ASCII letters, digits, '_' or '-'."); }
        public static void Uniform(Transform transform)
        {
            for(var t=transform;t!=null;t=t.parent) {
                var s=t.localScale;
                if(s.x<=0 || float.IsNaN(s.x+s.y+s.z) || float.IsInfinity(s.x+s.y+s.z) || Mathf.Abs(s.x-s.y)>.0001f*s.x || Mathf.Abs(s.x-s.z)>.0001f*s.x)
                    throw new InvalidOperationException("Sensa requires positive uniform scale: "+t.name);
            }
        }
        public static void Parameter(GameObject host,string name,ParameterSyncType type=ParameterSyncType.Float)
        {
            var avatar=host.GetComponentInParent<VRCAvatarDescriptor>();var root=avatar!=null?avatar.gameObject:host.transform.root.gameObject;
            if(root.GetComponentsInChildren<ModularAvatarParameters>(true).Any(c=>c.parameters!=null&&c.parameters.Any(p=>p.nameOrPrefix==name)))throw new InvalidOperationException("Generated Sensa parameter conflicts with an existing declaration: "+name);
            var config=host.GetComponent<ModularAvatarParameters>()??host.AddComponent<ModularAvatarParameters>();
            if(config.parameters==null) config.parameters=new List<ParameterConfig>();
            if(config.parameters.Any(p=>p.nameOrPrefix==name)) throw new InvalidOperationException("Duplicate generated parameter: "+name);
            config.parameters.Add(new ParameterConfig {nameOrPrefix=name, remapTo="",syncType=type,localOnly=true,saved=false,hasExplicitDefaultValue=true,defaultValue=0});
        }
        public static VRCContactReceiver[] Array(Transform parent,string prefix,string tag,bool self)
        {
            Uniform(parent);
            if(parent.lossyScale.x*SensaPoseProtocol.ReceiverRadius>3)throw new InvalidOperationException("Scaled receiver exceeds SDK radius limit.");
            var receivers=new List<VRCContactReceiver>();
            for(int i=0;i<4;i++) {
                int anchor=SensaPoseProtocol.PointAnchorIndex(i);
                var node=Child(parent,"A"+i);node.localPosition=new Vector3(SensaPoseProtocol.AnchorX(anchor),SensaPoseProtocol.AnchorY(anchor),SensaPoseProtocol.AnchorZ(anchor));
                var r=node.gameObject.AddComponent<VRCContactReceiver>();r.radius=SensaPoseProtocol.ReceiverRadius;r.shapeType=ContactBase.ShapeType.Sphere;
                r.receiverType=ContactReceiver.ReceiverType.Proximity;r.localOnly=true;r.allowSelf=self;r.allowOthers=!self;
                r.collisionTags=new List<string>{tag};r.parameter=prefix+"/Root/A"+i;Parameter(parent.gameObject,r.parameter);receivers.Add(r);
            }
            WritableParameters(parent.gameObject, "Sensa contacts");
            return receivers.ToArray();
        }
        // Expression declarations do not create Animator parameters that Contacts can write.
        public static void WritableParameters(GameObject host, string label)
        {
            var parameters = host.GetComponent<ModularAvatarParameters>();
            if (parameters == null || parameters.parameters == null || parameters.parameters.Count == 0) return;
            var controller = new AnimatorController { name = label };
            foreach (var parameter in parameters.parameters)
                controller.AddParameter(parameter.nameOrPrefix, parameter.syncType == ParameterSyncType.Bool
                    ? AnimatorControllerParameterType.Bool : parameter.syncType == ParameterSyncType.Int
                    ? AnimatorControllerParameterType.Int : AnimatorControllerParameterType.Float);
            var machine = new AnimatorStateMachine { name = label };
            var idle = machine.AddState("Ready"); idle.writeDefaultValues = false;
            idle.motion = new AnimationClip { name = "Sensa parameters idle" }; machine.defaultState = idle;
            controller.AddLayer(new AnimatorControllerLayer { name = label, stateMachine = machine, defaultWeight = 1 });
            var merge = host.AddComponent<ModularAvatarMergeAnimator>();
            merge.animator = controller; merge.layerType = VRCAvatarDescriptor.AnimLayerType.FX;
            merge.pathMode = MergeAnimatorPathMode.Absolute; merge.matchAvatarWriteDefaults = false;
        }
        public static void Budget(GameObject avatar,int added)
        {
            int existing=avatar.GetComponentsInChildren<VRCContactSender>(true).Length+avatar.GetComponentsInChildren<VRCContactReceiver>(true).Length;
            if(existing+added>256)throw new InvalidOperationException($"Sensa Contact budget exceeded: existing {existing} + generated {added} > 256.");
        }
    }
}
