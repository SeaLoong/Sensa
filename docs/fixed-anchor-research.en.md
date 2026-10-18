# Fixed-anchor SPS roots: research and implementation limits

[简体中文](fixed-anchor-research.md) | **English**

The SPS root design now means **four fixed anchors in AvatarRootLocal measuring one explicitly selected root center**. This reopens the earlier positioning design decision. Legacy moving-reference eight-channel Contacts do not acquire the new protocol identity or validity.

## Geometry and protocol

[SensaFixedAnchorProtocol.cs](https://github.com/SeaLoong/Sensa/blob/main/unity/top.sealoong.sensa/Runtime/SensaFixedAnchorProtocol.cs) is the single geometry source. A0–A3 are:

| Anchor | AvatarRootLocal coordinate |
| --- | --- |
| A0 | (-0.5, 0.5, -0.5) |
| A1 | (0.5, 0.5, 0.5) |
| A2 | (0.5, 1.5, -0.5) |
| A3 | (-0.5, 1.5, 0.5) |

The center is (0,1,0), receiver radius 2.5 and independent marker radius 0.001. These are avatar-root local units, not world meters under arbitrary scale. The position bound is ±1.5 per axis around the center, additionally restricted to the unsaturated intersection of all four spheres; not every corner of that cube is covered. The 0.01 residual threshold rejects inconsistent fits; it does not guarantee accuracy.

Public ranges use `Sensa/SpsRoot/v1/<id>/Self/Root/A0…A3`. The Self level also contains `Profile=1`, `Valid`, `Scale` and `Heartbeat`; metadata is outside Root. Contacts write internal `Root/RawA0…RawA3`. Every 0.05 s, FX copies four values to their public parameters, then updates metadata and advances a 32-step normalized heartbeat counter (0…1, 1.6 s cycle exceeding the 1.25 s freshness window to reduce binary aliasing). The desktop may retain unchanged ranges for a stationary target while requiring protocol identity, permission, validity, scale and a live heartbeat. **OSC samples are not atomic**: copy timing, separate OSC packets, packet loss and Contact update timing can still mix measurements. The heartbeat only proves FX liveness.

## Why four values can determine local position

The [official Contact reference](https://creators.vrchat.com/common-components/contacts/) describes closest-point proximity and nearest-sender aggregation. It does not publish the linear equation. We also inspected ContactManager / CollisionScene from installed VRChat SDK 3.10.5; the inspection copy matches the package VRC.Dynamics.dll SHA-256:

`672093e0c2a52a035979f1ff66478389949f42ffcf7daba5edd8b8da718629a3`

The following is a derivation from that implementation for known spherical shapes outside saturation:

```text
p_i = 1 - clamp(max(0, distance_i - senderRadius) / receiverRadius, 0, 1)
distance_i = (1 - p_i) * receiverRadius + senderRadius
2 (anchor_i - anchor_0) · position =
    |anchor_i|² - |anchor_0|² + distance_0² - distance_i²
```

The three anchor-difference vectors have determinant 2, so three squared-distance differences uniquely determine XYZ. All sphere residuals and bounds then reject inconsistent results. At (0,1,0), each distance is sqrt(0.75), giving ideal proximity approximately 0.653989838. Saturated p=0 or p=1 describes a bound or containment, not an ordinary distance.

A common translation and rotation of the whole avatar leaves these distances unchanged. This measures root movement relative to the avatar, not avatar world movement or orientation. A larger radius adds no global reference and increases distance error for the same proximity error.

## Target identity and scale guards

An author explicitly selects a supported component and resolves its CPU root frame. Generic SPS tags do not identify a point. The pinned VRCFury [Socket baker](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Inspector/VRCFuryHapticSocketBaker.cs) and [Plug baker](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Common/Inspector/VRCFuryHapticPlugBaker.cs) resolve local root poses but use senders with differing geometry and purposes. Sensa preserves those components and adds a tiny sphere with a unique custom tag, following the resolved root through ParentConstraint. Marker and anchors share avatar-root scale rather than inheriting bone scale. Sensa-owned components resolve depthAxis/rootBone; explicit native Contacts resolve rootTransform and position. This center does not include SPS shader curve deformation.

World radius is capped at 3 m after scaling. Builds reject nonpositive, nonuniform or oversized avatar-root scale, root ScaleConstraint and root-scale animation. Arbitrary custom scale animation is not observed by the built-in ScaleFactor. Runtime FX uses [ScaleFactor and IsLocal](https://creators.vrchat.com/avatars/animator-parameters/) and requires:

```text
2.5 * authoredRootScale * ScaleFactor < 3 - 0.001
```

An invalid scale or unselected target disables Contacts and clears validity and ranges. Default Self receivers accept only their own unique tag. Optional Others diagnostics always publish Valid=false. Duplicated avatars, additional matching senders, world content and packet loss are not authenticated or resolved by this scheme; arbitrary remote avatar roots are not reliably identified.

## Evidence from this change

Unity 2022.3.22f1 EditMode passed 65 tests with zero failures or skips: 9 fixed-root author tests, existing author regressions and 2 new ShaderCapture tests. Coverage includes coordinates, sender identity, root bindings, writable parameters, NDMF merging, rejected scales and FX enable/disable structure and animation. Generated shaders imported in nographics mode without compilation errors. The ignored report is `artifacts/verification/fixed-root-authors-final-editmode.xml`. After the 32-step heartbeat and multi-producer shader isolation changes, all 9 affected fixed-root and 3 ShaderCapture tests passed again with no skips in `artifacts/verification/fixed-root-counter-native-editmode.xml`; unrelated author contracts were not rerun.

The public `SensaSpsRootProbe.prefab` was migrated in place to fixed-root authoring, retaining its asset GUID and requiring an explicit target. Legacy eight-channel standardSpsRoot authoring now fails before generation with migration guidance. All 22 affected FixedRoot/Pose EditMode tests passed without skips, including actual prefab type, menu instantiation and four-anchor/metadata contracts after assigning a target. Report: `artifacts/verification/fixed-root-public-entry-editmode.xml`.

No local PlayMode, browser, screenshot, full-process smoke or hardware tests ran. Actual VRChat Contact precision, OSC update rate/loss, uploaded constraint/FX behavior, GPU rendering and physical devices remain unverified. Synthetic geometry and EditMode do not replace those checks.
