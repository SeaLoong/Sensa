# SPS3 and VRCFury Beta

[简体中文](sps3.md) | **English**

Sensa supports VRCFury SPS3 Beta's compatible OGB parameters and Socket/Plug root, pose and following-plane measurements. Depth and touch use the existing presets, and SPS1/SPS2 configurations remain usable.

This page targets official **VRCFury 1.1437.1-beta.1**, pinned to [`59fa4fa`](https://github.com/VRCFury/VRCFury/tree/59fa4fa0277c0f3eb7c73811d9b24bf73e2133f4). [Upstream Beta release](https://github.com/VRCFury/VRCFury/releases/tag/com.vrcfury.vrcfury/1.1437.1-beta.1)

## Drive an output with depth or touch

1. Enable the required **OGB Haptics** in the Avatar's VRCFury configuration. Keep the Plug's **Include Public SPS Channel** enabled for the usual Others interaction.
2. Open Sensa's OSC page, choose the source publishing the parameters and apply **OGB / SPS · Depth** or **OGB / SPS · Vibration**.
3. Separate the objects, then approach to provide length samples. Calibrate the intended endpoints and click **Save changes**. Enable OGB parameter control in settings if the Avatar needs a heartbeat, then enable input.

SPS3's public compatibility readings keep these paths:

| Use | Parameters |
| --- | --- |
| Socket depth | `OGB/Orf/<id>/PenOthersNewRoot` and `PenOthersNewTip`; corresponding `PenSelf…` paths for self interaction |
| Plug depth trend | `OGB/Pen/<id>/PenOthers` or `PenSelf` |
| Touch and friction | The same instance's `Touch…`/`Frot…` and published `Close` values; independent zones use `VFH/Zone/Touch/…` |

The Socket pair still uses 1 m receivers, a 0.01 m root sphere and a length sphere, sharing SPS2's length and depth calculation. The workbench and explorer label this geometry **SPS2/SPS3 · PenOthersNewRoot / PenOthersNewTip**. [Presets and calibration](presets.en.md) · [Complete geometry](ogb-compatibility.en.md)

## Channels, Contact tags and OSC

SPS3 introduces native Contact tags `SPS/Plug/<channel>`, `SPS/Socket/<channel>` and `SPS/SocketPath/<channel>` for interaction selection, encoded dimensions and path stops. These work inside the Avatar; OSC mappings select the `OGB/…` or `Sensa/…` parameters the Avatar actually publishes.

`_public` provides the usual public compatibility channel. `_nothips` supplies legacy self-contact matching with hips excluded; it does not replace the public channel used by Others. An authored setup containing only custom private channels may still declare legacy OGB paths without receiving matching target readings. Keep the required public channel to use the standard presets. [Upstream channel definitions](https://github.com/VRCFury/VRCFury/blob/59fa4fa0277c0f3eb7c73811d9b24bf73e2133f4/com.vrcfury.vrcfury/Editor-Common/Builder/Haptics/SpsTags.cs)

`VFH/Version/10` is an OGB capability marker shared by SPS2 and this SPS3 Beta. Sensa pairs actual readings rather than interpreting 10 as an SPS generation.

Native SPS3 Socket roots have radius zero, compared with 0.001 m for SPS1/2 legacy markers. Plug `PenOthers`/`PenSelf` still read raw values calibrated against the actual object; this difference needs no new depth mode. In the Plug-depth or Socket-friction explorer, switch **Socket root marker** to **SPS3 · point (0 mm)** to inspect point-marker values and boundaries, or select SPS1/2 to compare the 1 mm marker.

## Measure your own roots and reference planes

In Unity, use **GameObject → Sensa → Automatic SPS Setup** and select your SPS3 Socket/Plug. Sensa creates dedicated measurement objects in the build copy. Four-anchor tracking, Contact direct tracking, native root capture and Tracking Frame keep their existing `Sensa/…` contracts.

An explicit SPS3 native Contact root can also be selected. Socket X scale encodes groups and flags; Plug scale encodes length and radii. Sensa converts these markers' positions and rotations into a separate rigid reference frame, with offsets and Right/Forward axes expressed in Avatar-root units. Original markers and authored channels retain their settings. [Unity setup](../unity/top.sealoong.sensa/README.md) · [Position and following planes](positioning.en.md)

## Experimental model probe

Native root capture measures the chosen root; the editor GPU model probe studies the deformation centerline. SPS3 uses Renderer Contact data, while SPS2 uses a Resolver and grid textures. The probe selects the adapter for that data interface and its pinned dependencies. See the [GPU guide](../unity/top.sealoong.sensa/GPU-TRACKING.en.md) for operation.

Automated regressions cover compatible parameter geometry, isolation, length estimation and expiry stops, plus root and material-data contracts. Actual VRChat clients, GPU pixels and device movement have separate results in the [verification notes](e2e-status.en.md).
