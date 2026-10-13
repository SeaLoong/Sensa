using UdonSharp;
using VRC.SDKBase;

namespace SensaLab
{
    [UdonBehaviourSyncMode(BehaviourSyncMode.None)]
    public class LabLocomotion : UdonSharpBehaviour
    {
        private void Start(){ApplyLocomotion();}
        public void ApplyLocomotion()
        {
            var player=Networking.LocalPlayer;
            if(player==null){SendCustomEventDelayedSeconds("ApplyLocomotion",1);return;}
            player.Immobilize(false);
            player.SetWalkSpeed(2);player.SetRunSpeed(4);player.SetStrafeSpeed(2);
            player.SetJumpImpulse(3.5f);player.SetGravityStrength(1);
        }
        public override void OnPlayerRespawn(VRCPlayerApi player){if(player.isLocal)ApplyLocomotion();}
    }
}
