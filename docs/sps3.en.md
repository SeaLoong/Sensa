# SPS3 and VRCFury

[简体中文](sps3.md) | **English**

This guide follows the published [VRCFury 1.1491.0 release](https://github.com/VRCFury/VRCFury/releases/tag/com.vrcfury.vrcfury/1.1491.0) (`0723fc6e`). Choose a preset by the paths your avatar actually sends. Updating VRCFury in a Unity project does not change an already uploaded avatar.

## Map depth or touch

1. For Socket/Plug OSC output, keep **Tools → VRCFury → Settings → Enable SPS Haptics** enabled when building a desktop avatar. For public interactions keep **Include Public SPS Channel**; custom channels must match and allow the intended Self/Others party.
2. Select OSC input in Sensa. If the haptics receiver requires activation, enable OGB parameter control under **Input → OSC → Receive and forward**. This sends `OGB/Enabled` and legacy `OGB_ENABLED` and clears both on stop. Leave device input disabled while checking readings.
3. Move one object and check the path, object ID and value. Use the corresponding axis mapping preset and calibrate against the actual movement. Save and inspect the result before enabling device output.

| Received OSC parameter (`<id>` is the built object's ID) | What the preset can do |
| --- | --- |
| `OGB/Socket/<id>/DepthOthers` or `OGB/Plug/<id>/DepthOthers` (`DepthSelf` for self) | One Proximity value (0–1) drives L0. The command rises as the value rises. It is not measured insertion in metres or a guaranteed percentage of travel. No Root/Tip pair or length-learning step is required. |
| `OGB/Socket/<id>/TouchOthers` or `OGB/Plug/<id>/TouchOthers` (`TouchSelf` for self) | Touch value drives V0; stronger readings give a larger intensity target. Socket touch is generated conditionally. Plug touch measures along the configured contact face. Neither needs a `Close` companion. |
| `OGB/Plug/<id>/FrotOthers` | Plug-on-plug contact drives V0 from the reported face proximity; it is not a speed reading. |
| `OGB/Touch/<id>/Others` or `Self` | A standalone touch zone can drive intensity without a Socket/Plug or `Close` parameter. |

`OGB/Version/11` advertises the haptics interface, not motion. `OGB/HapticsDisabled` indicates the build option was disabled. `DepthRadius` (Socket) and `LengthMult1/2` (Plug) are metadata, not depth inputs. When available, the depth receivers request the SDK's advanced reports; for example, `_SenderVelocityMagnitude` is a separate m/s value. See the [OSC dictionary](osc-parameters.en.md) and [preset calibration](presets.en.md).

## Older avatars and native Contact tags

`OGB/Orf/<id>/PenOthersNewRoot` + `PenOthersNewTip` are **older** Socket measurements. Sensa continues to pair readings from the same OSC source, instance and party, learn plug length and apply the legacy geometry. `OGB/Pen/<id>/PenOthers`, legacy touch/`Close` pairs and `VFH/Zone/Touch/...` retain their previous rules. These are different protocols, not interchangeable prefixes. See [legacy geometry](ogb-compatibility.en.md).

`SPS/Plug/<channel>`, `SPS/Socket/<channel>` and `SPS/SocketPath/<channel>` are **collision tags inside the avatar**, not automatically published OSC paths. The SPS3 Socket entrance uses a zero-radius marker; Plug scale and Socket scale carry different metadata. Do not interpret encoded scale as ordinary avatar size. The optional GPU model diagnostic has its own dependency lock: support for OSC and authoring geometry does not certify a new shader revision.

**Pinned upstream source:** [Socket OSC](https://github.com/VRCFury/VRCFury/blob/0723fc6eeb764c37b5ed00b3ae27f48cadcc0596/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticSocketsService.cs#L141-L168), [Plug OSC](https://github.com/VRCFury/VRCFury/blob/0723fc6eeb764c37b5ed00b3ae27f48cadcc0596/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticPlugsService.cs#L117-L159), [depth output](https://github.com/VRCFury/VRCFury/blob/0723fc6eeb764c37b5ed00b3ae27f48cadcc0596/com.vrcfury.vrcfury/Editor-Avatars/Service/SelfAndOthersReceiverAnimatorService.cs#L71-L82), [touch zone](https://github.com/VRCFury/VRCFury/blob/0723fc6eeb764c37b5ed00b3ae27f48cadcc0596/com.vrcfury.vrcfury/Editor-Avatars/Feature/VRCFuryHapticTouchReceiverBuilder.cs#L24-L49), [local enable](https://github.com/VRCFury/VRCFury/blob/0723fc6eeb764c37b5ed00b3ae27f48cadcc0596/com.vrcfury.vrcfury/Editor-Avatars/Service/OgbEnabledService.cs#L17-L38), [native tags](https://github.com/VRCFury/VRCFury/blob/0723fc6eeb764c37b5ed00b3ae27f48cadcc0596/com.vrcfury.vrcfury/Editor-Common/Builder/Haptics/SpsTags.cs).

## Measure your own roots and reference planes

In Unity, use **GameObject → Sensa → Automatic SPS Setup** and select your SPS3 Socket/Plug. Sensa creates dedicated measurement objects in the build copy. Four-anchor tracking, Contact direct tracking, native root capture and Tracking Frame keep their existing `Sensa/…` contracts.

An explicit SPS3 native Contact root can also be selected. Socket X scale encodes groups and flags; Plug scale encodes length and radii. Sensa converts these markers' positions and rotations into a separate rigid reference frame, with offsets and Right/Forward axes expressed in Avatar-root units. Original markers and authored channels retain their settings. [Unity setup](../unity/top.sealoong.sensa/README.md) · [Position and following planes](positioning.en.md)

## Experimental model probe

**The SPS3 GPU probe is pinned to the previously tested beta dependencies. GPU pixels and the deformation centerline have not been verified with VRCFury 1.1491.0.**

Native root capture measures the chosen root; the editor GPU model probe studies the deformation centerline. SPS3 uses Renderer Contact data, while SPS2 uses a Resolver and grid textures. The probe selects the adapter for that data interface and its pinned dependencies. See the [GPU guide](../unity/top.sealoong.sensa/GPU-TRACKING.en.md) for operation.

Automated regressions cover compatible parameter geometry, isolation, length estimation and expiry stops, plus root and material-data contracts. Actual VRChat clients, GPU pixels and device movement have separate results in the [verification notes](e2e-status.en.md).
