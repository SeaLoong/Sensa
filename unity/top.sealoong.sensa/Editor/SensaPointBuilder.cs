using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.Animations;
using VRC.Dynamics;
using VRC.SDK3.Dynamics.Contact.Components;
using VRC.SDK3.Dynamics.PhysBone.Components;
using nadena.dev.modular_avatar.core;
using VRC.SDK3.Avatars.Components;

namespace UnityBox.Sensa
{
    public static class SensaPointBuilder
    {
        public static void ProcessAvatar(GameObject avatar)
        {
            var all=avatar.GetComponentsInChildren<SensaPointProbe>(true);var probes=all.Where(p=>p.enabled).ToArray();
            if(probes.GroupBy(p=>p.instanceName).Any(g=>g.Count()>1))throw new InvalidOperationException("Point probe names must be unique.");
            foreach(var p in probes)Validate(p,avatar.transform);
            SensaSensorUtility.Budget(avatar,probes.Length*9);
            foreach(var p in probes)Build(p);
            foreach(var p in all)UnityEngine.Object.DestroyImmediate(p);
        }
        public static void Validate(SensaPointProbe probe,Transform avatar)
        {
            SensaSensorUtility.Name(probe.instanceName);
            var reference=probe.reference!=null?probe.reference:probe.transform;SensaSensorUtility.Uniform(reference);
            if(!reference.IsChildOf(avatar))throw new InvalidOperationException("Point reference must belong to this avatar.");
            if(!probe.createGrabHandle && (probe.target==null || !probe.target.IsChildOf(avatar)))throw new InvalidOperationException("Choose a target bone on this avatar.");
            if(probe.createGrabHandle && (float.IsNaN(probe.handleLength) || probe.handleLength<.02f || probe.handleLength>.18f))throw new InvalidOperationException("Handle length must be between 2 and 18 local cm.");
        }
        public static GameObject Build(SensaPointProbe probe)
        {
            var reference=probe.reference!=null?probe.reference:probe.transform;
            if(reference.Find("SensaPoint_"+probe.instanceName)!=null)throw new InvalidOperationException("Point probe is already generated: "+probe.instanceName);
            string tag="SensaPointV1_"+probe.instanceName;
            var avatar=reference.GetComponentInParent<VRCAvatarDescriptor>();var owner=avatar!=null?avatar.transform:reference.root;
            if(owner.GetComponentsInChildren<VRCContactSender>(true).Any(s=>s.collisionTags!=null&&s.collisionTags.Contains(tag)))throw new InvalidOperationException("Point sender identity is already used: "+probe.instanceName);
            var rig=SensaSensorUtility.Child(reference,"SensaPoint_"+probe.instanceName);
            var prefix=(probe.createGrabHandle?SensaPoseProtocol.HandlePrefix:SensaPoseProtocol.PointPrefix)+"/"+probe.instanceName+"/Self";
            var target=probe.target;
            if(probe.createGrabHandle) {
                var root=SensaSensorUtility.Child(rig,"HandleRoot");var joint=SensaSensorUtility.Child(root,"Joint");joint.localPosition=Vector3.forward*probe.handleLength*.5f;
                target=SensaSensorUtility.Child(joint,"Grip");target.localPosition=Vector3.forward*probe.handleLength*.5f;
                var pb=root.gameObject.AddComponent<VRCPhysBone>();pb.rootTransform=root;pb.radius=.015f;pb.pull=.2f;pb.spring=0;pb.maxStretch=.5f;
                pb.allowGrabbing=VRCPhysBoneBase.AdvancedBool.True;pb.allowPosing=VRCPhysBoneBase.AdvancedBool.False;pb.grabMovement=1;pb.parameter=prefix+"/Handle";
                SensaSensorUtility.Parameter(rig.gameObject,pb.parameter+"_IsGrabbed",ParameterSyncType.Bool);
                SensaSensorUtility.Parameter(rig.gameObject,pb.parameter+"_Stretch");
                var visual=GameObject.CreatePrimitive(PrimitiveType.Sphere);visual.name="Visible grip";visual.transform.SetParent(target,false);visual.transform.localScale=Vector3.one*.02f;
                UnityEngine.Object.DestroyImmediate(visual.GetComponent<Collider>());
                pb.ignoreTransforms.Add(visual.transform);
            }
            var marker=SensaSensorUtility.Child(rig,"TrackedPoint");marker.position=target.position;
            var follow=marker.gameObject.AddComponent<PositionConstraint>();follow.AddSource(new ConstraintSource{sourceTransform=target,weight=1});follow.translationOffset=Vector3.zero;follow.locked=true;follow.constraintActive=true;
            var sender=marker.gameObject.AddComponent<VRCContactSender>();sender.radius=SensaPoseProtocol.MarkerRadius;sender.localOnly=true;
            sender.collisionTags=new List<string>{tag};
            SensaSensorUtility.Array(rig,prefix,tag,true);
            return rig.gameObject;
        }
    }
}
