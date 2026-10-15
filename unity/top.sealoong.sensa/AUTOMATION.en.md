# Automatic setup, local bones and PB handles

[简体中文](AUTOMATION.md) | **English**

## Minimal setup

Add **Sensa → Automatic SPS Setup** at the avatar root and inspect targets, positions and Contact cost. By default it discovers VRCFury Socket/Plug authoring components and creates Socket root diagnostics. Enable other capabilities explicitly.

New components/prefabs default to **Exclusive**, one measured Socket or Plug per group, initially Off. Existing serialized policies remain unchanged. Adding directly to an SPS object limits selection to that object; a single Plug defaults to paired markers.

NDMF reads the SPS origin, rotation and length, generates native components in the build copy and removes editor-only authoring components. It does not move or rewrite the original SPS. Unknown geometry APIs fail rather than silently guessing.

Previously checked environment: Unity 2022.3.22f1, Avatars SDK 3.10.5, VRCFury 1.1434.0, MA 1.18.7 and NDMF 1.14.8. These are recorded versions, not claims that every version is supported. Local bone/PB probes do not depend on VRCFury. Keep Avatar and World SDKs in separate projects.

## Configure a group

1. Install SDK, MA/NDMF and, if needed, VRCFury through VCC/ALCOM. Adding Sensa from disk does not install missing VPM dependencies.
2. Add Automatic SPS Setup under the Avatar Descriptor.
3. Set a unique Group Name: up to 30 ASCII letters, digits, underscores or hyphens. The same SPS object cannot belong to two automatic groups.
4. Discover All scans SPS authoring objects. Otherwise fill Selected Targets. Excluded Targets always wins.
5. Check the inspector report for instance names, slot numbers, positions and cost.
6. Enable the appropriate capabilities below; build/upload privately.
7. Enable VRChat OSC and interactions. Choose a Sensa target from its initially Off menu, and separately enable the native SPS target.
8. In Sensa enable receiving, apply OSC mode, pin the source and inspect samples with input still off.

| Capability | Measurement |
| --- | --- |
| Socket Root Tracking | Standard TPS_Pen_Root sphere; eight samples, diagnostic XYZ only |
| Paired Socket Tracking | Matching Root/Tip/Side, 24 receivers |
| Paired Plug Markers | Three undeformed reference markers generated from Plug geometry |
| Local Plug Tip Tracking | Your undeformed tip relative to your selected Socket, four samples |
| Create Plug Grab Handles | Independent grabbable PhysBone handle, four samples and grab gate |

Pair Channel must match on both avatars. One channel must not contain several matching Plugs at once. Local Reference Socket is selected automatically only when exactly one eligible Socket is selected; otherwise specify it. A reference moving rigidly with its target cannot reveal relative displacement.

Generated instance names include a short target name and hierarchy digest. Renaming/reparenting may change paths; inspect mappings again.

## Manual/local alternatives

**Local Bone or PB Probe** accepts any local avatar Target Transform and Reference. Empty Reference uses the component object. Create Grab Handle generates its own target. The measurement Sender follows position without inheriting target PB stretch; keep the entire reference hierarchy positively and uniformly scaled.

Prefabs include SensaAutoSetup, SensaLocalPoint, SensaGrabHandle, SensaPoseSocket, SensaPosePlug and SensaSpsRootProbe. Manual authoring generates the same kind of native components, but does not automatically provide a multi-target selector.

A local probe measures one point, not full orientation or remote bones/GPU vertices. Its nominal range is about 24 local cm; saturation can invalidate positions inside that volume too.

## Allocation policies

For N standard-root Sockets, excluding paired arrays, local probes and other plugins:

| Policy | Registered receivers | Active receivers | Behavior |
| --- | --- | --- | --- |
| Dedicated | 8N | Up to 8N | Independent positions, useful for simultaneous diagnostics |
| Exclusive | 8N | Up to 8 | One measured target in a group |
| SharedRootArray | 8 | 8 | One constrained array follows the selected target |

SharedRootArray supports only standard root diagnostics and at most 16 same-scale measured targets. Plug markers/points/handles retain their own components; selecting a Plug disables the shared root array (Ready=false, Slot=0). It moves Sensa's auxiliary array, not the SPS Socket. Contact reduction is not a guaranteed frame-rate improvement because constraints/controllers also cost time.

Exclusive/Shared menus are `Sensa <group>`, Off by default. They do not modify SPS tags, Auto Mode, Guided Path or visual activation. Exclusivity is per group; multiple groups can remain active simultaneously. References without enabled measurement do not get empty menu slots.

Switching clears generated receiver and PB grab/stretch parameters. Shared switching disables receivers, sets Ready=false and the slot, clears eight samples, waits 0.25 s, then enables receivers and Ready. The desktop rejects pre-selection samples using receive sequence, even with equal millisecond timestamps. This is not an atomic network transaction; packet loss/order and constraint timing still need client validation, so shared roots remain diagnostic.

The selector uses current-slot guards and AnyState transitions. At 16 targets, Exclusive has 19 transitions and Shared 35, including waits. Stable selections do not restart the wait continuously. Internal slot parameters do not consume menu/network synchronization bits.

Each local point/PB adds four Receivers and one Sender; handles also add a PhysBone and visible mesh. Contact budgets are checked before generation and during NDMF optimization. Inspect the final avatar because other plugins can add components later.

## Geometry: why eight, four or three?

For standard/paired markers, eight receiver centers occupy cube corners `(±0.06, ±0.06, ±0.06)`, receiver radius R=0.35, in reference-local units. Proximity measures distance to the Sender surface:

```text
a_i = R * (1 - p_i)
d_i = a_i + r
|x - c_i|² = (a_i + r)²
x(r) = -sum(c_i * (a_i + r)²) / (16 b²), b=0.06
```

The solver searches/refines radius r in 0–0.02 and minimizes RMS center-distance residual. It rejects missing, saturated/nonfinite samples, inconsistent fits and out-of-volume positions. A standard root reaching the radius upper bound is invalid. The 0.002 residual threshold checks consistency; it is **not a measured accuracy guarantee**.

Eight is not the mathematical minimum. Four noncoplanar distances can locate a point when radius is known. Eight offers symmetry and consistency checks with unknown radius, but does not prove all receivers selected the same player; each receiver independently chooses its nearest matching Sender. There is no automatic fallback to four samples.

Local points/PB use four cube corners 0,3,5,6 forming a tetrahedron, with a controlled 0.001-radius Sender:

```text
x = -sum(c_i * d_i²) / (8 b²)
```

The solver checks all four distances after reconstruction. Three distances generally have two mirrored solutions on opposite sides of the receiver plane; assuming a half-space would make moving PB targets jump. Four avoids that ambiguity, but offers less redundancy for detecting noise/mixed targets. No missing-sample guess is used.

A sphere has no observable rotation. Two distinct points define an axis but not roll. Three noncollinear markers define a full reference frame: Root→Tip is the axis and Side establishes twist. Paired Pose therefore uses 3×8=24 samples, then evaluates opening-plane intersection, aperture and tilt. The markers are undeformed references, not a shader-deformed curve.

PB position is not inferred from Stretch. A native chain Reference→Joint→Grip is grabbed; a separate constrained Sender follows Grip. IsGrabbed gates input and release stops it. Stretch is an extra scalar depending on PB configuration. One endpoint does not reveal every segment or full bone rotation. Measuring rotation would require three bone-fixed noncollinear points, with added cost/noise; this is not generated by default.

## Paths and calibration

| Kind | Path |
| --- | --- |
| Standard root | `Sensa/SpsRoot/v1/<instance>/<Self|Others>/Root/A0..A7` |
| Shared root | `Sensa/SharedRoot/v1/<group>/Others/...`, plus Ready/Slot |
| Local point | `Sensa/Point/v1/<instance>/Self/Root/A0..A3` |
| PB handle | `Sensa/Handle/v1/<instance>/Self/...`, plus Handle_IsGrabbed/Handle_Stretch |

The v1 path segment identifies the initial data format, not an application release version. Internal development updates this format in place.

Point/Handle can map X/Y/Z or Distance in local meters. Pin one instance/source; ambiguous matches, invalid samples and PB release stop precise input. Standard/shared roots cannot masquerade as local-point motion.

Capture two endpoints in **Range calibration**. Decreasing coordinates automatically invert; spans below 1 mm and mixed target/source/axis samples are rejected. Capture requires valid/grabbed data, but a saved endpoint pair can generate a draft after release. Switching object/axis clears endpoints; a vanished target requires reselection. XZ/YZ grids at ±25 cm are visual references, not guaranteed valid volume.

Replace the entire draft, check target axis/ranges, save, and manually re-enable input. One configuration uses one precise family (Pose or Point), with all precise axes sharing one target path. Output cards show sent commands, not measured position.

## Validation boundary

Unit coverage includes construction, filtering, placement, budgets, selectors, NDMF merging, tetrahedral solving, source isolation, stale samples, grab gates and calibration. Software E2E/screenshots run in CI with mocks. These do not replace private upload, real grabbing, target switching, avatar reload, extreme scale or multiplayer tests.

OSCLeash inspired the PB/constraint/Contact-to-OSC direction; Sensa does not copy its locomotion control or send player movement input.

[Contacts](https://creators.vrchat.com/common-components/contacts/) · [PhysBones](https://creators.vrchat.com/common-components/physbones/) · [Compatibility](COMPATIBILITY.en.md)
