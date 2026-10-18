using System;
using UnityEngine;
using VRC.SDKBase;

namespace UnityBox.Sensa
{
    [AddComponentMenu("Sensa/Fixed SPS Root Probe")]
    [DisallowMultipleComponent]
    public sealed class SensaFixedRootProbe : MonoBehaviour, IEditorOnly
    {
        public string instanceName = "Root";
        [Tooltip("明确选择 SPS Socket、Plug、Sensa Component 或原生 Contact 的根中心。\nExplicit SPS Socket, Plug, Sensa Component or native Contact root center.")]
        public Component target;
        [Tooltip("每个目标独有；复制作者后请重新生成。\nUnique per target; regenerate after duplicating an author.")]
        public string collisionChannel = Guid.NewGuid().ToString("N");
        [Tooltip("仅发布 Others 诊断；其 Valid 始终为 false，不用于输出。\nPublish Others diagnostics only. Their Valid stays false and cannot drive output.")]
        public bool othersDiagnostic;
    }
}
