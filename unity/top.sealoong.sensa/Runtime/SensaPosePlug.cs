using UnityEngine;
using VRC.SDKBase;

namespace UnityBox.Sensa
{
    /// <summary>Editor-only authoring settings for the paired Root, Tip and Side senders. Generated native components remain after author cleanup.</summary>
    [DisallowMultipleComponent]
    [AddComponentMenu("Sensa/Spatial Pose Plug")]
    public sealed class SensaPosePlug : MonoBehaviour, IEditorOnly
    {
        public SensaPoseProfile profile;
        [Tooltip("Root and tip locate the straight centre axis. Side establishes twist; place it off that axis.")]
        public Transform rootMarker;
        public Transform tipMarker;
        public Transform sideMarker;
    }
}
