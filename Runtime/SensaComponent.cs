using System;
using System.Collections.Generic;
using UnityEngine;

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
        PhysBone,           // Auto-created VRCPhysBone
        Contact,            // Auto-created VRCContactReceiver (Proximity)
#if SENSA_HAS_VRCRAYCAST
        Raycast,            // Auto-created VRCRaycast (SDK >= 3.10.3)
#endif
        ExistingParameter,  // Reference an already-named VRChat parameter
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
        public float contactRadius = 0.04f;

        // Raycast
        public Transform raycastOrigin;
        public float raycastMaxRange = 0.3f;
    }

    // -----------------------------------------------------------------
    //  Main component
    // -----------------------------------------------------------------

    /// <summary>
    /// Sensa — VRChat SPS/OGB contact-sensing component.
    /// Drop onto any avatar GameObject.  The NDMF processor (or SDK
    /// pre-process callback) will read this component and inject the
    /// required VRC Contact/PhysBone components automatically.
    /// </summary>
    [AddComponentMenu("Sensa/Sensa Component")]
    [DisallowMultipleComponent]
    public class SensaComponent : MonoBehaviour
    {
        // ── Role ──────────────────────────────────────────────────────
        [Header("Role")]
        [Tooltip("Socket = orifice/receiver (被插入). Plug = penetrator/sender (插入).")]
        public BridgeRole role = BridgeRole.Socket;

        // ── Naming ────────────────────────────────────────────────────
        [Header("Naming")]
        [Tooltip("Orifice type used in OGB parameter path: OGB/Orf/{orificeType}/{instanceName}/*")]
        public OrificeType orificeType = OrificeType.Pussy;

        [Tooltip("Custom orifice type string (used when OrificeType = Custom).")]
        public string customOrificeType = "Custom";

        [Tooltip("Instance name used in OGB parameter path. Must be unique per avatar if multiple Sensa components exist.")]
        public string instanceName = "Main";

        // ── Socket config ─────────────────────────────────────────────
        [Header("Socket (Orifice) Config")]
        [Tooltip("Bone that defines the insertion axis. +Z points inward.")]
        public Transform depthAxis;

        [Tooltip("Maximum insertion depth in metres.")]
        public float socketLength = 0.15f;

        [Tooltip("Number of depth-ring VRCContactReceivers to create along the insertion axis (1..10).")]
        [Range(1, 10)]
        public int depthRingCount = 5;

        [Tooltip("Also filter for TPS_Pen_Penetrating tag to detect DPS/TPS avatars.")]
        public bool detectDps = true;

        [Tooltip("Generate AngleX / AngleY OSC parameters (four lateral proximity Contacts).")]
        public bool generateAngleParams = true;

        [Tooltip("Emit PenSelf parameter (self-insertion depth) in addition to PenOthers.")]
        public bool generateSelfParam = false;

        // ── Plug config ───────────────────────────────────────────────
        [Header("Plug (Penetrator) Config")]
        [Tooltip("Tip bone of the penetrator (used to place the SPS_Pen_Tip ContactSender).")]
        public Transform tipBone;

        [Tooltip("Root bone of the penetrator (used to place the SPS_Pen_Root ContactSender).")]
        public Transform rootBone;

        [Tooltip("Also detect self-penetration (adds a receiver for local-only depth).")]
        public bool selfPenetration = false;

        // ── Aux signals ────────────────────────────────────────────────
        [Header("Supplementary Signals")]
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
        public List<string> GetExpectedParameters()
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

            for (int i = 0; i < auxSignals.Count; i++)
            {
                var aux = auxSignals[i];
                string prefix = $"Sensa/{instanceName}/Aux{i}";
                if (aux.sourceType == AuxSignalSourceType.ExistingParameter)
                {
                    if (!string.IsNullOrEmpty(aux.existingParameterName))
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
                    list.Add(prefix);
                }
            }

            return list;
        }
    }
}
