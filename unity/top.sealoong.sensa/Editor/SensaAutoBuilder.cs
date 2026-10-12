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
        public static int ContactCost(SensaAutoSetup setup,Component[] targets)
        {
            int sockets=targets.Count(c=>c.GetType().FullName==SensaSpsAdapter.SocketType), plugs=targets.Length-sockets;
            return (setup.socketRootTracking?(setup.arrayPolicy==SensaArrayPolicy.SharedRootArray && sockets>0?8:sockets*8):0)
                +(setup.pairedSocketTracking?sockets*24:0)+plugs*((setup.pairedPlugMarkers?3:0)+(setup.localPlugTipTracking?9:0)+(setup.createPlugGrabHandles?9:0));
        }
        public static void ProcessAvatar(GameObject avatar)
        {
            var all=avatar.GetComponentsInChildren<SensaAutoSetup>(true);var setups=all.Where(s=>s.enabled).ToArray();
            if(setups.GroupBy(s=>s.groupName).Any(g=>g.Count()>1))throw new InvalidOperationException("Sensa auto group names must be unique.");
            var used=new HashSet<Component>();int cost=0;
            foreach(var setup in setups){SensaSensorUtility.Name(setup.groupName);if(setup.groupName.Length>30)throw new InvalidOperationException("Auto group name must be at most 30 characters.");SensaSensorUtility.Name(setup.pairChannel);var targets=Targets(setup,avatar);if(targets.Length==0)throw new InvalidOperationException("No selected SPS targets for "+setup.groupName);foreach(var target in targets)if(!used.Add(target))throw new InvalidOperationException("Two automatic groups select the same SPS target.");cost+=ContactCost(setup,targets);}
            SensaSensorUtility.Budget(avatar,cost);
            // Resolve all placements before generating anything. Unsupported SPS versions fail explicitly.
            var placements=used.ToDictionary(c=>c,SensaSpsAdapter.Read);
            foreach(var setup in setups) {
                if(avatar.transform.Find("SensaAuto_"+setup.groupName)!=null)throw new InvalidOperationException("This auto group is already generated: "+setup.groupName);
                var sockets=Targets(setup,avatar).Where(c=>c.GetType().FullName==SensaSpsAdapter.SocketType).ToArray();
                if(setup.localPlugTipTracking && Targets(setup,avatar).Any(c=>c.GetType().FullName==SensaSpsAdapter.PlugType)
                    && (setup.localReferenceSocket==null?sockets.Length!=1:!sockets.Any(c=>c.gameObject==setup.localReferenceSocket)))
                    throw new InvalidOperationException("Local tip measurement needs a selected reference Socket; choose one explicitly when there are multiple sockets.");
                if(setup.arrayPolicy==SensaArrayPolicy.SharedRootArray && (setup.pairedSocketTracking || !setup.socketRootTracking || sockets.Length==0 || sockets.Length>16))throw new InvalidOperationException("Shared array requires 1–16 standard-root sockets and no paired socket arrays.");
                if(setup.arrayPolicy==SensaArrayPolicy.SharedRootArray && sockets.Any(c=>Mathf.Abs(c.transform.lossyScale.x-avatar.transform.lossyScale.x)>.0001f))throw new InvalidOperationException("Shared array targets must have the same scale as the avatar root.");
            }
            foreach(var setup in setups)Build(avatar,setup,Targets(setup,avatar),placements);
            foreach(var setup in all)UnityEngine.Object.DestroyImmediate(setup);
        }
        private static void Build(GameObject avatar,SensaAutoSetup setup,Component[] targets,Dictionary<Component,SensaSpsAdapter.Placement> placements)
        {
            var host=SensaSensorUtility.Child(avatar.transform,"SensaAuto_"+setup.groupName).gameObject;
            var profile=ScriptableObject.CreateInstance<SensaPoseProfile>();profile.channel=setup.pairChannel;
            var sockets=new List<GameObject>();var anchors=new List<Transform>();var names=new List<string>();
            var frames=new Dictionary<Component,Transform>();
            foreach(var target in targets){var placement=placements[target];var node=SensaSensorUtility.Child(target.transform,"Sensa_"+Id(setup.groupName,target,avatar));node.localPosition=placement.position;node.localRotation=placement.rotation;frames[target]=node;}
            var referenceCandidates=targets.Where(c=>c.GetType().FullName==SensaSpsAdapter.SocketType && (setup.localReferenceSocket==null || c.gameObject==setup.localReferenceSocket)).ToArray();
            var pointReference=referenceCandidates.Length==1?frames[referenceCandidates[0]]:null;
            foreach(var target in targets) {
                var p=placements[target];var frame=frames[target];
                string id=Id(setup.groupName,target,avatar);
                if(target.GetType().FullName==SensaSpsAdapter.SocketType){
                    if(setup.socketRootTracking && setup.arrayPolicy!=SensaArrayPolicy.SharedRootArray)SensaSensorUtility.Array(frame,SensaPoseProtocol.SpsRootPrefix+"/"+id+"/Others",SensaPoseProtocol.SpsRootTag,false);
                    if(setup.pairedSocketTracking){var rig=SensaSensorUtility.Child(frame,"Paired");var socket=rig.gameObject.AddComponent<SensaPoseSocket>();socket.profile=profile;socket.instanceName=id;SensaPoseBuilder.BuildSocket(socket);UnityEngine.Object.DestroyImmediate(socket);}
                    anchors.Add(frame);sockets.Add(frame.gameObject);names.Add(target.name);
                }else{
                    var tip=SensaSensorUtility.Child(frame,"Tip");tip.localPosition=Vector3.forward*p.length;
                    if(setup.pairedPlugMarkers){var side=SensaSensorUtility.Child(frame,"Side");side.localPosition=Vector3.right*.03f;var plug=frame.gameObject.AddComponent<SensaPosePlug>();plug.profile=profile;plug.rootMarker=frame;plug.tipMarker=tip;plug.sideMarker=side;SensaPoseBuilder.BuildPlug(plug);UnityEngine.Object.DestroyImmediate(plug);}
                    if(setup.localPlugTipTracking){var probe=frame.gameObject.AddComponent<SensaPointProbe>();probe.instanceName=id;probe.reference=pointReference;probe.target=tip;SensaPointBuilder.Build(probe);UnityEngine.Object.DestroyImmediate(probe);}
                    if(setup.createPlugGrabHandles){
                        // Keep the visible grip outside SPS's renderer-discovery subtree.
                        var handleFrame=SensaSensorUtility.Child(host.transform,"HandleFrame_"+id);handleFrame.position=frame.position;handleFrame.rotation=frame.rotation;handleFrame.localScale=Vector3.one*(frame.lossyScale.x/host.transform.lossyScale.x);
                        var follow=handleFrame.gameObject.AddComponent<ParentConstraint>();follow.AddSource(new ConstraintSource{sourceTransform=frame,weight=1});follow.locked=true;follow.constraintActive=true;
                        var probe=handleFrame.gameObject.AddComponent<SensaPointProbe>();probe.instanceName=id+"_H";probe.reference=handleFrame;probe.createGrabHandle=true;probe.handleLength=Mathf.Clamp(p.length*.5f,.02f,.15f);SensaPointBuilder.Build(probe);UnityEngine.Object.DestroyImmediate(probe);
                    }
                }
            }
            if(setup.arrayPolicy==SensaArrayPolicy.Exclusive && sockets.Count>0)SensaSelectionAnimator.Build(avatar,host,setup.groupName,sockets.ToArray(),names.ToArray());
            if(setup.arrayPolicy==SensaArrayPolicy.SharedRootArray){
                if(setup.pairedSocketTracking || !setup.socketRootTracking || anchors.Count==0 || anchors.Count>16)throw new InvalidOperationException("Shared array requires 1–16 standard-root sockets and no paired socket arrays.");
                foreach(var anchor in anchors)if(Mathf.Abs(anchor.lossyScale.x-avatar.transform.lossyScale.x)>.0001f)throw new InvalidOperationException("Shared array targets must have the same scale as the avatar root; use Dedicated for scaled sockets.");
                var moving=SensaSensorUtility.Child(host.transform,"SharedReference");var follow=moving.gameObject.AddComponent<ParentConstraint>();foreach(var anchor in anchors)follow.AddSource(new ConstraintSource{sourceTransform=anchor,weight=0});follow.locked=true;follow.constraintActive=true;
                var array=SensaSensorUtility.Child(moving,"Receivers");var prefix=SensaPoseProtocol.SharedRootPrefix+"/"+setup.groupName+"/Others";SensaSensorUtility.Array(array,prefix,SensaPoseProtocol.SpsRootTag,false);
                SensaSelectionAnimator.Build(avatar,host,setup.groupName,new[]{array.gameObject},names.ToArray(),follow,prefix);
            }
            UnityEngine.Object.DestroyImmediate(profile);
        }
    }
}
