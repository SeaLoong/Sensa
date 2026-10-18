# Mapping presets

[简体中文](presets.md) | **English**

The built-in catalog contains five common inputs. A preset creates drafts: inspect the actual parameters, source and direction, save them, then explicitly enable input. It does not connect hardware or replace device calibration.

| Preset | Purpose | Input paths |
| --- | --- | --- |
| Connection test | Test-world to your-avatar reception; Active gate | `Sensa/QuickStart/Depth`, `Sensa/QuickStart/Active` |
| SPS Socket · Radial estimate | Normalized radial estimate from VRCFury root/length spheres | `OGB/Orf/*/PenOthersNewRoot`; NewTip is read from the same source and instance |
| SPS Plug · Proximity | VRCFury Plug root proximity, without default inversion | `OGB/Pen/*/PenOthers` |
| OGB · Touch vibration | Other-player touch/rubbing to V0 | `OGB/Orf/*/TouchOthers`, `FrotOthers`, and corresponding `OGB/Pen/*/` paths |
| PB · Stretch | Native PhysBone Stretch with an IsGrabbed gate | `Sensa/Lab/PB_Stretch`, `Sensa/Lab/PB_IsGrabbed`; replace these for your avatar |

## Identify the generator first

Modern VRCFury replaces `/` in a Socket OSC ID or Plug name with `_`, producing one path segment. Modern Socket pairs are `PenOthersNewRoot`/`PenOthersNewTip`, or `PenSelfNewRoot`/`PenSelfNewTip` for self interaction. Map NewRoot; the runtime reads NewTip from the same source and instance. For self interaction, copy a draft and use its actual Self path. [Socket generator](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticSocketsService.cs#L180-L274)

VRCFury Plug `PenOthers`/`PenSelf` receivers sit at the root with a radius equal to the length. They should not inherit the inversion used by an older tip receiver. [Plug generator](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Service/BakeHapticPlugsService.cs#L176-L242)

Sensa's traditional authoring component uses `OGB/Orf/<type>/<instance>/...`; older avatars may use other paths. These are not universal modern VRCFury presets. Add their actual paths from the parameter list. Fixed body-location paths, generic Angle proximity combinations and default inverted Plug templates have been removed.

## Limits of the radial estimate

NewTip is a length sphere centered on the root, not a physical tip. Approach from outside to learn length while that sphere is unsaturated; the runtime can then calculate a radial proportion. Lateral offset and tilt still affect it. This is not a world coordinate, axial insertion depth or deformed surface measurement. Relearn after changing targets; missing or invalid parameters cannot be repaired by adding unrelated legacy aliases. See [Positioning](positioning.en.md).

## Custom mappings and axis profiles

Replace or append a preset, edit individual mappings, or save the current mappings as a custom preset. Built-in entries can be copied but cannot be overwritten. Removing a recommended template does not delete saved user mappings; existing spatial mappings are blocked by default by the experimental-input setting.

Mappings define the input and destination axis. Axis profiles define each output's bounds, inversion, speed, locks and ignored axes. Use the small-stroke profile for a first OSR test and verify its center against your device. Avoid applying the same reversal in both places.

There is no default Contact positioning preset. Point, Handle and Pose remain advanced experiments requiring explicit activation; standard Root/SharedRoot observations are diagnostic-only. Native PB stretch does not require XYZ reconstruction.

[User guide](guide.en.md) · [First test](quick-start.en.md) · [Feature reference](features.en.md)
