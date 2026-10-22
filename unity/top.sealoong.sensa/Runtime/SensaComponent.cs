using System;
using System.Collections.Generic;
using UnityEngine;
using VRC.SDKBase;

namespace UnityBox.Sensa
{
    // -----------------------------------------------------------------
    //  Enums
    // -----------------------------------------------------------------

    public enum BridgeRole
    {
        Socket,  // Orifice / receiver (被插入方)
        Plug,    // Penetrator / sender (插入方)
    }

    public enum OrificeType
    {
        Pussy,
        Ass,
        Mouth,
        Custom,
    }

    public enum AuxSignalSourceType
    {
        PhysBone = 0,
        Contact = 1,
        ExistingParameter = 2,
        Raycast = 3,

    }

    public enum AuxSignalRole
    {
        Vibrate,         // Drives vibration intensity
        GateEnable,      // Bool gate — disables all output when false
        DepthOverride,   // Overrides depth signal entirely
        AngleX,          // Lateral angle supplement
        AngleY,          // Vertical angle supplement
    }

    public enum PhysBoneSignal
    {
        Angle,
        Stretch,
        Squish,
        IsGrabbed,
    }

    // -----------------------------------------------------------------
    //  AuxSignal data class
    // -----------------------------------------------------------------

    [Serializable]
    public class AuxSignal
    {
        public string label = "";
        public AuxSignalSourceType sourceType = AuxSignalSourceType.Contact;
        public AuxSignalRole role = AuxSignalRole.Vibrate;

        // ExistingParameter
        public string existingParameterName = "";

        // PhysBone
        public PhysBoneSignal physBoneSignal = PhysBoneSignal.Angle;
        public Transform physBoneRoot;

        // Contact
        [Tooltip("Contact radius in this object local units. At scale 1, one unit is one metre.")]
        public float contactRadius = 0.04f;
        [Tooltip("Contact tags shared with the Sender. Choose 1–16 nonempty tags.")]
        public List<string> contactTags = new List<string> { "TPS_Pen_Penetrating" };

        // Raycast
        [Tooltip("Ray origin and direction. Uses this object when empty; local +Z points along the ray.")]
        public Transform raycastOrigin;
        [Tooltip("Maximum ray distance in metres, greater than 0 and up to 1000. Independent of origin scale.")]
        public float raycastMaxRange = 0.3f;
    }

    // -----------------------------------------------------------------
    //  Main component
    // -----------------------------------------------------------------

    /// <summary>
    /// Editor-only authoring settings for native VRChat Contact and PhysBone signals.
    /// The Sensa build pipeline reads these settings on the avatar build copy,
    /// generates native components and Animator parameters, then removes this component.
    /// </summary>
    [AddComponentMenu("Sensa/Sensa Component")]
    [DisallowMultipleComponent]
    public class SensaComponent : MonoBehaviour, IEditorOnly
    {
        // ── Role ──────────────────────────────────────────────────────
        [Tooltip("Socket = orifice/receiver. Plug = penetrator/sender.")]
        public BridgeRole role = BridgeRole.Socket;

        // ── Naming ────────────────────────────────────────────────────
        [Tooltip("Orifice type used in OGB parameter path: OGB/Orf/{orificeType}/{instanceName}/*")]
        public OrificeType orificeType = OrificeType.Pussy;

        [Tooltip("Custom orifice type string (used when OrificeType = Custom).")]
        public string customOrificeType = "Custom";

        [Tooltip("Instance name used in OGB parameter path. Must be unique per avatar if multiple Sensa components exist.")]
        public string instanceName = "Main";

        // ── Socket config ─────────────────────────────────────────────
        [Tooltip("Bone that defines the insertion axis. +Z points inward.")]
        public Transform depthAxis;

        [Tooltip("Socket range in the depth axis local units. At scale 1, one unit is one metre.")]
        public float socketLength = 0.15f;

        [Tooltip("Number of depth-ring VRCContactReceivers to create along the insertion axis (1..10).")]
        [Range(1, 10)]
        public int depthRingCount = 5;

        [Tooltip("Deprecated — TPS_Pen_Penetrating is now always included in filter tags and is the primary standard tag for all modern SPS Plugs. This field has no effect.")]
        public bool detectDps = true;

        [Tooltip("Generate AngleX / AngleY OSC parameters (four lateral proximity Contacts).")]
        public bool generateAngleParams = true;

        [Tooltip("Emit PenSelf parameter (self-insertion depth) in addition to PenOthers.")]
        public bool generateSelfParam = false;

        // ── Plug config ───────────────────────────────────────────────
        [Tooltip("Tip bone of the penetrator (places the TPS_Pen_Penetrating ContactSender).")]
        public Transform tipBone;

        [Tooltip("Root bone of the penetrator (places the TPS_Pen_Root ContactSender).")]
        public Transform rootBone;

        [Tooltip("Also detect self-penetration (adds a receiver for local-only depth).")]
        public bool selfPenetration = false;

        // ── Aux signals ────────────────────────────────────────────────
        [Tooltip("Additional PhysBone / Contact / Raycast signals. Each is wired to a device role.")]
        public List<AuxSignal> auxSignals = new List<AuxSignal>();

        // ── Helpers ────────────────────────────────────────────────────

        /// <summary>Returns the resolved orifice type string.</summary>
        public string ResolvedOrificeType =>
            orificeType == OrificeType.Custom ? customOrificeType : orificeType.ToString();

        /// <summary>OGB base path for a Socket (e.g. "OGB/Orf/Pussy/Main").</summary>
        public string OgbOrfBasePath => $"OGB/Orf/{ResolvedOrificeType}/{instanceName}";

        /// <summary>OGB base path for a Plug (e.g. "OGB/Pen/Main").</summary>
        public string OgbPenBasePath => $"OGB/Pen/{instanceName}";

        /// <summary>Returns all OSC parameter paths that this component will generate.</summary>
        public List<string> GetExpectedParameters(bool includeExistingParameters = true)
        {
            var list = new List<string>();
            if (role == BridgeRole.Socket)
            {
                list.Add($"{OgbOrfBasePath}/PenOthers");
                if (generateSelfParam) list.Add($"{OgbOrfBasePath}/PenSelf");
                // Enumerate rings using the same naming logic as SensaProcessor.
                int n = Mathf.Clamp(depthRingCount, 1, 10);
                for (int i = 0; i < n; i++)
                {
                    string paramName;
                    if (i == 0)               paramName = $"{OgbOrfBasePath}/TouchZones/Tip";
                    else if (i == n - 1)      paramName = $"{OgbOrfBasePath}/TouchZones/Root";
                    else if (n >= 3 && i == n / 2) paramName = $"{OgbOrfBasePath}/TouchZones/Middle";
                    else                      paramName = $"{OgbOrfBasePath}/TouchZones/Ring{i}";
                    list.Add(paramName);
                }
                if (generateAngleParams)
                {
                    list.Add($"{OgbOrfBasePath}/AngleRight_Raw");
                    list.Add($"{OgbOrfBasePath}/AngleLeft_Raw");
                    list.Add($"{OgbOrfBasePath}/AngleUp_Raw");
                    list.Add($"{OgbOrfBasePath}/AngleDown_Raw");
                }
            }
            else
            {
                list.Add($"{OgbPenBasePath}/PenOthers");
                if (selfPenetration) list.Add($"{OgbPenBasePath}/PenSelf");
                list.Add($"{OgbPenBasePath}/TouchOthers");
                if (selfPenetration) list.Add($"{OgbPenBasePath}/TouchSelf");
            }

            if (auxSignals == null) return list;
            for (int i = 0; i < auxSignals.Count; i++)
            {
                var aux = auxSignals[i];
                if (aux == null) continue;
                string prefix = $"Sensa/{instanceName}/Aux{i}/{aux.role}";
                if (aux.sourceType == AuxSignalSourceType.ExistingParameter)
                {
                    if (includeExistingParameters && !string.IsNullOrEmpty(aux.existingParameterName))
                        list.Add(aux.existingParameterName);
                }
                else if (aux.sourceType == AuxSignalSourceType.PhysBone)
                {
                    // Show only the selected sub-parameter, matching what SensaProcessor registers.
                    string suffix = aux.physBoneSignal switch
                    {
                        PhysBoneSignal.IsGrabbed => "_IsGrabbed",
                        PhysBoneSignal.Stretch   => "_Stretch",
                        PhysBoneSignal.Squish    => "_Squish",
                        _                        => "_Angle",
                    };
                    list.Add($"{prefix}{suffix}");
                }
                else
                {
                    #if SENSA_HAS_VRCRAYCAST
                    if (aux.sourceType == AuxSignalSourceType.Raycast)
                    {
                        list.Add(prefix + "_Hit");
                        list.Add(prefix + "_Ratio");
                        list.Add(prefix + "_Distance");
                    }
                    else
#endif
                    list.Add(prefix);
                }
            }

            return list;
        }
    }
}
