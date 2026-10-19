using UnityEngine;

namespace UnityBox.Sensa
{
    [DisallowMultipleComponent]
    [AddComponentMenu("Sensa/Spatial Pose Socket")]
    public sealed class SensaPoseSocket : MonoBehaviour
    {
        public SensaPoseProfile profile;
        [Tooltip("头像内须唯一，用于 OSC 路径；当前对象 +Z 朝孔内。\nUnique on this avatar; used in OSC paths. +Z of this object points into the Socket.")]
        public string instanceName = "Main";
    }
}
