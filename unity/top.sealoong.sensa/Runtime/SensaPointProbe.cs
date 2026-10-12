using UnityEngine;
using VRC.SDKBase;

namespace UnityBox.Sensa
{
    [AddComponentMenu("Sensa/Local Bone or PB Probe")]
    [DisallowMultipleComponent]
    public sealed class SensaPointProbe : MonoBehaviour, IEditorOnly
    {
        public string instanceName = "Point";
        [Tooltip("Measurement origin and axes. Defaults to this object.")]
        public Transform reference;
        [Tooltip("Local avatar bone/landmark to measure. Not required when creating a grab handle.")]
        public Transform target;
        public bool createGrabHandle;
        [Tooltip("Use four tetrahedral receivers and a known-radius local sender (Point/Handle v2). Update desktop mappings when changing this option.")]
        public bool compactTracking;
        [Range(.02f, .18f)] public float handleLength = .10f;
    }
}
