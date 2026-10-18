# OGB and SPS parameter compatibility

[简体中文](ogb-compatibility.md) | **English**

Sensa uses one OGB depth interpretation for existing Socket and Plug parameters. Selection follows **observed parameter capabilities**, rather than SPS/OGB product names or version numbers. The result is a normalized device target. Even modern Socket signals provide a radial estimate, not measured insertion depth, world coordinates or deformed mesh positions.

This research checks official OGB v1.0.0, v2.1.30 and a pinned VRCFury main commit. OGB v1.0.0 already supports Root/Tip and legacy fallback: “old OGB has only one trigger” is not a universal version distinction. [Old OGB implementation](https://github.com/OscToys/OscGoesBrrr/blob/262164576721f12958409638851808aa662b87c7/src/main/GameDevice.ts#L68-L151), [current OGB implementation](https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/src/main/GameDevice.ts#L63-L150).

## Parameter and capability matrix

Paths below omit VRChat's `/avatar/parameters/` prefix. Sensa preserves complete instance parents, including nested paths; matching final segments do not merge instances. Modern VRCFury replaces slashes inside its generated instance names with underscores.

| Observed parameters | Interpretation | Available result |
| --- | --- | --- |
| `OGB/Orf/<instance>/PenOthersNewRoot` and matching `PenOthersNewTip` | Modern Socket pair | Learn length while unsaturated, then estimate a normalized radial fraction |
| `OGB/Orf/<instance>/PenOthers` | Legacy Socket proximity | Raw 0–1 intensity, gated by PenOthersClose when present |
| `OGB/Pen/<instance>/PenOthers` | Plug proximity | Raw 0–1 intensity, without default inversion |
| Corresponding `PenSelf...` | Separate self interaction | Never paired with Others; built-in defaults select Others |
| `TouchSelf`, `TouchOthers`, `FrotOthers` | Touch/frottage | Separate from depth, with the Close conditions below |

Modern Socket receivers share the Socket root and a 1 m radius. NewRoot detects the Plug root sphere. NewTip detects a sphere centred at the Plug root with a radius equal to Plug length: **it is not a tip landmark**. Legacy Socket PenOthers instead uses a receiver shifted backwards by its configured depth, with that depth as its radius. It cannot serve as a third Root/Tip coordinate. [Socket generator](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticSocketsService.cs#L193-L272).

Plug PenSelf/PenOthers receivers sit at the root, use Plug length as their radius and detect Socket root tags. Under ideal alignment, proximity increases toward the Plug root; applying a shared inversion would be incorrect. The Plug length Sender and 1 cm root Sender are also concentric, with world-scale conversion. [Plug receivers](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticPlugsService.cs#L175-L255), [Plug Senders](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Inspector/VRCFuryHapticPlugBaker.cs#L60-L108), [world-scale conversion](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Builder/Haptics/HapticSenderFactory.cs#L24-L40).

A single parameter here is a Proximity float, rather than an OnEnter pulse. VRChat evaluates proximity using the closest Sender surface to each Receiver's centre. Multiple Receivers independently choose their nearest Sender. [VRChat Contacts](https://creators.vrchat.com/common-components/contacts/).

## Unified selection

The built-in depth mapping uses `sourceMode: OgbDepth` and these default paths:

```text
OGB/Orf/**/PenOthersNewRoot;OGB/Orf/**/PenOthers;OGB/Pen/**/PenOthers
```

Tip and Close do not need additional mappings. The interpreter groups by **OSC source key + complete parent path + Self/Others** and produces one depth candidate per group, preventing legacy strength from competing with its own modern pair.

1. Any positive modern Socket channel selects the modern pair. Missing/invalid coordinates or unknown length produce zero, without filling from a high legacy value.
2. Missing or zero modern channels permit legacy PenSelf/PenOthers. An existing, closed Orf PenOthersClose suppresses legacy PenOthers. Legacy configurations with no Close parameter remain readable.
3. Plug PenSelf/PenOthers retain their original direction. Plug paths never become Socket Root coordinates.
4. Tip/Close updates reevaluate the related mapping. Avatar changes, mapping rebuilds and OSC input reactivation clear learned lengths, since the Plug may have changed while input was disarmed.
5. No Trigger/Depth leaf aliases are guessed. Official OGB also has native TPS Depth_In/RootRoot branches; those are separate parameters, not interchangeable OGB names. This interpreter does not rename them into a pair; custom signals can use explicit direct mapping.

The first two rules follow official capability priority. Sensa additionally returns zero when only one positive modern channel is available; upstream enters its modern branch only with a numeric pair. [Official selection](https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/src/main/GameDevice.ts#L63-L149). Project implementation: [address parsing](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/OgbDepthAddress.cs), [runtime routing](https://github.com/SeaLoong/Sensa/blob/main/src/Runtime/MotionRuntime.cs).

Existing SpsSocketDepth configurations still read modern pairs; new mappings should prefer OgbDepth. Legacy Socket proximity is not relabelled as a value normalized against the other Plug's length. Candidates from different instances still enter axis mixing independently; mixing does not establish that they describe the same object.

## Modern Socket model

Sensa independently models the generated sphere geometry; it does not copy OGB's sampling-window algorithm. Let pRoot/pTip be the two proximities and `r = 0.01 m` the root Sender radius. With two 1 m receivers, unsaturated geometry approximately gives:

```text
Plug length L ≈ pTip − pRoot + r
Root-centre distance d ≈ 1 − pRoot + r
Radial fraction q = clamp(1 − d / L, 0, 1)
```

Learning requires finite values in 0–1, both above 0.01, with the length sphere below its saturation threshold. Length must be at least 0.02 m. A cached Tip sequence cannot repeatedly relearn length. The fraction is emitted only after Tip reaches saturation. Starting inside without an earlier usable length observation produces zero: leave and re-enter to establish it.

For example, pRoot=.71 and pTip=.90 estimate a 20 cm Plug; pRoot=.91 and pTip=1 then estimate a 10 cm root distance and a 0.5 fraction. The 1 cm correction follows the actual generated root radius. Root saturation clips the remaining distance too; those signals cannot recover it. [Sensa estimator](https://github.com/SeaLoong/Sensa/blob/main/src/Signals/SpsDepthEstimator.cs).

The model has material limits:

- Lateral offset increases root distance, and concentric spheres do not determine orientation. Radial fraction is not insertion along the Plug axis.
- Root and length spheres may come from different Plugs. An OSC source identifies a client, not a Contact Sender. A replacement with no zero or new unsaturated observation may retain an incorrect learned length.
- Per-parameter OSC has no common frameId. Coalescing short bursts and checking sequence numbers reduce duplicate observations without proving synchronization.
- Configurable OSC timeout uses the newer timestamp within the selected modern pair, permitting delta-only saturated values. This does not prove that the older coordinate is physically current. A zero timeout disables this check; suppressed legacy/Close updates cannot refresh the modern pair.
- SPS deformation, legacy TPS/DPS compatibility and OGB Haptics are distinct capabilities. Visible deformation does not establish that these parameters exist or are transmitted. [Official SPS documentation](https://vrcfury.com/sps/).

## Enable Haptics before checking parameters

Current VRCFury leaves OGB Haptics objects disabled unless this is the local Avatar and OGB_ENABLED is true. Official OGB sends true every five seconds. [VRCFury enable condition](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/OgbEnabledService.cs#L16-L41), [official heartbeat](https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/src/main/OscConnection.ts#L21-L68).

Sensa provides an explicit control configuration:

```json
{
  "osc": {
    "ogbControl": { "enabled": false, "host": "127.0.0.1", "port": 9000 }
  }
}
```

- It defaults off. With Avatar Haptics installed and VRChat OSC enabled, specify **VRChat's receive IP/UDP port**, then enable OGB control. Only unicast IP addresses or localhost are accepted; an observed source port is never guessed as the destination.
- While OSC input mode and the OSC listener are running, send true immediately and every five seconds. Device input can stay disarmed while inspecting parameters.
- Disabling control, leaving OSC mode, stopping reception, changing targets or normal shutdown attempts false to the previous destination and stops its timer. Abrupt termination cannot guarantee a final packet.
- A target pointing back into Sensa's OSC listener is rejected. Target changes disable the old destination first.
- The active status means the heartbeat service is running. UDP has no acknowledgement, so a successful send does not confirm Avatar activation. Other OSC applications may write the same parameter.

See [control service](https://github.com/SeaLoong/Sensa/blob/main/src/Input/Osc/OgbControlService.cs) and [AppConfig validation/copying](https://github.com/SeaLoong/Sensa/blob/main/src/Configuration/AppConfig.cs).

## Touch and frottage are separate from depth

Official OGB requires matching TouchSelfClose/TouchOthersClose for Orf/Pen touch, and FrotOthersClose for Pen frottage. Orf FrotOthers is direct. Close is typically a capsule-shaped presence gate constraining a broader proximity sphere. [Official touch selection](https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/src/main/GameDevice.ts#L108-L139).

The built-in touch mapping uses `sourceMode: OgbTouch`, pairing intensity and Close by complete instance, source and feature. A required but missing Close produces zero. Close updates reevaluate output without refreshing an old intensity timestamp. Explicit Direct mappings remain available for raw values.

These strengths provide no identity, orientation or position. Route them to vibration axes; Touch cannot replace a missing depth pair.

## Validation boundary

[Depth contracts](https://github.com/SeaLoong/Sensa/blob/main/tests/Sensa.Tests/Contracts/OgbDepthContracts.cs) cover legacy scalar input, modern priority, partial-pair protection, Close, nested instances, source/party isolation, cached Tip, timeouts and rebuilds. [Touch contracts](https://github.com/SeaLoong/Sensa/blob/main/tests/Sensa.Tests/Contracts/OgbTouchContracts.cs) cover Close variants, cross-group rejection and explicit raw mapping. [Control contracts](https://github.com/SeaLoong/Sensa/blob/main/tests/Sensa.Tests/Contracts/OgbControlContracts.cs) use virtual time and isolated local UDP ports to test default-off behavior, cadence, target changes, final false, idempotent shutdown and loop rejection.

These are project logic and mock transport evidence. This work did not run a local browser, live VRChat/Unity session or user hardware. It cannot establish that an arbitrary Avatar has the required components, generates correct parameters or moves real hardware consistently with its visuals. Acceptance should inspect parameters first, then isolated outputs, before the user checks real devices within explicit limits.

The research references upstream source for interoperability without bundling or modifying it. The [OGB license](https://github.com/OscToys/OscGoesBrrr/blob/643aedd493ba21b0c0859ce6e57708fe408ee9c0/LICENSE) and [VRCFury license](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/LICENSE.md) still govern those projects; they are not described here as permissively licensed source to copy.
