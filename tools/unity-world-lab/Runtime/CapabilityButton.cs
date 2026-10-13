using UdonSharp;
namespace SensaLab
{
    [UdonBehaviourSyncMode(BehaviourSyncMode.None)]
    public class CapabilityButton : UdonSharpBehaviour
    {
        public CapabilityStation station;
        public string action;
        public override void Interact() { station.SendCustomEvent(action); }
    }
}
