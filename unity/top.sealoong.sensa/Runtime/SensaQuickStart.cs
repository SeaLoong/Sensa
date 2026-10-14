using UnityEngine;
using VRC.SDKBase;

namespace UnityBox.Sensa
{
    /// <summary>Build-time only receiver for the world's first-run bench.</summary>
    [AddComponentMenu("Sensa/Quick Start World Receiver")]
    [DisallowMultipleComponent]
    public sealed class SensaQuickStart : MonoBehaviour, IEditorOnly { }
}
