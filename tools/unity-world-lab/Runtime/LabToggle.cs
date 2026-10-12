using UdonSharp;
namespace SensaLab
{
    [UdonBehaviourSyncMode(BehaviourSyncMode.None)]
    public class LabToggle : UdonSharpBehaviour
    {
        public LabController controller;
        public UnityEngine.GameObject target;
        public override void Interact() { if(target!=null) target.SetActive(!target.activeSelf); else controller.ToggleDesktop(); }
    }
}
