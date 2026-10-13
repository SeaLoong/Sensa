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
        public Image[] sampleBars;
        public LineRenderer positionLine;
        public Rigidbody targetBody;
        public VRC.SDKBase.VRC_Pickup pickup;
        private float nextRefresh;
        private bool frozen;
        private bool initialized;
        private Vector3 home;
        private int homeMissingLane;
        private void EnsureHome(){if(initialized)return;home=sender.transform.localPosition;homeMissingLane=missingLane;initialized=true;}
        public override void Interact() { TogglePause(); }
        public void TogglePause() { EnsureHome();frozen=!frozen;if(frozen)status.text+="\nPAUSED - click middle cube to resume";else Refresh();nextRefresh=0; }
        public void ResetCase(){EnsureHome();if(pickup!=null)pickup.Drop();if(targetBody!=null){targetBody.velocity=Vector3.zero;targetBody.angularVelocity=Vector3.zero;}sender.transform.localPosition=home;missingLane=homeMissingLane;frozen=false;nextRefresh=0;}
        public void ToggleMissing(){EnsureHome();missingLane=missingLane<0?3:-1;frozen=false;nextRefresh=0;}
        private void Update()
        {
            if(Time.time<nextRefresh)return;
            nextRefresh=Time.time+.1f;
            if(!frozen)Refresh();
        }
        public void Refresh()
        {
            EnsureHome();
            decodedValid=true;decodedPosition=Vector3.zero;residual=0;
            string values="";
            for(int i=0;i<4;i++){
                samples[i]=i==missingLane?-1:receivers[i].CalculateProximity(sender);
                if(sampleBars!=null && sampleBars.Length==4){sampleBars[i].rectTransform.sizeDelta=new Vector2(650*Mathf.Clamp01(samples[i]),14);sampleBars[i].color=samples[i]<=.00001f || samples[i]>=.99999f?new Color(1,.35f,.25f):new Color(.2f,.8f,1);}
                values+="A"+i+"="+(samples[i]<0?"MISSING":samples[i].ToString("F3"))+"  ";
                if(samples[i]<=.00001f || samples[i]>=.99999f)decodedValid=false;
                float distance=.35f*(1-samples[i])+.001f;
                decodedPosition-=receivers[i].transform.localPosition*distance*distance;
            }
            decodedPosition/=8*.06f*.06f;
            bool samplesUsable=decodedValid;
            for(int i=0;i<4;i++){
                float distance=.35f*(1-samples[i])+.001f;
                float error=Vector3.Distance(decodedPosition,receivers[i].transform.localPosition)-distance;
                residual+=error*error;
            }
            residual=Mathf.Sqrt(residual/4);
            decodedValid=decodedValid && residual<=.002f && decodedPosition.magnitude<=.245f;
            if(positionLine!=null){positionLine.SetPosition(0,reference.position);positionLine.SetPosition(1,sender.transform.position);positionLine.startColor=positionLine.endColor=decodedValid?Color.green:Color.red;}
            bool atHome=Vector3.Distance(sender.transform.localPosition,home)<.001f && missingLane==homeMissingLane;
            status.text=caseName+"\n"+expectation+"\nSDK "+values+"\nTruth "+reference.InverseTransformPoint(sender.transform.position).ToString("F3")
                +"\nDecoded "+(decodedValid?decodedPosition.ToString("F3"):"INVALID")+" | RMS "+(samplesUsable?(residual*1000).ToString("F2")+" mm":"n/a")
                +"\n"+(atHome?(decodedValid==expectedValid?"EXPECTED RESULT":"CHECK FAILED"):"EXPLORING - reset for baseline")
                +"\nGrab white ball | Cubes: Reset / Pause / Missing A3\nLocal SDK test; not avatar OSC / device output.";
        }
    }
}
