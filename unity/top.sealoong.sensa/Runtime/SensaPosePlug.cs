using UnityEngine;

namespace UnityBox.Sensa
{
    [DisallowMultipleComponent]
    [AddComponentMenu("Sensa/Spatial Pose Plug")]
    public sealed class SensaPosePlug : MonoBehaviour
    {
        public SensaPoseProfile profile;
        [Tooltip("Root and tip locate the straight centre axis. Side establishes twist; place it off that axis.")]
        public Transform rootMarker;
        public Transform tipMarker;
        public Transform sideMarker;
    }
}
