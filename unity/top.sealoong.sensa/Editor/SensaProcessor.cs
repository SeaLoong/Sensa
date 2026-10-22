using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using VRC.Dynamics;
using VRC.SDK3.Avatars.Components;
using VRC.SDK3.Dynamics.Contact.Components;
using VRC.SDK3.Dynamics.PhysBone.Components;
using nadena.dev.modular_avatar.core;
using Object = UnityEngine.Object;

namespace UnityBox.Sensa
{
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

        /// <summary>Validate every enabled author before any legacy output is generated.</summary>
        public static void ValidateAvatar(GameObject avatar)
        {
            if (avatar == null) throw new ArgumentNullException(nameof(avatar));
            var components = avatar.GetComponentsInChildren<SensaComponent>(true).Where(comp => comp.enabled).ToArray();
            if (components.Length == 0) return;
            if (avatar.GetComponent<VRCAvatarDescriptor>() == null)
                throw Error("Place Sensa components under one Avatar Descriptor.");
            var names = new HashSet<string>(StringComparer.Ordinal);
            var physBones = new Dictionary<GameObject, string>();
            foreach (var comp in components)
            {
                Validate(comp, avatar);
                foreach (var name in comp.GetExpectedParameters(false))
                    if (!names.Add(name)) throw Error("Generated Sensa parameters must be unique on this avatar: {0}", name);
                foreach (var indexed in comp.auxSignals.Select((aux, index) => (aux, index)))
                    if (indexed.aux.sourceType == AuxSignalSourceType.PhysBone)
                    {
                        var target = indexed.aux.physBoneRoot != null ? indexed.aux.physBoneRoot.gameObject : comp.gameObject;
                        var prefix = AuxPrefix(comp, indexed.index, indexed.aux);
                        if (physBones.TryGetValue(target, out var existing) && existing != prefix)
                            throw Error("Each PhysBone root needs one Sensa parameter prefix; use ExistingParameter for additional readings.");
                        physBones[target] = prefix;
                    }
            }
            ValidateDeclarations(avatar, names);
            SensaSensorUtility.Budget(avatar, components.Sum(ContactCost));
        }

        public static void ProcessAvatar(GameObject avatar)
        {
            ValidateAvatar(avatar);
            foreach (var comp in avatar.GetComponentsInChildren<SensaComponent>(true))
            {
                if (comp.enabled) Generate(comp);
                Object.DestroyImmediate(comp);
            }
        }

        public static void Process(SensaComponent comp)
        {
            if (comp == null) return;
            if (!comp.enabled) { Object.DestroyImmediate(comp); return; }
            var descriptor = comp.GetComponentInParent<VRCAvatarDescriptor>(true);
            if (descriptor == null) throw Error("Place Sensa components under one Avatar Descriptor.");
            var avatar = descriptor.gameObject;
            Validate(comp, avatar);
            ValidateDeclarations(avatar, new HashSet<string>(comp.GetExpectedParameters(false), StringComparer.Ordinal));
            SensaSensorUtility.Budget(avatar, ContactCost(comp));
            Generate(comp);
            Object.DestroyImmediate(comp);
        }

        private static void Generate(SensaComponent comp)
        {
            var host = comp.gameObject;
            var parameters = new List<(string name, bool isBool)>();
            if (comp.role == BridgeRole.Socket) BuildSocket(comp, host, parameters);
            else BuildPlug(comp, host, parameters);
            BuildAuxSignals(comp, host, parameters);
            // A dedicated host keeps authored MA declarations and referenced parameters intact.
            var parameterHost = GetOrCreateChild(host, "Sensa_Parameters");
            foreach (var parameter in parameters)
                SensaSensorUtility.Parameter(parameterHost, parameter.name,
                    parameter.isBool ? ParameterSyncType.Bool : ParameterSyncType.Float);
            SensaSensorUtility.WritableParameters(parameterHost, "Sensa OGB " + comp.instanceName);
        }

        private static void Validate(SensaComponent comp, GameObject avatar)
        {
            Segment(comp.instanceName, "Sensa instance name");
            if (!Enum.IsDefined(typeof(BridgeRole), comp.role) || !Enum.IsDefined(typeof(OrificeType), comp.orificeType))
                throw Error("Choose a supported Sensa role and orifice type.");
            if (comp.role == BridgeRole.Socket) Segment(comp.ResolvedOrificeType, "Sensa orifice type");
            Owned(avatar, comp.depthAxis, "Depth axis"); Owned(avatar, comp.tipBone, "Tip bone"); Owned(avatar, comp.rootBone, "Root bone");
            if (comp.role == BridgeRole.Socket)
            {
                if (comp.depthAxis == null) throw Error("Assign a depth axis on this avatar.");
                Positive(comp.socketLength, "Socket range");
                if (comp.depthRingCount < 1 || comp.depthRingCount > 10) throw Error("Choose 1–10 depth rings.");
                SensaSensorUtility.Uniform(comp.depthAxis);
                ContactScale(comp.depthAxis, "Depth axis");
            }
            else
            {
                if (comp.tipBone == null || comp.rootBone == null) throw Error("Assign tip and root bones on this avatar.");
                SensaSensorUtility.Uniform(comp.tipBone); SensaSensorUtility.Uniform(comp.rootBone);
                ContactScale(comp.tipBone, "Tip bone"); ContactScale(comp.rootBone, "Root bone", .02f);
            }
            foreach (var name in new[] { "Sensa_Socket", "Sensa_Plug", "Sensa_Parameters" })
                if (comp.transform.Find(name) != null) throw Error("Choose an empty Sensa output namespace; this child already exists: {0}", name);
            if (comp.auxSignals == null) throw Error("Provide a supplementary signal list.");
            for (var i = 0; i < comp.auxSignals.Count; i++)
            {
                var aux = comp.auxSignals[i];
                if (aux == null || !Enum.IsDefined(typeof(AuxSignalSourceType), aux.sourceType)
                    || !Enum.IsDefined(typeof(AuxSignalRole), aux.role)) throw Error("Choose a supported supplementary signal source and role.");
                Owned(avatar, aux.physBoneRoot, "PhysBone root"); Owned(avatar, aux.raycastOrigin, "Raycast origin");
                if (comp.transform.Find("Sensa_Aux" + i) != null) throw Error("A supplementary Contact output already exists: {0}", "Sensa_Aux" + i);
                switch (aux.sourceType)
                {
                    case AuxSignalSourceType.Contact:
                        Positive(aux.contactRadius, "Contact radius"); SensaSensorUtility.Uniform(comp.transform);
                        if (aux.contactRadius * comp.transform.lossyScale.x > 3) throw Error("Keep the Contact world radius within 3 metres.");
                        if (aux.contactTags == null || aux.contactTags.Count == 0 || aux.contactTags.Any(string.IsNullOrWhiteSpace)
                            || aux.contactTags.Distinct(StringComparer.Ordinal).Count() > 16)
                            throw Error("Choose 1–16 nonempty Contact tags matching the Sender.");
                        break;
                    case AuxSignalSourceType.PhysBone:
                        if (!Enum.IsDefined(typeof(PhysBoneSignal), aux.physBoneSignal)) throw Error("Choose a supported PhysBone signal.");
                        var target = aux.physBoneRoot != null ? aux.physBoneRoot.gameObject : comp.gameObject;
                        var pb = target.GetComponent<VRCPhysBone>();
                        if (pb != null)
                        {
                            Owned(avatar, pb.rootTransform, "PhysBone root transform");
                            if (!string.IsNullOrEmpty(pb.parameter) && pb.parameter != AuxPrefix(comp, i, aux))
                                throw Error("Keep the existing PhysBone parameter and select ExistingParameter: {0}", target.name);
                        }
                        break;
                    case AuxSignalSourceType.ExistingParameter:
                        if (string.IsNullOrWhiteSpace(aux.existingParameterName) || aux.existingParameterName.Any(char.IsControl))
                            throw Error("Provide the existing Animator parameter name.");
                        break;
                    case AuxSignalSourceType.Raycast:
#if !SENSA_HAS_VRCRAYCAST
                        throw Error("Sensa Raycast requires VRChat SDK 3.10.3 or newer.");
#else
                        Positive(aux.raycastMaxRange, "Raycast range");
                        if (aux.raycastMaxRange > 1000) throw Error("Keep Raycast range within 1000 metres.");
                        var origin = aux.raycastOrigin != null ? aux.raycastOrigin : comp.transform;
                        if (origin.Find("Sensa_Raycast_" + AuxPrefix(comp, i, aux).Replace('/', '_')) != null)
                            throw Error("A supplementary Raycast output already exists on this origin.");
                        break;
#endif
                }
            }
        }

        private static void ValidateDeclarations(GameObject avatar, HashSet<string> names)
        {
            foreach (var declaration in avatar.GetComponentsInChildren<ModularAvatarParameters>(true))
                if (declaration.parameters != null)
                    foreach (var parameter in declaration.parameters)
                        if (names.Contains(parameter.nameOrPrefix)) throw Error("Generated Sensa parameter conflicts with an existing declaration: {0}", parameter.nameOrPrefix);
        }
        private static int ContactCost(SensaComponent comp) => (comp.role == BridgeRole.Socket
            ? comp.depthRingCount + 1 + (comp.generateSelfParam ? 1 : 0) + (comp.generateAngleParams ? 4 : 0)
            : 4 + (comp.selfPenetration ? 2 : 0)) + comp.auxSignals.Count(aux => aux.sourceType == AuxSignalSourceType.Contact);
        private static string AuxPrefix(SensaComponent comp, int index, AuxSignal aux) => $"Sensa/{comp.instanceName}/Aux{index}/{aux.role}";
        private static InvalidOperationException Error(string text, params object[] args) => new InvalidOperationException(SensaEditorLocalization.Format(text, args));
        private static void Positive(float value, string label)
        { if (float.IsNaN(value) || float.IsInfinity(value) || value <= 0) throw Error("{0} must be positive and finite.", SensaEditorLocalization.Text(label)); }
        private static void Segment(string value, string label)
        { if (string.IsNullOrWhiteSpace(value) || value.Contains("/") || value.Any(char.IsControl)) throw Error("{0} must be nonempty and contain no '/' or control characters.", SensaEditorLocalization.Text(label)); }
        private static void ContactScale(Transform root, string label, float radius = .1f)
        { if (float.IsNaN(root.lossyScale.x * radius) || float.IsInfinity(root.lossyScale.x * radius) || root.lossyScale.x * radius > 3) throw Error("{0} exceeds the Contact 3 m world-radius limit.", SensaEditorLocalization.Text(label)); }
        private static void Owned(GameObject avatar, Transform target, string label)
        { if (target != null && target != avatar.transform && !target.IsChildOf(avatar.transform)) throw Error("{0} must belong to this avatar.", SensaEditorLocalization.Text(label)); }

        // ────────────────────────────────────────────────────────────
        //  Socket build
        // ────────────────────────────────────────────────────────────

        private static void BuildSocket(SensaComponent comp, GameObject host,
                                        List<(string, bool)> paramList)
        {
            // TPS_Pen_Penetrating is the authoritative primary tag emitted by all modern SPS Plugs.
            // detectDps is no longer needed to gate this tag — it is always included.
            var filterTags = new List<string> { TAG_TPS_PEN };

            var containerGo = GetOrCreateChild(host, "Sensa_Socket");
            var containerTransform = containerGo.transform;

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

                CreateProximityReceiver(containerTransform, comp.depthAxis, $"Ring{i}", localPos,
                                        radius, filterTags, paramName,
                                        allowOthers: true, allowSelf: comp.generateSelfParam);

                paramList.Add((paramName, false));
            }

            // ── PenOthers (deepest ring acts as main depth indicator) ─
            // We also create a dedicated "PenOthers" receiver at entry so
            // PC bridge can use a single float, OGB-compatible.
            string penOthers     = $"{orf}/PenOthers";

            // Use entry-ring radius but allow others only
            CreateProximityReceiver(containerTransform, comp.depthAxis, "PenOthers", Vector3.zero,
                                    0.10f, filterTags, penOthers,
                                    allowOthers: true, allowSelf: false);
            paramList.Add((penOthers,     false));
            // Public native Contact parameters are declared in a local FX controller.

            if (comp.generateSelfParam)
            {
                string penSelf = $"{orf}/PenSelf";
                CreateProximityReceiver(containerTransform, comp.depthAxis, "PenSelf", Vector3.zero,
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

                CreateProximityReceiver(containerTransform, comp.depthAxis, "AngleRight",
                    new Vector3( aOffset, 0, 0), aRadius, filterTags,
                    $"{orf}/AngleRight_Raw", allowOthers: true, allowSelf: false);
                CreateProximityReceiver(containerTransform, comp.depthAxis, "AngleLeft",
                    new Vector3(-aOffset, 0, 0), aRadius, filterTags,
                    $"{orf}/AngleLeft_Raw", allowOthers: true, allowSelf: false);
                CreateProximityReceiver(containerTransform, comp.depthAxis, "AngleUp",
                    new Vector3(0,  aOffset, 0), aRadius, filterTags,
                    $"{orf}/AngleUp_Raw", allowOthers: true, allowSelf: false);
                CreateProximityReceiver(containerTransform, comp.depthAxis, "AngleDown",
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
            var pen = comp.OgbPenBasePath;

            var containerGo = GetOrCreateChild(host, "Sensa_Plug");
            var containerTransform = containerGo.transform;

            // ── Tip sender ───────────────────────────────────────────
            var tipGo = GetOrCreateChild(containerGo, "Tip_Sender");
            tipGo.transform.SetPositionAndRotation(comp.tipBone.position, comp.tipBone.rotation);
            var tipSender = tipGo.GetComponent<VRCContactSender>()
                            ?? tipGo.AddComponent<VRCContactSender>();
            tipSender.rootTransform = comp.tipBone; tipSender.position = Vector3.zero; tipSender.rotation = Quaternion.identity;
            tipSender.radius = 0.02f;
            tipSender.collisionTags = new List<string> { TAG_TPS_PEN };

            // ── Root sender ──────────────────────────────────────────
            var rootGo = GetOrCreateChild(containerGo, "Root_Sender");
            rootGo.transform.SetPositionAndRotation(comp.rootBone.position, comp.rootBone.rotation);
            var rootSender = rootGo.GetComponent<VRCContactSender>()
                             ?? rootGo.AddComponent<VRCContactSender>();
            rootSender.rootTransform = comp.rootBone; rootSender.position = Vector3.zero; rootSender.rotation = Quaternion.identity;
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
                containerTransform, comp.tipBone, "PenOthers",
                Vector3.zero,
                radius: 0.10f,
                tags: socketTags,
                paramName: penOthers,
                allowOthers: true, allowSelf: false);

            paramList.Add((penOthers, false));

            string touchOthers = $"{pen}/TouchOthers";
            CreateTouchReceiver(containerTransform, comp.tipBone, "TouchOthers",
                Vector3.zero, 0.04f,
                socketTags,
                touchOthers, allowOthers: true, allowSelf: false);
            paramList.Add((touchOthers, true));

            if (comp.selfPenetration)
            {
                string penSelf = $"{pen}/PenSelf";
                CreateProximityReceiver(containerTransform, comp.tipBone, "PenSelf",
                    Vector3.zero, 0.10f,
                    socketTags,
                    penSelf, allowOthers: false, allowSelf: true);
                paramList.Add((penSelf, false));

                string touchSelf = $"{pen}/TouchSelf";
                CreateTouchReceiver(containerTransform, comp.tipBone, "TouchSelf",
                    Vector3.zero, 0.04f,
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
#if !SENSA_HAS_VRCRAYCAST
                if (aux.sourceType == AuxSignalSourceType.Raycast)
                    throw new System.InvalidOperationException(SensaEditorLocalization.Text("Sensa Raycast requires VRChat SDK 3.10.3 or newer."));
#endif
                string param = $"Sensa/{comp.instanceName}/Aux{i}/{aux.role}";

                switch (aux.sourceType)
                {
                    case AuxSignalSourceType.PhysBone:
                        CreatePhysBone(host, aux, $"Sensa/{comp.instanceName}/Aux{i}/{aux.role}");
                        // Register only the selected sub-parameter to avoid wasting parameter budget.
                        switch (aux.physBoneSignal)
                        {
                            case PhysBoneSignal.IsGrabbed:
                                paramList.Add(($"Sensa/{comp.instanceName}/Aux{i}/{aux.role}_IsGrabbed", true));
                                break;
                            case PhysBoneSignal.Stretch:
                                paramList.Add(($"Sensa/{comp.instanceName}/Aux{i}/{aux.role}_Stretch", false));
                                break;
                            case PhysBoneSignal.Squish:
                                paramList.Add(($"Sensa/{comp.instanceName}/Aux{i}/{aux.role}_Squish", false));
                                break;
                            default: // Angle
                                paramList.Add(($"Sensa/{comp.instanceName}/Aux{i}/{aux.role}_Angle", false));
                                break;
                        }
                        break;

                    case AuxSignalSourceType.Contact:
                        var auxGo = GetOrCreateChild(host, $"Sensa_Aux{i}");
                        CreateProximityReceiver(auxGo.transform, host.transform, "Contact",
                            Vector3.zero, aux.contactRadius,
                            aux.contactTags.Distinct(StringComparer.Ordinal).ToList(), param,
                            allowOthers: true, allowSelf: true);
                        paramList.Add((param, false));
                        break;

                    case AuxSignalSourceType.ExistingParameter:
                        // The existing Animator owns its parameter type and value.
                        // A reference adds neither an expression declaration nor an FX writer.
                        break;

#if SENSA_HAS_VRCRAYCAST
                    case AuxSignalSourceType.Raycast:
                        CreateRaycast(host, aux, param);
                        paramList.Add(($"{param}_Hit",   true));
                        paramList.Add(($"{param}_Ratio", false));
                        paramList.Add(($"{param}_Distance", false));
                        break;
#endif
                }
            }
        }

        // ────────────────────────────────────────────────────────────
        //  VRC component helpers
        // ────────────────────────────────────────────────────────────

        private static VRCContactReceiver CreateProximityReceiver(
            Transform parent, Transform root, string goName, Vector3 localPos, float radius,
            List<string> tags, string paramName,
            bool allowOthers, bool allowSelf)
        {
            var go   = GetOrCreateChild(parent.gameObject, goName);
            go.transform.localPosition = localPos;
            go.transform.localRotation = Quaternion.identity;

            var recv = go.GetComponent<VRCContactReceiver>()
                       ?? go.AddComponent<VRCContactReceiver>();
            recv.rootTransform = root; recv.position = localPos; recv.rotation = Quaternion.identity;
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
            Transform parent, Transform root, string goName, Vector3 localPos, float radius,
            List<string> tags, string paramName,
            bool allowOthers, bool allowSelf)
        {
            var go   = GetOrCreateChild(parent.gameObject, goName);
            go.transform.localPosition = localPos;
            go.transform.localRotation = Quaternion.identity;

            var recv = go.GetComponent<VRCContactReceiver>()
                       ?? go.AddComponent<VRCContactReceiver>();
            recv.rootTransform = root; recv.position = localPos; recv.rotation = Quaternion.identity;
            recv.receiverType  = VRC.Dynamics.ContactReceiver.ReceiverType.Constant;
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
                throw new System.InvalidOperationException(SensaEditorLocalization.Format("Sensa cannot replace existing PhysBone parameter on '{0}'. Use ExistingParameter instead.", target.name));
            pb.parameter = paramPrefix;
        }

#if SENSA_HAS_VRCRAYCAST
        private static void CreateRaycast(GameObject host, AuxSignal aux, string paramPrefix)
        {
            var origin = aux.raycastOrigin != null ? aux.raycastOrigin.gameObject : host;
            var node = GetOrCreateChild(origin, "Sensa_Raycast_" + paramPrefix.Replace('/', '_'));
            var rc = node.GetComponent<VRCRaycast>() ?? node.AddComponent<VRCRaycast>();
            rc.RootTransform = origin.transform;
            rc.ResultTransform = GetOrCreateChild(node, "Result").transform;
            rc.Parameter = paramPrefix;
            // The configured range and native Distance report use world metres.
            rc.ApplyTransformScale = false;
            rc.Distance = aux.raycastMaxRange;
        }
#endif

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
