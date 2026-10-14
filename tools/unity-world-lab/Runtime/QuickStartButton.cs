using UdonSharp;
namespace SensaLab
{
    [UdonBehaviourSyncMode(BehaviourSyncMode.None)]
    public class QuickStartButton : UdonSharpBehaviour
    {
        public QuickStartStation station;
        public string action;
        public override void Interact() { station.SendCustomEvent(action); }
    }
}
