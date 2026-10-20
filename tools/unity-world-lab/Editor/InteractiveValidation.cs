using System;
using System.IO;
using System.Linq;
using UnityEngine;
using UdonSharpEditor;
using VRC.SDKBase;
using VRC.SDK3.Dynamics.Contact.Components;

namespace SensaLab
{
    public static class InteractiveValidation
    {
        [Serializable] class Report {public bool passed,nativePlugBaked,nativeSocketBaked,leftHandFollow,worldPlacementHolds,homeRestores,probeMarkersMatch;public int placements;public string scope="ClientSim Udon placement and native SPS bake; actual avatar OSC / VR hand interaction unverified";}
        static Report report;
        static LabPlacement[] props;
        static Vector3[] homes,placed;
        static Vector3 playerHome;
        public static bool Passed=>report!=null&&report.passed;
        public static void Step(int stage)
        {
            if(stage==0)
            {
                report=new Report();var root=GameObject.Find("08 MY AVATAR SPS");if(root==null)throw new InvalidOperationException(LabEditorLocalization.Text("Missing avatar SPS test area."));
                props=root.GetComponentsInChildren<LabPlacement>();report.placements=UnityEngine.Object.FindObjectsOfType<LabPlacement>().Length;
                var plug=root.transform.Find("World SPS Plug");var socket=root.transform.Find("World SPS Socket");
                var senders=plug.GetComponentsInChildren<VRCContactSender>(true);
                report.nativePlugBaked=senders.Any(s=>s.collisionTags.Contains("TPS_Pen_Root"))&&senders.Any(s=>s.collisionTags.Contains("TPS_Pen_Penetrating"));
                report.nativeSocketBaked=socket.GetComponentsInChildren<Light>(true).Length>0;
                report.probeMarkersMatch=UnityEngine.Object.FindObjectsOfType<CapabilityStation>().Where(s=>s.receivers.Length>0).All(s=>s.receivers.Select((r,i)=>r.transform.Find("Probe display")!=null&&r.transform.Find("Probe label").GetComponent<TextMesh>().text=="P"+(i+1)
                    && r.transform.Find("Probe display").GetComponent<Renderer>().sharedMaterial.color==InteractiveLab.ProbeColor(i)
                    && r.transform.Find("Probe label").GetComponent<TextMesh>().color==InteractiveLab.ProbeColor(i)
                    && Vector3.Distance(r.transform.Find("Probe display").localPosition,r.position)<.00001f).All(x=>x));
                homes=props.Select(p=>p.target.position).ToArray();playerHome=Networking.LocalPlayer.GetPosition();
                foreach(var p in props)UdonSharpEditorUtility.GetBackingUdonBehaviour(p).SendCustomEvent("LeftHand");
            }
            if(stage==1)
            {
                var player=Networking.LocalPlayer;var expected=player.GetBonePosition(HumanBodyBones.LeftHand)+player.GetBoneRotation(HumanBodyBones.LeftHand)*Vector3.forward*.12f;
                report.leftHandFollow=props.Length==2&&props.All(p=>Vector3.Distance(p.target.position,expected)<.02f);
                foreach(var p in props)UdonSharpEditorUtility.GetBackingUdonBehaviour(p).SendCustomEvent("Place");
                placed=props.Select(p=>p.target.position).ToArray();player.TeleportTo(playerHome+Vector3.right*.5f,player.GetRotation());
            }
            if(stage==2)
            {
                report.worldPlacementHolds=props.Select((p,i)=>Vector3.Distance(p.target.position,placed[i])<.02f).All(x=>x);
                foreach(var p in props)UdonSharpEditorUtility.GetBackingUdonBehaviour(p).SendCustomEvent("Home");
                report.homeRestores=props.Select((p,i)=>Vector3.Distance(p.target.position,homes[i])<.001f).All(x=>x);
                Networking.LocalPlayer.TeleportTo(playerHome,Networking.LocalPlayer.GetRotation());
                report.passed=report.nativePlugBaked&&report.nativeSocketBaked&&report.leftHandFollow&&report.worldPlacementHolds&&report.homeRestores&&report.probeMarkersMatch&&report.placements>=9;
                Directory.CreateDirectory("Validation/interaction");File.WriteAllText("Validation/interaction/world.json",JsonUtility.ToJson(report,true));
            }
        }
    }
}
