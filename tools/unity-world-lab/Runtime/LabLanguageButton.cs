using UdonSharp;
using VRC.SDKBase;

namespace SensaLab
{
    [UdonBehaviourSyncMode(BehaviourSyncMode.None)]
    public class LabLanguageButton : UdonSharpBehaviour
    {
        public string language = "auto";
        public LabLanguageController controller;
        public override void Interact()
        {
            var player = Networking.LocalPlayer;
            if (!Utilities.IsValid(player)) return;
            // Player tags are local to this client/session; there is no network or OSC command.
            // 标签只在本客户端会话内使用，不发送网络事件或OSC命令。
            player.SetPlayerTag("top.sealoong.sensa.lab-language", language);
            if (controller != null) controller.RefreshPreference();
        }
    }
}
