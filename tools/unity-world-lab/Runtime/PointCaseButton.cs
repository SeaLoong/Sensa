using UdonSharp;
namespace SensaLab
{
    [UdonBehaviourSyncMode(BehaviourSyncMode.None)]
    public class PointCaseButton : UdonSharpBehaviour
    {
        public PointCaseStation station;
        public bool toggleMissing;
        public override void Interact(){if(toggleMissing)station.ToggleMissing();else station.ResetCase();}
    }
}
