using UnityEngine;

namespace UnityBox.Sensa
{
    [DisallowMultipleComponent]
    [AddComponentMenu("Sensa/Spatial Pose Socket")]
    public sealed class SensaPoseSocket : MonoBehaviour
    {
        public SensaPoseProfile profile;
        [Tooltip("Unique on this avatar; used in OSC paths. +Z of this object points into the Socket.")]
        public string instanceName = "Main";
    }
}
