using UdonSharp;
using VRC.SDKBase;

namespace SensaLab
{
    [UdonBehaviourSyncMode(BehaviourSyncMode.None)]
    public class LabLanguageController : UdonSharpBehaviour
    {
        public LabLocalizedText[] labels;
        private string clientLanguage = "en";
        private void Start() { clientLanguage = VRCPlayerApi.GetCurrentLanguage(); RefreshPreference(); }
        public override void OnLanguageChanged(string language) { clientLanguage = language; RefreshPreference(); }
        public bool ResolveChinese(string preference, string language)
        {
            string selected = string.IsNullOrEmpty(preference) || preference == "auto" ? language : preference;
            string normalized = (selected ?? "").ToLower().Replace('_', '-');
            return normalized == "zh" || normalized.StartsWith("zh-");
        }
        public void RefreshPreference()
        {
            string preference = "";
            var player = Networking.LocalPlayer;
            if (Utilities.IsValid(player)) preference = player.GetPlayerTag("top.sealoong.sensa.lab-language");
            bool chinese = ResolveChinese(preference, clientLanguage);
            if (labels == null) return;
            for (int i = 0; i < labels.Length; i++) if (labels[i] != null) labels[i].SetChinese(chinese);
        }
    }
}
