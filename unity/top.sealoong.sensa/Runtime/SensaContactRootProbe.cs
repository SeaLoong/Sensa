using System;
using UnityEngine;
using VRC.SDKBase;

namespace UnityBox.Sensa
{
    [AddComponentMenu("Sensa/Contact direct tracking (SDK Beta)")]
    [DisallowMultipleComponent]
    public sealed class SensaContactRootProbe : MonoBehaviour, IEditorOnly
    {
        public string instanceName = "Root";
        [Tooltip("Explicit SPS Socket, Plug, Sensa Component or native Contact root center.")]
        public Component target;
        [Tooltip("Unique per target; regenerate after duplicating an author.")]
        public string collisionChannel = Guid.NewGuid().ToString("N");
    }
}
