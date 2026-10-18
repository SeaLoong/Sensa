using UnityEngine;

namespace UnityBox.Sensa
{
    [DisallowMultipleComponent]
    [AddComponentMenu("Sensa/Spatial Pose Socket")]
    public sealed class SensaPoseSocket : MonoBehaviour
    {
        public SensaPoseProfile profile;
        [Tooltip("旧八路作者已停用；改用 SensaFixedRootProbe 并选择真实根部。\nLegacy eight-channel authoring is disabled; use SensaFixedRootProbe with an explicit root.")]
        public bool standardSpsRoot;
        [Tooltip("头像内须唯一，用于 OSC 路径；当前对象 +Z 朝孔内。\nUnique on this avatar; used in OSC paths. +Z of this object points into the Socket.")]
        public string instanceName = "Main";
    }
}
