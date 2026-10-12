using UdonSharp;
using UnityEngine;
using UnityEngine.UI;
using VRC.SDK3.Dynamics.Contact.Components;

namespace SensaLab
{
    [UdonBehaviourSyncMode(BehaviourSyncMode.None)]
    public class PointCaseStation : UdonSharpBehaviour
    {
        public string caseName;
        public string expectation;
        public Transform reference;
        public VRCContactSender sender;
        public VRCContactReceiver[] receivers;
        public Text status;
        public int missingLane = -1;
        public bool expectedValid;
        public bool decodedValid;
        public Vector3 decodedPosition;
        public float residual;
        public float[] samples = new float[4];
        private float nextRefresh;
        private bool frozen;
        public override void Interact() { frozen=!frozen; nextRefresh=0; }
        private void Update()
        {
            if(Time.time<nextRefresh)return;
            nextRefresh=Time.time+.1f;
            if(!frozen)Refresh();
        }
        public void Refresh()
        {
            decodedValid=true;decodedPosition=Vector3.zero;residual=0;
            string values="";
            for(int i=0;i<4;i++){
                samples[i]=i==missingLane?-1:receivers[i].CalculateProximity(sender);
                values+="A"+i+"="+(samples[i]<0?"MISSING":samples[i].ToString("F3"))+"  ";
                if(samples[i]<=.00001f || samples[i]>=.99999f)decodedValid=false;
                float distance=.35f*(1-samples[i])+.001f;
                decodedPosition-=receivers[i].transform.localPosition*distance*distance;
            }
            decodedPosition/=8*.06f*.06f;
            for(int i=0;i<4;i++){
                float distance=.35f*(1-samples[i])+.001f;
                float error=Vector3.Distance(decodedPosition,receivers[i].transform.localPosition)-distance;
                residual+=error*error;
            }
            residual=Mathf.Sqrt(residual/4);
            decodedValid=decodedValid && residual<=.002f && decodedPosition.magnitude<=.245f;
            status.text=caseName+"\n"+expectation+"\nSDK "+values+"\nTruth "+reference.InverseTransformPoint(sender.transform.position).ToString("F3")
                +"\nDecoded "+(decodedValid?decodedPosition.ToString("F3"):"INVALID")+" | RMS "+(residual*1000).ToString("F2")+" mm"
                +"\n"+(decodedValid==expectedValid?"EXPECTED RESULT":"CHECK FAILED")+" | Click cube: pause/resume\nLocal SDK test; not avatar OSC / device output.";
        }
    }
}
