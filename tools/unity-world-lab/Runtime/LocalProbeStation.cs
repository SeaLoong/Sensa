using UdonSharp;
using UnityEngine;
using UnityEngine.UI;
using VRC.SDK3.Dynamics.Contact.Components;
using VRC.SDK3.Dynamics.PhysBone.Components;

namespace SensaLab
{
    [UdonBehaviourSyncMode(BehaviourSyncMode.None)]
    public class LocalProbeStation : UdonSharpBehaviour
    {
        public Transform reference;
        public Transform target;
        public VRCContactSender sender;
        public VRCContactReceiver[] receivers;
        public VRCPhysBone bone;
        public Text status;
        private string[] colors={"#E85D75","#54B7FF","#77D970","#FFC857"};
        private void Update()
        {
            Vector3 local=reference.InverseTransformPoint(target.position);
            string values="";
            for(int i=0;i<receivers.Length;i++)values+="<color="+colors[i%4]+">P"+(i+1)+"="+receivers[i].CalculateProximity(sender).ToString("F3")+"</color>"+(i%4==3?"\n":"  ");
            status.text="LOCAL BONE / PB PROBE\nGrab the small sphere. No device output.\nGrabbed: "+bone.IsGrabbed+" / Stretch: "+bone.Stretch.ToString("F3")
                +"\nTarget XYZ: "+local.ToString("F3")+"\n"+values+"P = probe sample, NOT a TCode output axis.\nWorld Transform readout is ground truth,\nnot an avatar OSC export test.";
        }
    }
}
