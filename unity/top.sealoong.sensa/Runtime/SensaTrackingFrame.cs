using UnityEngine;
using VRC.SDKBase;

namespace UnityBox.Sensa
{
    /// <summary>Editor-only settings for a moving reference plane measured in avatar-root coordinates.</summary>
    [AddComponentMenu("Sensa/Tracking Frame")]
    [DisallowMultipleComponent]
    public sealed class SensaTrackingFrame : MonoBehaviour, IEditorOnly
    {
        [Tooltip("Unique frame name, up to 40 ASCII letters, digits, '_' or '-'. Produces Origin, Forward and Right tracking instances.")]
        public string instanceName = "Frame";
        [Tooltip("Bone, marker, SPS Socket/Plug, Sensa component or native Contact on this Avatar that the reference plane follows.")]
        public Component reference;
        public SensaRootTrackingMethod trackingMethod = SensaRootTrackingMethod.FourAnchor;
        [Tooltip("Origin offset along the selected root's local axes, before the rotation offset.")]
        public Vector3 positionOffset;
        [Tooltip("Euler rotation relative to the selected root. +Z is depth, +X is right, and +Y is up.")]
        public Vector3 rotationOffset;
        [Tooltip("Distance from Origin to each axis marker, in Avatar-root authored units. The frame follows position and rotation with Avatar scale.")]
        [Range(.05f, .5f)] public float axisLength = .2f;
    }
}
