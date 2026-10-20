using UdonSharp;

namespace SensaLab
{
    // Only the six dynamic HUD kinds receive this polling adapter.
    // 只有六类动态HUD附加逐帧显示适配。
    [UdonBehaviourSyncMode(BehaviourSyncMode.None)]
    public class LabLocalizedTextUpdater : UdonSharpBehaviour
    {
        public LabLocalizedText target;
        private void LateUpdate() { if (target != null) target.Present(); }
    }
}
