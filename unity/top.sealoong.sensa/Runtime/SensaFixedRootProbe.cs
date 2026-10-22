using UnityEngine;
using VRC.SDKBase;

namespace UnityBox.Sensa
{
    [AddComponentMenu("Sensa/Four-anchor tracking")]
    [DisallowMultipleComponent]
    public sealed class SensaFixedRootProbe : MonoBehaviour, IEditorOnly
    {
        public string instanceName = "Root";
        [Tooltip("Root target: Avatar bone/marker Transform, SPS Socket/Plug, Sensa component or native Contact.")]
        public Component target;
        [Tooltip("Leave empty to derive a dedicated channel from the unique instance name. Set an explicit unique channel when needed.")]
        public string collisionChannel = "";
    }
}
