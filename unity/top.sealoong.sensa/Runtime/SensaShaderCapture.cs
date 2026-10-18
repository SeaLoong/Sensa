using UnityEngine;
using VRC.SDKBase;

namespace UnityBox.Sensa
{
    [AddComponentMenu("Sensa/Shader Root Capture (Experimental)")]
    [DisallowMultipleComponent]
    public sealed class SensaShaderCapture : MonoBehaviour, IEditorOnly
    {
        [Tooltip("包含一个 VRCFury SPS Socket 或 Plug 的对象。\nObject containing one VRCFury SPS Socket or Plug.")]
        public GameObject spsTarget;
        [Range(1, 65535)]
        [Tooltip("桌面桥必须明确固定此 ID；它不是玩家身份。\nExplicitly pin this ID in the desktop bridge; it is not player identity.")]
        public int producerId = 1;
        [Tooltip("尝试在桌面窗口输出的归一化区域；不保证 VRChat/头显合成行为。\nNormalized desktop presentation rectangle; VRChat/HMD composition is not guaranteed.")]
        public Rect desktopViewport = new Rect(0, 0, .25f, .125f);
    }
}
