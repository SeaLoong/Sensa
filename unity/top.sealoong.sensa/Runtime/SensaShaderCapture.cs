using UnityEngine;
using VRC.SDKBase;

namespace UnityBox.Sensa
{
    [AddComponentMenu("Sensa/Shader Root Capture (Experimental)")]
    [DisallowMultipleComponent]
    public sealed class SensaShaderCapture : MonoBehaviour, IEditorOnly
    {
        public const float ProbeArmLength = .1f;
        public const float MaximumBasisComponent = 8f;
        public const float MaximumAvatarScale = 8f;
        [Tooltip("Avatar bone/Transform, SPS Socket/Plug, Sensa Component or native Contact root.")]
        public Component target;
        // Keep the original GameObject reference readable while authors move to an explicit component.
        // GameObject and Component serialized references cannot be migrated with FormerlySerializedAs.
        [HideInInspector]
        [Tooltip("Object containing one VRCFury SPS Socket or Plug.")]
        public GameObject spsTarget;
        [Range(1, 65535)]
        [Tooltip("Match this measurement ID with the desktop bridge registration.")]
        public int producerId = 1;
        [Tooltip("Desktop viewport (0 to 1). The square QR tile is centered in this rectangle; keep at least 196 pixels on its shorter side.")]
        public Rect desktopViewport = new Rect(0, 0, .25f, .2f);
    }
}
