using System;
using System.Linq;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using UnityEngine;
using UnityEngine.Animations;

namespace UnityBox.Sensa
{
    public static class SensaAutoBuilder
    {
        public static Component[] Targets(SensaAutoSetup setup,GameObject avatar) => avatar.GetComponentsInChildren<Component>(true)
            .Where(SensaSpsAdapter.IsTarget).Where(c=>!setup.excludedTargets.Contains(c.gameObject) && (setup.discoverAll || setup.selectedTargets.Contains(c.gameObject)))
            .OrderBy(c=>Path(c.transform,avatar.transform),StringComparer.Ordinal).ThenBy(c=>c.GetType().FullName,StringComparer.Ordinal).ToArray();
        private static string Path(Transform node,Transform root) => node==root?"":Path(node.parent,root)+"/"+node.name+"["+node.GetSiblingIndex()+"]";
        private static string Id(string group,Component target,GameObject avatar)
        {var label=new string(target.name.Where(c=>c<128&&char.IsLetterOrDigit(c)).Take(6).ToArray());if(label.Length==0)label="Target";using(var hash=SHA256.Create())return group+"_"+label+"_"+BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(Path(target.transform,avatar.transform)+target.GetType().FullName))).Replace("-","").Substring(0,8);}
        public static string InstanceName(SensaAutoSetup setup,Component target,GameObject avatar)=>Id(setup.groupName,target,avatar);
        public static bool HasMeasurement(SensaAutoSetup setup,Component target) => target.GetType().FullName==SensaSpsAdapter.SocketType
            ? setup.socketRootTracking || setup.pairedSocketTracking
            : setup.socketRootTracking || setup.pairedPlugMarkers || setup.localPlugTipTracking || setup.createPlugGrabHandles;
        public static int ContactCost(SensaAutoSetup setup,Component[] targets)
        {
            int sockets=targets.Count(c=>c.GetType().FullName==SensaSpsAdapter.SocketType), plugs=targets.Length-sockets;
            return (setup.socketRootTracking?targets.Length*(setup.rootTrackingMethod==SensaRootTrackingMethod.ContactDirect?2:5):0)
                +(setup.pairedSocketTracking?sockets*24:0)+plugs*((setup.pairedPlugMarkers?3:0)+(setup.localPlugTipTracking?5:0)+(setup.createPlugGrabHandles?5:0));
        }
        public static SensaSpsAdapter.Placement ReadPlacement(SensaAutoSetup setup, Component target)
        {
            bool needsLength = target.GetType().FullName == SensaSpsAdapter.PlugType
                && (setup.pairedPlugMarkers || setup.localPlugTipTracking || setup.createPlugGrabHandles);
            if (needsLength) return SensaSpsAdapter.Read(target);
            var root = SensaSpsAdapter.ReadRoot(target);
            return new SensaSpsAdapter.Placement { source = target, position = root.position, rotation = root.rotation };
        }
        public static void ProcessAvatar(GameObject avatar)
        {
            var all=avatar.GetComponentsInChildren<SensaAutoSetup>(true);var setups=all.Where(s=>s.enabled).ToArray();
            if(setups.GroupBy(s=>s.groupName).Any(g=>g.Count()>1))throw new InvalidOperationException(SensaEditorLocalization.Text("Sensa auto group names must be unique."));
            var used=new Dictionary<Component,SensaAutoSetup>();int cost=0;
            foreach(var setup in setups) {
                if(!Enum.IsDefined(typeof(SensaArrayPolicy),setup.arrayPolicy))
                    throw new InvalidOperationException(SensaEditorLocalization.Text("Unknown Sensa array policy."));
                if(!Enum.IsDefined(typeof(SensaRootTrackingMethod),setup.rootTrackingMethod))
                    throw new InvalidOperationException(SensaEditorLocalization.Text("Unknown Sensa root tracking method."));
                SensaSensorUtility.Name(setup.groupName);
                if(setup.groupName.Length>30)throw new InvalidOperationException(SensaEditorLocalization.Text("Auto group name must be at most 30 characters."));
                SensaSensorUtility.Name(setup.pairChannel);
                var targets=Targets(setup,avatar);
                if(targets.Length==0)throw new InvalidOperationException(SensaEditorLocalization.Text("No selected SPS targets for ")+setup.groupName);
                foreach(var target in targets) {
                    if(used.ContainsKey(target))throw new InvalidOperationException(SensaEditorLocalization.Text("Two automatic groups select the same SPS target."));
                    used.Add(target,setup);
                }
                cost+=ContactCost(setup,targets);
                if(setup.socketRootTracking)foreach(var target in targets) {
                    var id=Id(setup.groupName,target,avatar);
                    if(setup.rootTrackingMethod==SensaRootTrackingMethod.ContactDirect)SensaContactRootBuilder.Validate(avatar,id,target,id);
                    else SensaFixedRootBuilder.Validate(avatar,id,target,id);
                }
            }
            SensaSensorUtility.Budget(avatar,cost);
            // Root-only tracking uses the root placement. Only tip, pose and handle capabilities need Plug length.
            // 根点测量只解析根参考框；尖端、姿态与把手能力才需要 Plug 长度。
            var placements=used.ToDictionary(pair=>pair.Key,pair=>ReadPlacement(pair.Value,pair.Key));
            foreach(var setup in setups) {
                if(avatar.transform.Find("SensaAuto_"+setup.groupName)!=null)throw new InvalidOperationException(SensaEditorLocalization.Text("This auto group is already generated: ")+setup.groupName);
                var sockets=Targets(setup,avatar).Where(c=>c.GetType().FullName==SensaSpsAdapter.SocketType).ToArray();
                if(setup.localPlugTipTracking && Targets(setup,avatar).Any(c=>c.GetType().FullName==SensaSpsAdapter.PlugType)
                    && (setup.localReferenceSocket==null?sockets.Length!=1:!sockets.Any(c=>c.gameObject==setup.localReferenceSocket)))
                    throw new InvalidOperationException(SensaEditorLocalization.Text("Local tip measurement needs a selected reference Socket; choose one explicitly when there are multiple sockets."));
            }
            foreach(var setup in setups)Build(avatar,setup,Targets(setup,avatar),placements);
            foreach(var setup in all)UnityEngine.Object.DestroyImmediate(setup);
        }
        private static void Build(GameObject avatar,SensaAutoSetup setup,Component[] targets,Dictionary<Component,SensaSpsAdapter.Placement> placements)
        {
            var host=SensaSensorUtility.Child(avatar.transform,"SensaAuto_"+setup.groupName).gameObject;
            var profile=ScriptableObject.CreateInstance<SensaPoseProfile>();profile.channel=setup.pairChannel;
            var rigs=new List<GameObject>();var rigSlots=new List<int>();var names=new List<string>();
            void Track(GameObject rig,int slot){rigs.Add(rig);rigSlots.Add(slot);}
            var frames=new Dictionary<Component,Transform>();
            foreach(var target in targets){var placement=placements[target];var node=SensaSensorUtility.Child(target.transform,"Sensa_"+Id(setup.groupName,target,avatar));node.localPosition=placement.position;node.localRotation=placement.rotation;frames[target]=node;}
            var referenceCandidates=targets.Where(c=>c.GetType().FullName==SensaSpsAdapter.SocketType && (setup.localReferenceSocket==null || c.gameObject==setup.localReferenceSocket)).ToArray();
            var pointReference=referenceCandidates.Length==1?frames[referenceCandidates[0]]:null;
            foreach(var target in targets) {
                var p=placements[target];var frame=frames[target];
                string id=Id(setup.groupName,target,avatar);
                if(!HasMeasurement(setup,target))continue;
                names.Add((target.GetType().FullName==SensaSpsAdapter.SocketType?"Socket: ":"Plug: ")+target.name+" ["+(names.Count+1)+"]");
                int slot=names.Count;
                if(setup.socketRootTracking) {
                    var selector=setup.arrayPolicy==SensaArrayPolicy.Exclusive?"Sensa/Select/"+setup.groupName:null;
                    Track(setup.rootTrackingMethod==SensaRootTrackingMethod.ContactDirect
                        ? SensaContactRootBuilder.Build(avatar,id,target,id,selector,slot)
                        : SensaFixedRootBuilder.Build(avatar,id,target,id,selector,slot),slot);
                }
                if(target.GetType().FullName==SensaSpsAdapter.SocketType){
                    // Keep the placement frame alive: local Plug probes may use it as their reference.
                    var sensors=SensaSensorUtility.Child(frame,"Sensors");Track(sensors.gameObject,slot);
                    if(setup.pairedSocketTracking){var rig=SensaSensorUtility.Child(sensors,"Paired");var socket=rig.gameObject.AddComponent<SensaPoseSocket>();socket.profile=profile;socket.instanceName=id;SensaPoseBuilder.BuildSocket(socket);UnityEngine.Object.DestroyImmediate(socket);}
                }else if(setup.pairedPlugMarkers || setup.localPlugTipTracking || setup.createPlugGrabHandles){
                    Track(frame.gameObject,slot);
                    var tip=SensaSensorUtility.Child(frame,"Tip");tip.localPosition=Vector3.forward*p.length;
                    if(setup.pairedPlugMarkers){var side=SensaSensorUtility.Child(frame,"Side");side.localPosition=Vector3.right*.03f;var plug=frame.gameObject.AddComponent<SensaPosePlug>();plug.profile=profile;plug.rootMarker=frame;plug.tipMarker=tip;plug.sideMarker=side;SensaPoseBuilder.BuildPlug(plug);UnityEngine.Object.DestroyImmediate(plug);}
                    if(setup.localPlugTipTracking){var probe=frame.gameObject.AddComponent<SensaPointProbe>();probe.instanceName=id;probe.reference=pointReference;probe.target=tip;Track(SensaPointBuilder.Build(probe),slot);UnityEngine.Object.DestroyImmediate(probe);}
                    if(setup.createPlugGrabHandles){
                        // Keep the visible grip outside SPS's renderer-discovery subtree.
                        var handleFrame=SensaSensorUtility.Child(host.transform,"HandleFrame_"+id);handleFrame.position=frame.position;handleFrame.rotation=frame.rotation;handleFrame.localScale=Vector3.one*(frame.lossyScale.x/host.transform.lossyScale.x);
                        Track(handleFrame.gameObject,slot);
                        var follow=handleFrame.gameObject.AddComponent<ParentConstraint>();follow.AddSource(new ConstraintSource{sourceTransform=frame,weight=1});follow.SetTranslationOffset(0,Vector3.zero);follow.SetRotationOffset(0,Vector3.zero);follow.locked=true;follow.constraintActive=true;
                        var probe=handleFrame.gameObject.AddComponent<SensaPointProbe>();probe.instanceName=id+"_H";probe.reference=handleFrame;probe.createGrabHandle=true;probe.handleLength=Mathf.Clamp(p.length*.5f,.02f,.15f);SensaPointBuilder.Build(probe);UnityEngine.Object.DestroyImmediate(probe);
                    }
                }
            }
            if(setup.arrayPolicy==SensaArrayPolicy.Exclusive && names.Count>0)SensaSelectionAnimator.Build(avatar,host,setup.groupName,rigs.ToArray(),names.ToArray(),rigSlots:rigSlots.ToArray());
            UnityEngine.Object.DestroyImmediate(profile);
        }
    }
}
