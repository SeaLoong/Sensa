using UnityEngine;

namespace UnityBox.Sensa
{
    [CreateAssetMenu(menuName = "Sensa/Pose Pair Profile", fileName = "SensaPoseProfile")]
    public sealed class SensaPoseProfile : ScriptableObject
    {
        [Tooltip("Both avatars must use the same channel. Only one matching Plug may enter a Socket array at once.")]
        public string channel = "Pair01";
        public bool receiveOthers = true;
        public bool receiveSelf = false;
    }
}
