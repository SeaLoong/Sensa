using UdonSharp;
namespace SensaLab
{
    [UdonBehaviourSyncMode(BehaviourSyncMode.None)]
    public class LabPlacementButton : UdonSharpBehaviour
    {
        public LabPlacement placement;
        public string action;
        public override void Interact() { placement.SendCustomEvent(action); }
    }
}
