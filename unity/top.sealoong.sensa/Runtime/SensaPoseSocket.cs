using UnityEngine;

namespace UnityBox.Sensa
{
    [DisallowMultipleComponent]
    [AddComponentMenu("Sensa/Spatial Pose Socket")]
    public sealed class SensaPoseSocket : MonoBehaviour
    {
        public SensaPoseProfile profile;
        [Tooltip("仅诊断单侧标准 SPS 根部位置，不测尖端、朝向或行程。\nSingle-sided standard SPS root position only. Does not measure tip, orientation or stroke.")]
        public bool standardSpsRoot;
        [Tooltip("头像内须唯一，用于 OSC 路径；当前对象 +Z 朝孔内。\nUnique on this avatar; used in OSC paths. +Z of this object points into the Socket.")]
        public string instanceName = "Main";
    }
}
