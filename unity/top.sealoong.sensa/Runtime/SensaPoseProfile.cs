using UnityEngine;

namespace UnityBox.Sensa
{
    [CreateAssetMenu(menuName = "Sensa/Pose Pair Profile", fileName = "SensaPoseProfile")]
    public sealed class SensaPoseProfile : ScriptableObject
    {
        [Tooltip("双方通道必须相同；同一 Socket 阵列一次只允许一个匹配 Plug。\nBoth avatars must use the same channel. Only one matching Plug may enter a Socket array at once.")]
        public string channel = "Pair01";
        public bool receiveOthers = true;
        public bool receiveSelf = false;
    }
}
