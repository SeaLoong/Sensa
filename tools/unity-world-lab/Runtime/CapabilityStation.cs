using UdonSharp;
using UnityEngine;
using UnityEngine.UI;
using VRC.SDK3.Dynamics.Contact.Components;
using VRC.SDK3.Dynamics.PhysBone.Components;
using VRC.SDK3.Rendering;
using VRC.SDKBase;
using com.vrcfury.udon;

namespace SensaLab
{
    [UdonBehaviourSyncMode(BehaviourSyncMode.None)]
    public class CapabilityStation : UdonSharpBehaviour
    {
        public string title;
        public int mode;
        public Transform reference, target, socket, plug;
        public VRCContactSender sender;
        public VRCContactReceiver[] receivers;
        public VRCPhysBone bone;
        public SpsSocketUdonSupport sps;
        public VRCContactReceiver spsRootReceiver,spsLengthReceiver;
        private VRCContactSender spsRootSender,spsLengthSender;
        public Text status;
        public Material encoder;
        public RenderTexture encoded;
        public GameObject output;
        public Vector3 sample;
        public float contactError, axialDepth, radialDepth;
        public float nativeLength, nativeProximity;
        public int sequence;
        private bool frozen;
        private string preset = "REST / OUTSIDE";
        private void Start()
        {
            if(plug==null)return;
            var senders=plug.GetComponentsInChildren<VRCContactSender>(true);
            for(int i=0;i<senders.Length;i++){if(senders[i].name=="Sender - Root")spsRootSender=senders[i];if(senders[i].name=="Length")spsLengthSender=senders[i];}
        }
        public void Rest() { SetPreset(0); }
        public void Near() { SetPreset(1); }
        public void Offset() { SetPreset(2); }
        public void Outside() { SetPreset(3); }
        public void Freeze() { frozen = !frozen; }
        public void ToggleOutput() { if(output != null) output.SetActive(!output.activeSelf); }
        private void SetPreset(int value)
        {
            if(socket != null)
            {
                socket.position = plug.TransformPoint(value == 1 ? new Vector3(0,0,.12f) : value == 2 ? new Vector3(.06f,0,.12f) : new Vector3(0,0,.24f));
                socket.rotation = plug.rotation;
            }
            else if(bone == null && target != null) target.position = reference.TransformPoint(value == 2 ? new Vector3(.06f,0,.1f) : value == 3 ? new Vector3(0,0,.6f) : value == 1 ? new Vector3(0,0,.05f) : new Vector3(0,0,.1f));
            preset = value == 1 ? "NEAR" : value == 2 ? "OFFSET" : value == 3 ? "OUTSIDE" : "REST / OUTSIDE";
        }
        private void Update()
        {
            if(frozen) return;
            sample = reference.InverseTransformPoint(target.position);
            string text = title + "\n" + preset + " | world-local test\n";
            if(sender != null)
            {
                sender.transform.position = target.position;
                contactError = 0;
                for(int i=0;i<receivers.Length;i++)
                {
                    float expected = Mathf.Clamp01(1-Mathf.Max(0,Vector3.Distance(receivers[i].transform.position,target.position)-sender.radius)/receivers[i].radius);
                    float actual = receivers[i].CalculateProximity(sender);
                    contactError = Mathf.Max(contactError,Mathf.Abs(actual-expected));
                    text += "A"+i+" actual "+actual.ToString("F4")+" expected "+expected.ToString("F4")+"\n";
                }
                text += "Contact max error: "+contactError.ToString("F5")+"\n";
            }
            if(bone != null) text += "PB grabbed="+bone.IsGrabbed+" stretch="+bone.Stretch.ToString("F3")+"\nRest: grabbed=false, stretch=0. Grab with VR hand.\nNo collisions; no Unity collider on this handle.\n";
            if(socket != null)
            {
                Vector3 local = plug.InverseTransformPoint(socket.position);
                axialDepth = Mathf.Clamp01(1-local.z/.2f);
                radialDepth = Mathf.Clamp01(1-local.magnitude/.2f);
                text += "20 cm SPS plug | Socket XYZ "+local.ToString("F3")+"\nAxial truth "+axialDepth.ToString("F3")+" radial estimate "+radialDepth.ToString("F3")+"\nExpected NEAR .400/.400; OFFSET .400/.329\n";
                if(spsRootSender!=null && spsLengthSender!=null && spsRootReceiver!=null)
                {
                    float rootValue=spsRootReceiver.CalculateProximity(spsRootSender),tipValue=spsLengthReceiver.CalculateProximity(spsLengthSender);
                    if(tipValue<.9999f)nativeLength=3*(tipValue-rootValue)+.01f;
                    nativeProximity=tipValue<.9999f?3*(1-tipValue):3*(1-rootValue)-nativeLength+.01f;
                    text += "Known-pair SDK SPS length="+nativeLength.ToString("F3")+"m proximity="+nativeProximity.ToString("F3")+"m\nRoot="+rootValue.ToString("F4")+" length-sphere="+tipValue.ToString("F4")+"\nLearn length OUTSIDE first; radial, not axial depth.\n";
                }
                else text+="Waiting for baked SPS native senders.\n";
            }
            if(mode == 5)
            {
                sample = new Vector3(.25f,-.5f,.75f);
                text += "Synthetic transport fixture: XYZ=(.25,-.50,.75)\nExpected bridge XYZ within 0.00004; Valid=1\nFreeze -> stale Valid=0 after 350 ms.\nThis pattern is NOT an SPS measurement.\n";
            }
            if(encoder != null)
            {
                sequence=(sequence+1)&65535;
                encoder.SetFloat("_Sequence",sequence);encoder.SetVector("_Sample",new Vector4(sample.x,sample.y,sample.z,0));
                VRCGraphics.Blit(null,encoded,encoder);
            }
            text += "Ground-truth local XYZ: "+sample.ToString("F3")+"\nWorld Udon does not export avatar OSC.\n";
            text += mode == 6 ? "SPS GPU panel: use editor capture; compare model entry/length.\nPNG bridge paths: Sensa/Lab/Shader/{X,Y,Z,Valid}\n" : "See the station manifest for Sensa paths and test steps.\n";
            status.text=text;
        }
    }
}
