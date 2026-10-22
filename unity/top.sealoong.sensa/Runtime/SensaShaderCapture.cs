using UnityEngine;
using VRC.SDKBase;

namespace UnityBox.Sensa
{
    [AddComponentMenu("Sensa/Shader Root Capture (Experimental)")]
    [DisallowMultipleComponent]
    public sealed class SensaShaderCapture : MonoBehaviour, IEditorOnly
    {
        [Tooltip("Avatar bone/Transform, SPS Socket/Plug, Sensa Component or native Contact root.")]
        public Component target;
        // Keep the original GameObject reference readable while authors move to an explicit component.
        // GameObject and Component serialized references cannot be migrated with FormerlySerializedAs.
        [HideInInspector]
        [Tooltip("Object containing one VRCFury SPS Socket or Plug.")]
        public GameObject spsTarget;
        [Range(1, 65535)]
        [Tooltip("Explicitly pin this ID in the desktop bridge; it is not player identity.")]
        public int producerId = 1;
        [Tooltip("Normalized desktop presentation rectangle; VRChat/HMD composition is not guaranteed.")]
        public Rect desktopViewport = new Rect(0, 0, .25f, .15f);
    }
}
