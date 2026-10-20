using UdonSharp;
using UnityEngine;
using UnityEngine.UI;

namespace SensaLab
{
    // Presentation only; static labels have no per-frame Udon event.
    // 仅文字呈现；静态标签没有逐帧Udon事件。
    [UdonBehaviourSyncMode(BehaviourSyncMode.None)]
    public class LabLocalizedText : UdonSharpBehaviour
    {
        public Text uiText;
        public GameObject englishDisplay;
        public GameObject chineseDisplay;
        public string englishText;
        public string previewText;
        public string[] englishPhrases;
        public string[] chinesePhrases;
        public string[] protectedValues;
        public string templateMarker;
        private string lastPresentation;
        private bool chinese;
        private bool initialized;
        private void Start() { Present(); }
        public void SetChinese(bool value) { chinese = value; initialized = false; Present(); }
        public string OriginalText()
        {
            if (uiText == null) return englishText ?? "";
            string current = uiText.text;
            if (!initialized && lastPresentation == null && current == previewText) return englishText;
            return current == lastPresentation ? englishText : current;
        }
        private string Translate(string source)
        {
            if (englishPhrases == null || chinesePhrases == null) return source;
            // Protect values and slash-delimited technical tokens before translating owned prose.
            // 翻译自有文案前保护动态值，以及以斜杠分隔的路径／技术标识。
            string prefix = "\u001f";
            while (source.Contains(prefix)) prefix += "\u001f";
            string[] words = source.Split(new char[] { ' ', '\n', '\r', '\t' });
            int count = protectedValues == null ? 0 : protectedValues.Length;
            string[] values = new string[count + words.Length];
            for (int i = 0; i < count; i++) values[i] = protectedValues[i];
            for (int i = 0; i < words.Length; i++) {
                values[count + i] = "";
                if (words[i].Length < 2 || !words[i].Contains("/")) continue;
                for (int phrase = 0; phrase < englishPhrases.Length; phrase++)
                    if (!string.IsNullOrEmpty(englishPhrases[phrase]) && words[i].Contains(englishPhrases[phrase])) { values[count + i] = words[i]; break; }
            }
            string result = source;
            for (int i = 0; i < values.Length; i++)
                if (!string.IsNullOrEmpty(values[i])) result = result.Replace(values[i], prefix + i + "\u001e");
            for (int i = 0; i < englishPhrases.Length && i < chinesePhrases.Length; i++)
                if (!string.IsNullOrEmpty(englishPhrases[i])) result = result.Replace(englishPhrases[i], chinesePhrases[i]);
            for (int i = values.Length - 1; i >= 0; i--)
                if (!string.IsNullOrEmpty(values[i])) result = result.Replace(prefix + i + "\u001e", values[i]);
            return result;
        }
        public void Present()
        {
            // Static TextMesh geometry is prepared in Editor; Udon only switches its display children.
            // 静态TextMesh几何在Editor生成，Udon仅切换显示子对象。
            if (uiText == null) {
                if (englishDisplay != null) englishDisplay.SetActive(!chinese);
                if (chineseDisplay != null) chineseDisplay.SetActive(chinese);
                initialized = true;
                return;
            }
            string current = uiText.text;
            if (lastPresentation == null && current == previewText) lastPresentation = previewText;
            bool changed = current != lastPresentation;
            if (changed) englishText = current;
            if (initialized && !changed) return;
            string result = englishText ?? "";
            if (chinese && (string.IsNullOrEmpty(templateMarker) || result.Contains(templateMarker))) result = Translate(result);
            uiText.text = result;
            lastPresentation = result; initialized = true;
        }
    }
}
