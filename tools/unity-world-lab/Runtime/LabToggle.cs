using UdonSharp;
namespace SensaLab
{
    [UdonBehaviourSyncMode(BehaviourSyncMode.None)]
    public class LabToggle : UdonSharpBehaviour
    {
        public LabController controller;
        public override void Interact() { controller.ToggleDesktop(); }
    }
}
