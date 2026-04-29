using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEngine;
using VRC.SDK3.Avatars.Components;
using VRC.SDK3.Dynamics.Contact.Components;
using VRC.SDK3.Dynamics.PhysBone.Components;
using VRC.SDKBase.Editor.BuildPipeline;
using nadena.dev.modular_avatar.core;

#if NDMF_AVAILABLE
using nadena.dev.ndmf;
[assembly: ExportsPlugin(typeof(UnityBox.Sensa.SensaPlugin))]
#endif

namespace UnityBox.Sensa
{
    // ═══════════════════════════════════════════════════════════════════
    //  NDMF Plugin
    // ═══════════════════════════════════════════════════════════════════

#if NDMF_AVAILABLE
    public class SensaPlugin : Plugin<SensaPlugin>
    {
        public override string QualifiedName => "top.sealoong.unitybox.sensa";
        public override string DisplayName => "Sensa";

        protected override void Configure()
        {
            InPhase(BuildPhase.Generating)
                .Run("Sensa/GenerateContacts", ctx =>
                {
                    foreach (var comp in ctx.AvatarRootObject
                                            .GetComponentsInChildren<SensaComponent>(true))
                    {
                        SensaProcessor.Process(comp);
                    }
                });
        }
    }
#endif

    // ═══════════════════════════════════════════════════════════════════
    //  VRChat SDK Pre-process callback (fallback when NDMF absent)
    // ═══════════════════════════════════════════════════════════════════

    public class SensaPreprocessCallback : IVRCSDKPreprocessAvatarCallback
    {
        public int callbackOrder => -1000;

        public bool OnPreprocessAvatar(GameObject avatarGameObject)
        {
#if NDMF_AVAILABLE
            // Already handled by the NDMF plugin.
            return true;
#else
            foreach (var comp in avatarGameObject.GetComponentsInChildren<SensaComponent>(true))
                SensaProcessor.Process(comp);
            return true;
#endif
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    //  Core processor — static, callable from both paths
    // ═══════════════════════════════════════════════════════════════════

    public static class SensaProcessor
    {
        // Standard VRCFury SPS / TPS contact tags
        // Plug senders
        private const string TAG_TPS_PEN          = "TPS_Pen_Penetrating"; // Plug tip — primary tag used by all modern SPS Plugs
        private const string TAG_TPS_ROOT         = "TPS_Pen_Root";        // Plug root
        // Socket senders (used by Plug-side receivers to detect sockets)
        private const string TAG_TPS_ORF_ROOT     = "TPS_Orf_Root";
        private const string TAG_TPS_ORF_NORM     = "TPS_Orf_Norm";
        private const string TAG_SPSLL_SOCK_ROOT  = "SPSLL_Socket_Root";
        private const string TAG_SPSLL_SOCK_FRONT = "SPSLL_Socket_Front";

        public static void Process(SensaComponent comp)
        {
            if (comp == null) return;

            // Host game object for generated contacts
            var hostGo = comp.gameObject;

            var maParams = EnsureModularAvatarParameters(hostGo);
            var paramList = new List<(string name, bool isBool)>();

            if (comp.role == BridgeRole.Socket)
                BuildSocket(comp, hostGo, paramList);
            else
                BuildPlug(comp, hostGo, paramList);

            BuildAuxSignals(comp, hostGo, paramList);

            // Register all parameters via ModularAvatar (networkSynced=false)
            RegisterParameters(maParams, paramList);
        }

        // ────────────────────────────────────────────────────────────
        //  Socket build
        // ────────────────────────────────────────────────────────────

        private static void BuildSocket(SensaComponent comp, GameObject host,
                                        List<(string, bool)> paramList)
        {
            // Validate
            if (comp.depthAxis == null)
            {
                Debug.LogWarning($"[Sensa] {host.name}: depthAxis is null. Skipping socket generation.");
                return;
            }

            // TPS_Pen_Penetrating is the authoritative primary tag emitted by all modern SPS Plugs.
            // detectDps is no longer needed to gate this tag — it is always included.
            var filterTags = new List<string> { TAG_TPS_PEN };

            var containerGo = GetOrCreateChild(host, "Sensa_Socket");
            var containerTransform = containerGo.transform;
            containerTransform.SetPositionAndRotation(
                comp.depthAxis.position,
                comp.depthAxis.rotation);

            // ── Depth rings ─────────────────────────────────────────
            int   N            = Mathf.Clamp(comp.depthRingCount, 1, 10);
            float stepSize     = comp.socketLength / Mathf.Max(N - 1, 1);
            string orf         = comp.OgbOrfBasePath;

            // We use a single PenOthers parameter driven by the innermost ring that fires.
            // Actually OGB pattern: individual ring params used by PC app to reconstruct depth.
            // We'll emit ring0=entry(Tip), ring{N-1}=deepest(Root), ringMid=Middle.

            for (int i = 0; i < N; i++)
            {
                float depth   = i * stepSize;
                // Radius shrinks from 0.1 at entry to 0.03 at deepest ring
                float radius  = Mathf.Lerp(0.10f, 0.03f, (float)i / Mathf.Max(N - 1, 1));
                // Position along +Z of the depth axis
                Vector3 localPos = Vector3.forward * depth;

                string paramName = i == 0     ? $"{orf}/TouchZones/Tip"
                                 : i == N - 1 ? $"{orf}/TouchZones/Root"
                                 :              $"{orf}/TouchZones/Ring{i}";

                // Middle ring special name
                if (N >= 3 && i == N / 2)
                    paramName = $"{orf}/TouchZones/Middle";

                CreateProximityReceiver(containerTransform, $"Ring{i}", localPos,
                                        radius, filterTags, paramName,
                                        allowOthers: true, allowSelf: comp.generateSelfParam);

                paramList.Add((paramName, false));
            }

            // ── PenOthers (deepest ring acts as main depth indicator) ─
            // We also create a dedicated "PenOthers" receiver at entry so
            // PC bridge can use a single float, OGB-compatible.
            string penOthers     = $"{orf}/PenOthers";
            string penOthersAnim = $"{orf}/PenOthers_Anim";

            // Use entry-ring radius but allow others only
            CreateProximityReceiver(containerTransform, "PenOthers", Vector3.zero,
                                    0.10f, filterTags, penOthers,
                                    allowOthers: true, allowSelf: false);
            paramList.Add((penOthers,     false));
            // PenOthers_Anim is driven by an Animator layer in full OGB setups;
            // Sensa does not generate AC layers, so we do not register it.

            if (comp.generateSelfParam)
            {
                string penSelf = $"{orf}/PenSelf";
                CreateProximityReceiver(containerTransform, "PenSelf", Vector3.zero,
                                        0.10f, filterTags, penSelf,
                                        allowOthers: false, allowSelf: true);
                paramList.Add((penSelf, false));
            }

            // ── Angle receivers ──────────────────────────────────────
            if (comp.generateAngleParams)
            {
                // Four lateral receivers compare proximity to derive angle
                float aRadius = 0.06f;
                float aOffset = 0.03f; // lateral offset from axis

                CreateProximityReceiver(containerTransform, "AngleRight",
                    new Vector3( aOffset, 0, 0), aRadius, filterTags,
                    $"{orf}/AngleRight_Raw", allowOthers: true, allowSelf: false);
                CreateProximityReceiver(containerTransform, "AngleLeft",
                    new Vector3(-aOffset, 0, 0), aRadius, filterTags,
                    $"{orf}/AngleLeft_Raw", allowOthers: true, allowSelf: false);
                CreateProximityReceiver(containerTransform, "AngleUp",
                    new Vector3(0,  aOffset, 0), aRadius, filterTags,
                    $"{orf}/AngleUp_Raw", allowOthers: true, allowSelf: false);
                CreateProximityReceiver(containerTransform, "AngleDown",
                    new Vector3(0, -aOffset, 0), aRadius, filterTags,
                    $"{orf}/AngleDown_Raw", allowOthers: true, allowSelf: false);

                paramList.Add(($"{orf}/AngleRight_Raw", false));
                paramList.Add(($"{orf}/AngleLeft_Raw",  false));
                paramList.Add(($"{orf}/AngleUp_Raw",    false));
                paramList.Add(($"{orf}/AngleDown_Raw",  false));
                // AngleX / AngleY are derived by the PC bridge from the four raw params;
                // they are not VRChat parameters and should not be registered here.
            }
        }

        // ────────────────────────────────────────────────────────────
        //  Plug build
        // ────────────────────────────────────────────────────────────

        private static void BuildPlug(SensaComponent comp, GameObject host,
                                      List<(string, bool)> paramList)
        {
            if (comp.tipBone == null || comp.rootBone == null)
            {
                Debug.LogWarning($"[Sensa] {host.name}: tipBone or rootBone is null. Skipping plug generation.");
                return;
            }

            var pen = comp.OgbPenBasePath;

            var containerGo = GetOrCreateChild(host, "Sensa_Plug");
            var containerTransform = containerGo.transform;

            // ── Tip sender ───────────────────────────────────────────
            var tipGo = GetOrCreateChild(containerGo, "Tip_Sender");
            tipGo.transform.SetPositionAndRotation(comp.tipBone.position, comp.tipBone.rotation);
            var tipSender = tipGo.GetComponent<VRCContactSender>()
                            ?? tipGo.AddComponent<VRCContactSender>();
            tipSender.radius = 0.02f;
            tipSender.collisionTags = new List<string> { TAG_TPS_PEN };

            // ── Root sender ──────────────────────────────────────────
            var rootGo = GetOrCreateChild(containerGo, "Root_Sender");
            rootGo.transform.SetPositionAndRotation(comp.rootBone.position, comp.rootBone.rotation);
            var rootSender = rootGo.GetComponent<VRCContactSender>()
                             ?? rootGo.AddComponent<VRCContactSender>();
            rootSender.radius = 0.02f;
            rootSender.collisionTags = new List<string> { TAG_TPS_ROOT };

            // ── PenOthers receiver (proximity to others' socket) ─────
            // VRCFury Socket senders emit TPS_Orf_Root+SPSLL_Socket_Root (root)
            // and TPS_Orf_Norm+SPSLL_Socket_Front (forward normal).
            // OGB standard: the plug side gets "OGB/Pen/{name}/PenOthers" driven
            // by a Proximity receiver near tip that fires on the other player's socket.
            // Socket-side senders emit TPS_Orf_Root+SPSLL_Socket_Root (root) and
            // TPS_Orf_Norm+SPSLL_Socket_Front (forward normal). Filter on all four so
            // the Plug can detect any standard VRCFury Socket.
            var socketTags = new List<string>
            {
                TAG_TPS_ORF_ROOT, TAG_SPSLL_SOCK_ROOT,
                TAG_TPS_ORF_NORM, TAG_SPSLL_SOCK_FRONT
            };

            string penOthers = $"{pen}/PenOthers";
            CreateProximityReceiver(
                containerTransform, "PenOthers",
                tipGo.transform.localPosition,
                radius: 0.10f,
                filterTags: socketTags,
                paramName: penOthers,
                allowOthers: true, allowSelf: false);

            paramList.Add((penOthers, false));

            string touchOthers = $"{pen}/TouchOthers";
            CreateTouchReceiver(containerTransform, "TouchOthers",
                tipGo.transform.localPosition, 0.04f,
                socketTags,
                touchOthers, allowOthers: true, allowSelf: false);
            paramList.Add((touchOthers, true));

            if (comp.selfPenetration)
            {
                string penSelf = $"{pen}/PenSelf";
                CreateProximityReceiver(containerTransform, "PenSelf",
                    tipGo.transform.localPosition, 0.10f,
                    socketTags,
                    penSelf, allowOthers: false, allowSelf: true);
                paramList.Add((penSelf, false));

                string touchSelf = $"{pen}/TouchSelf";
                CreateTouchReceiver(containerTransform, "TouchSelf",
                    tipGo.transform.localPosition, 0.04f,
                    socketTags,
                    touchSelf, allowOthers: false, allowSelf: true);
                paramList.Add((touchSelf, true));
            }
        }

        // ────────────────────────────────────────────────────────────
        //  Auxiliary signals
        // ────────────────────────────────────────────────────────────

        private static void BuildAuxSignals(SensaComponent comp, GameObject host,
                                            List<(string, bool)> paramList)
        {
            for (int i = 0; i < comp.auxSignals.Count; i++)
            {
                var aux      = comp.auxSignals[i];
                string param = $"Sensa/{comp.instanceName}/Aux{i}";

                switch (aux.sourceType)
                {
                    case AuxSignalSourceType.PhysBone:
                        CreatePhysBone(host, aux, $"Sensa/{comp.instanceName}/Aux{i}");
                        // Register only the selected sub-parameter to avoid wasting parameter budget.
                        switch (aux.physBoneSignal)
                        {
                            case PhysBoneSignal.IsGrabbed:
                                paramList.Add(($"Sensa/{comp.instanceName}/Aux{i}_IsGrabbed", true));
                                break;
                            case PhysBoneSignal.Stretch:
                                paramList.Add(($"Sensa/{comp.instanceName}/Aux{i}_Stretch", false));
                                break;
                            case PhysBoneSignal.Squish:
                                paramList.Add(($"Sensa/{comp.instanceName}/Aux{i}_Squish", false));
                                break;
                            default: // Angle
                                paramList.Add(($"Sensa/{comp.instanceName}/Aux{i}_Angle", false));
                                break;
                        }
                        break;

                    case AuxSignalSourceType.Contact:
                        var auxGo = GetOrCreateChild(host, $"Sensa_Aux{i}");
                        CreateProximityReceiver(auxGo.transform, "Contact",
                            Vector3.zero, aux.contactRadius,
                            new List<string>(), param,
                            allowOthers: true, allowSelf: true);
                        paramList.Add((param, false));
                        break;

                    case AuxSignalSourceType.ExistingParameter:
                        // PC bridge maps the user-specified name directly
                        if (!string.IsNullOrEmpty(aux.existingParameterName))
                            paramList.Add((aux.existingParameterName, false));
                        break;

#if SENSA_HAS_VRCRAYCAST
                    case AuxSignalSourceType.Raycast:
                        CreateRaycast(host, aux, param);
                        paramList.Add(($"{param}_Hit",   true));
                        paramList.Add(($"{param}_Ratio", false));
                        break;
#endif
                }
            }
        }

        // ────────────────────────────────────────────────────────────
        //  VRC component helpers
        // ────────────────────────────────────────────────────────────

        private static VRCContactReceiver CreateProximityReceiver(
            Transform parent, string goName, Vector3 localPos, float radius,
            List<string> tags, string paramName,
            bool allowOthers, bool allowSelf)
        {
            var go   = GetOrCreateChild(parent.gameObject, goName);
            go.transform.localPosition = localPos;
            go.transform.localRotation = Quaternion.identity;

            var recv = go.GetComponent<VRCContactReceiver>()
                       ?? go.AddComponent<VRCContactReceiver>();
            recv.receiverType  = VRC.Dynamics.ContactReceiver.ReceiverType.Proximity;
            recv.radius        = radius;
            recv.collisionTags = new List<string>(tags);
            recv.parameter     = paramName;
            recv.allowOthers   = allowOthers;
            recv.allowSelf     = allowSelf;
            recv.localOnly     = false;
            return recv;
        }

        private static VRCContactReceiver CreateTouchReceiver(
            Transform parent, string goName, Vector3 localPos, float radius,
            List<string> tags, string paramName,
            bool allowOthers, bool allowSelf)
        {
            var go   = GetOrCreateChild(parent.gameObject, goName);
            go.transform.localPosition = localPos;
            go.transform.localRotation = Quaternion.identity;

            var recv = go.GetComponent<VRCContactReceiver>()
                       ?? go.AddComponent<VRCContactReceiver>();
            recv.receiverType  = VRC.Dynamics.ContactReceiver.ReceiverType.OnEnter;
            recv.radius        = radius;
            recv.collisionTags = new List<string>(tags);
            recv.parameter     = paramName;
            recv.allowOthers   = allowOthers;
            recv.allowSelf     = allowSelf;
            recv.localOnly     = false;
            return recv;
        }

        private static void CreatePhysBone(GameObject host, AuxSignal aux, string paramPrefix)
        {
            var target = aux.physBoneRoot != null ? aux.physBoneRoot.gameObject : host;
            var pb = target.GetComponent<VRCPhysBone>()
                     ?? target.AddComponent<VRCPhysBone>();
            if (!string.IsNullOrEmpty(pb.parameter) && pb.parameter != paramPrefix)
                Debug.LogWarning($"[Sensa] Overwriting existing PhysBone parameter '{pb.parameter}' on '{target.name}' with '{paramPrefix}'.");
            pb.parameter = paramPrefix;
        }

#if SENSA_HAS_VRCRAYCAST
        private static void CreateRaycast(GameObject host, AuxSignal aux, string paramPrefix)
        {
            var origin = aux.raycastOrigin != null ? aux.raycastOrigin.gameObject : host;
            var rc = origin.GetComponent<VRC.SDK3.Dynamics.Raycast.Components.VRCRaycast>()
                     ?? origin.AddComponent<VRC.SDK3.Dynamics.Raycast.Components.VRCRaycast>();
            rc.parameter   = paramPrefix;
            rc.maxDistance = aux.raycastMaxRange;
        }
#endif

        // ────────────────────────────────────────────────────────────
        //  ModularAvatar parameter registration
        // ────────────────────────────────────────────────────────────

        private static ModularAvatarParameters EnsureModularAvatarParameters(GameObject host)
        {
            var comp = host.GetComponent<ModularAvatarParameters>();
            if (comp == null) comp = host.AddComponent<ModularAvatarParameters>();
            if (comp.parameters == null)
                comp.parameters = new System.Collections.Generic.List<ParameterConfig>();
            return comp;
        }

        private static void RegisterParameters(ModularAvatarParameters maParams,
                                               List<(string name, bool isBool)> paramList)
        {
            if (maParams == null) return;

            foreach (var (name, isBool) in paramList)
            {
                if (string.IsNullOrEmpty(name)) continue;

                // Skip if already registered
                if (maParams.parameters.Any(p => p.nameOrPrefix == name)) continue;

                maParams.parameters.Add(new ParameterConfig
                {
                    nameOrPrefix           = name,
                    remapTo                = "",
                    internalParameter      = false,
                    isPrefix               = false,
                    syncType               = ParameterSyncType.NotSynced, // networkSynced=false
                    localOnly              = true,
                    defaultValue           = 0f,
                    saved                  = false,
                    hasExplicitDefaultValue = true,
                });
            }
        }

        // ────────────────────────────────────────────────────────────
        //  Utility
        // ────────────────────────────────────────────────────────────

        private static GameObject GetOrCreateChild(GameObject parent, string name)
        {
            var existing = parent.transform.Find(name);
            if (existing != null) return existing.gameObject;

            var go = new GameObject(name);
            go.transform.SetParent(parent.transform, false);
            return go;
        }
    }
}
