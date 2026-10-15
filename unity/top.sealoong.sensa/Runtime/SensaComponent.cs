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
        [Tooltip("OGB 路径中的孔位类型。\nOrifice type used in OGB parameter path: OGB/Orf/{orificeType}/{instanceName}/*")]
        public OrificeType orificeType = OrificeType.Pussy;

        [Tooltip("Custom 类型时使用的自定义孔位字符串。\nCustom orifice type string (used when OrificeType = Custom).")]
        public string customOrificeType = "Custom";

        [Tooltip("用于 OGB 路径的实例名；同一头像中须唯一。\nInstance name used in OGB parameter path. Must be unique per avatar if multiple Sensa components exist.")]
        public string instanceName = "Main";

        // ── Socket config ─────────────────────────────────────────────
        [Header("Socket (Orifice) Config")]
        [Tooltip("定义插入轴的骨骼；+Z 朝内。\nBone that defines the insertion axis. +Z points inward.")]
        public Transform depthAxis;

        [Tooltip("最大插入深度，单位米。\nMaximum insertion depth in metres.")]
        public float socketLength = 0.15f;

        [Tooltip("沿插入轴生成的深度环接收器数量（1–10）。\nNumber of depth-ring VRCContactReceivers to create along the insertion axis (1..10).")]
        [Range(1, 10)]
        public int depthRingCount = 5;

        [Tooltip("此字段已无作用，现代 SPS Plug 的标准 TPS_Pen_Penetrating 标签始终包含在过滤中。\nDeprecated \u2014 TPS_Pen_Penetrating is now always included in filter tags and is the primary standard tag for all modern SPS Plugs. This field has no effect.")]
        public bool detectDps = true;

        [Tooltip("生成 AngleX/AngleY 参数（四个侧向近接触点）。\nGenerate AngleX / AngleY OSC parameters (four lateral proximity Contacts).")]
        public bool generateAngleParams = true;

        [Tooltip("除 PenOthers 外生成自身交互 PenSelf 参数。\nEmit PenSelf parameter (self-insertion depth) in addition to PenOthers.")]
        public bool generateSelfParam = false;

        // ── Plug config ───────────────────────────────────────────────
        [Header("Plug (Penetrator) Config")]
        [Tooltip("尖端骨骼，放置 TPS_Pen_Penetrating 发送器。\nTip bone of the penetrator (places the TPS_Pen_Penetrating ContactSender).")]
        public Transform tipBone;

        [Tooltip("根部骨骼，放置 TPS_Pen_Root 发送器。\nRoot bone of the penetrator (places the TPS_Pen_Root ContactSender).")]
        public Transform rootBone;

        [Tooltip("同时检测自身交互，增加本地深度接收器。\nAlso detect self-penetration (adds a receiver for local-only depth).")]
        public bool selfPenetration = false;

        // ── Aux signals ────────────────────────────────────────────────
        [Header("Supplementary Signals")]
        [Tooltip("额外的 PhysBone/Contact/Raycast 信号，分别映射到设备角色。\nAdditional PhysBone / Contact / Raycast signals. Each is wired to a device role.")]
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
                string prefix = $"Sensa/{instanceName}/Aux{i}/{aux.role}";
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
                    #if SENSA_HAS_VRCRAYCAST
                    if (aux.sourceType == AuxSignalSourceType.Raycast) { list.Add(prefix + "_Hit"); list.Add(prefix + "_Ratio"); }
                    else
#endif
                    list.Add(prefix);
                }
            }

            return list;
        }
    }
}
