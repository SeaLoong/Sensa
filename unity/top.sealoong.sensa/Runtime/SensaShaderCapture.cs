using UnityEngine;
using VRC.SDKBase;

namespace UnityBox.Sensa
{
    [AddComponentMenu("Sensa/Shader Root Capture (Experimental)")]
    [DisallowMultipleComponent]
    public sealed class SensaShaderCapture : MonoBehaviour, IEditorOnly
    {
        [Tooltip("Object containing one VRCFury SPS Socket or Plug.")]
        public GameObject spsTarget;
        [Range(1, 65535)]
        [Tooltip("Explicitly pin this ID in the desktop bridge; it is not player identity.")]
        public int producerId = 1;
        [Tooltip("Normalized desktop presentation rectangle; VRChat/HMD composition is not guaranteed.")]
        public Rect desktopViewport = new Rect(0, 0, .25f, .125f);
    }
}
