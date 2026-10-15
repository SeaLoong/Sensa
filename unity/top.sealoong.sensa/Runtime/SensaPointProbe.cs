using UnityEngine;
using VRC.SDKBase;

namespace UnityBox.Sensa
{
    [AddComponentMenu("Sensa/Local Bone or PB Probe")]
    [DisallowMultipleComponent]
    public sealed class SensaPointProbe : MonoBehaviour, IEditorOnly
    {
        public string instanceName = "Point";
        [Tooltip("测量原点与坐标轴；默认使用当前对象。\nMeasurement origin and axes. Defaults to this object.")]
        public Transform reference;
        [Tooltip("要测量的本地骨骼或标记；生成抓取把手时不需要。\nLocal avatar bone/landmark to measure. Not required when creating a grab handle.")]
        public Transform target;
        public bool createGrabHandle;
        [Range(.02f, .18f)] public float handleLength = .10f;
    }
}
