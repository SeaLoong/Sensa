using UdonSharp;
using UnityEngine;
using UnityEngine.UI;
using VRC.SDKBase;

namespace SensaLab
{
    [UdonBehaviourSyncMode(BehaviourSyncMode.None)]
    public class LabPlacement : UdonSharpBehaviour
    {
        public Transform target;
        public Text status;
        public string title;
        public string instructions;
        public int hand;
        private Vector3 home;
        private Quaternion homeRotation;
        private bool initialized;
        // The middle of the 20 cm plug is the pivot at half insertion.
        private const float HalfLength = .10f;
        private Vector3 referenceCenter, fromCenter, toCenter;
        private Quaternion referenceRotation, fromRotation, toRotation;
        private float started;
        private bool hasReference, moving;
        private int lastAxis, direction;
        private string axisStatus = "";

        public void CaptureCenter()
        {
            Init();
            Place();
            referenceRotation = target.rotation;
            referenceCenter = target.position + referenceRotation * Vector3.forward * HalfLength;
            hasReference = true;
            lastAxis = 0;
            axisStatus = "Center captured";
            Display();
        }

        public void Center() { SelectAxis(0, "CENTER", Vector3.zero, Vector3.zero); }
        public void Depth() { SelectAxis(1, "Z / L0", Vector3.forward * .04f, Vector3.zero); }
        public void Surge() { SelectAxis(2, "Y / L1", Vector3.up * .02f, Vector3.zero); }
        public void Sway() { SelectAxis(3, "X / L2", Vector3.right * .02f, Vector3.zero); }
        public void Roll() { SelectAxis(4, "ROLL / R0", Vector3.zero, Vector3.forward * 15f); }
        public void Yaw() { SelectAxis(5, "YAW / R1", Vector3.zero, Vector3.up * 15f); }
        public void Pitch() { SelectAxis(6, "PITCH / R2", Vector3.zero, Vector3.left * 15f); }

        private void SelectAxis(int axis, string label, Vector3 offset, Vector3 angles)
        {
            if (!hasReference)
            {
                axisStatus = "Align the plug, then CAPTURE";
                Display();
                return;
            }
            Drop();
            hand = 0;
            direction = lastAxis == axis ? -direction : 1;
            lastAxis = axis;
            fromRotation = target.rotation;
            fromCenter = target.position + fromRotation * Vector3.forward * HalfLength;
            toRotation = referenceRotation * Quaternion.Euler(angles * direction);
            toCenter = referenceCenter + referenceRotation * (offset * direction);
            started = Time.time;
            moving = true;
            axisStatus = label + (axis == 0 ? "" : direction > 0 ? " +" : " -");
            StopVelocity();
            Display();
        }

        private void CancelAxis()
        {
            moving = false;
            hasReference = false;
            axisStatus = "";
        }

        private void Init() { if(initialized)return; home=target.position;homeRotation=target.rotation;initialized=true; }
        private void Start() { Init(); Display(); }
        public void LeftHand() { Attach(1); }
        public void RightHand() { Attach(2); }
        private void Attach(int value) { Init(); CancelAxis(); Drop();hand=value;Display(); }
        public void Place() { Init(); CancelAxis(); Drop();hand=0;StopVelocity();Display(); }
        public void Home() { Init();CancelAxis();Drop();hand=0;target.SetPositionAndRotation(home,homeRotation);StopVelocity();Display(); }
        private void Drop() { var pickup=target.GetComponent<VRC_Pickup>();if(pickup!=null)pickup.Drop(); }
        private void StopVelocity() { var body=target.GetComponent<Rigidbody>();if(body!=null){body.velocity=Vector3.zero;body.angularVelocity=Vector3.zero;} }
        private void ApplyAxis(float t)
        {
            var axisRotation = Quaternion.Slerp(fromRotation, toRotation, t);
            var center = Vector3.Lerp(fromCenter, toCenter, t);
            target.SetPositionAndRotation(center - axisRotation * Vector3.forward * HalfLength, axisRotation);
            moving = t < 1f;
        }

        private void LateUpdate()
        {
            if (hasReference)
            {
                var held = target.GetComponent<VRC_Pickup>();
                if (held != null && held.IsHeld) { CancelAxis(); Display(); }
                else if (moving)
                {
                    float t = Mathf.Clamp01((Time.time - started) / .6f);
                    ApplyAxis(t);
                }
            }
            if(hand==0)return;
            var pickup=target.GetComponent<VRC_Pickup>();
            if(pickup!=null&&pickup.IsHeld){hand=0;Display();return;}
            var player=Networking.LocalPlayer;
            if(!Utilities.IsValid(player)){Place();return;}
            var bone=hand==1?HumanBodyBones.LeftHand:HumanBodyBones.RightHand;
            var position=player.GetBonePosition(bone);
            if(position==Vector3.zero){Place();return;}
            var rotation=player.GetBoneRotation(bone);
            target.SetPositionAndRotation(position+rotation*Vector3.forward*.12f,rotation);StopVelocity();
        }
        public override void OnAvatarChanged(VRCPlayerApi player) { if(player!=null&&player.isLocal)Home(); }
        private void Display() { if(status!=null)status.text=title+"\nPlacement: "+(hand==0?"WORLD / placed":hand==1?"LEFT HAND":"RIGHT HAND")+(axisStatus == "" ? "" : "\n" + axisStatus)+"\nLEFT / RIGHT -> hold | PLACE -> keep here | HOME -> reset\n"+instructions; }
    }
}
