using UnityEngine;

namespace UnityBox.Sensa
{
    [DisallowMultipleComponent]
    [AddComponentMenu("Sensa/Spatial Pose Plug")]
    public sealed class SensaPosePlug : MonoBehaviour
    {
        public SensaPoseProfile profile;
        [Tooltip("Root 与 Tip 确定直线轴，Side 需偏离该轴以确定扭转。\nRoot and tip locate the straight centre axis. Side establishes twist; place it off that axis.")]
        public Transform rootMarker;
        public Transform tipMarker;
        public Transform sideMarker;
    }
}
