using System.Collections.Generic;
using UnityEngine;
using VRC.SDKBase;

namespace UnityBox.Sensa
{
    public enum SensaArrayPolicy { Dedicated, Exclusive, SharedRootArray }
    [AddComponentMenu("Sensa/Automatic SPS Setup")]
    [DisallowMultipleComponent]
    public sealed class SensaAutoSetup : MonoBehaviour, IEditorOnly
    {
        public string groupName = "Auto";
        public bool discoverAll = true;
        public List<GameObject> selectedTargets = new List<GameObject>();
        public List<GameObject> excludedTargets = new List<GameObject>();
        public bool socketRootTracking = true;
        public bool pairedSocketTracking;
        public bool pairedPlugMarkers;
        public bool localPlugTipTracking;
        [Tooltip("本地 Plug 尖端的参考 Socket；仅选中一个 Socket 时自动采用。\nReference Socket for local Plug-tip measurements. If exactly one Socket is selected it is chosen automatically.")]
        public GameObject localReferenceSocket;
        public bool createPlugGrabHandles;
        public string pairChannel = "Pair01";
        public SensaArrayPolicy arrayPolicy;
        private void Reset()
        {
            // Reset affects newly added components; existing serialized Dedicated setups retain their policy.
            arrayPolicy = SensaArrayPolicy.Exclusive;
            foreach(var component in GetComponents<Component>())
                if(component!=null && (component.GetType().FullName=="VF.Component.VRCFuryHapticSocket" || component.GetType().FullName=="VF.Component.VRCFuryHapticPlug"))
                {discoverAll=false;selectedTargets=new List<GameObject>{gameObject};pairedPlugMarkers=component.GetType().FullName=="VF.Component.VRCFuryHapticPlug";break;}
        }
    }
}
