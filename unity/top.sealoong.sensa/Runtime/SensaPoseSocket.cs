using UnityEngine;
using VRC.SDKBase;

namespace UnityBox.Sensa
{
    /// <summary>Editor-only authoring settings for the paired pose receiver array. Generated native components remain after author cleanup.</summary>
    [DisallowMultipleComponent]
    [AddComponentMenu("Sensa/Spatial Pose Socket")]
    public sealed class SensaPoseSocket : MonoBehaviour, IEditorOnly
    {
        public SensaPoseProfile profile;
        [Tooltip("Unique on this avatar; used in OSC paths. +Z of this object points into the Socket.")]
        public string instanceName = "Main";
    }
}
