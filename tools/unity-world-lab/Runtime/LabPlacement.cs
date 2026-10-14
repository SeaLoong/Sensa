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
        private void Init() { if(initialized)return; home=target.position;homeRotation=target.rotation;initialized=true; }
        private void Start() { Init(); Display(); }
        public void LeftHand() { Attach(1); }
        public void RightHand() { Attach(2); }
        private void Attach(int value) { Init(); Drop();hand=value;Display(); }
        public void Place() { Init(); Drop();hand=0;StopVelocity();Display(); }
        public void Home() { Init();Drop();hand=0;target.SetPositionAndRotation(home,homeRotation);StopVelocity();Display(); }
        private void Drop() { var pickup=target.GetComponent<VRC_Pickup>();if(pickup!=null)pickup.Drop(); }
        private void StopVelocity() { var body=target.GetComponent<Rigidbody>();if(body!=null){body.velocity=Vector3.zero;body.angularVelocity=Vector3.zero;} }
        private void LateUpdate()
        {
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
        private void Display() { if(status!=null)status.text=title+"\nPlacement: "+(hand==0?"WORLD / placed":hand==1?"LEFT HAND":"RIGHT HAND")+"\nLEFT / RIGHT -> hold | PLACE -> keep here | HOME -> reset\n"+instructions; }
    }
}
