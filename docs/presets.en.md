# Three built-in mapping templates

[简体中文](presets.md) | **English**

Templates provide common paths and roles to help create a mapping. Confirm the parameters exposed by your Avatar, choose a template, check source, direction, range and proximity conditions, then save and enable input. [Choose a route](usage-scenarios.en.md)

| Template ID | Purpose | Default destination |
| --- | --- | --- |
| `ogb-depth` | SPS2 paired estimate, SPS1 or Plug depth trend | Depth → L0 |
| `ogb-touch` | Touch/Frot or standalone VFH Touch Zone | V0 |
| `native-pb-stretch` | Native PB Stretch/IsGrabbed | Depth + GateEnable |

## OGB / SPS · Depth

The default Others aliases are:

```text
OGB/Orf/**/PenOthersNewRoot;OGB/Orf/**/PenOthers;OGB/Pen/**/PenOthers
```

OgbDepth first pairs `PenOthersNewRoot` and `PenOthersNewTip` from the same source, instance and Self/Others category: **SPS2 · PenOthersNewRoot / PenOthersNewTip** in the explorer. Unsaturated samples estimate Plug length before producing a depth trend. An incomplete pair or unknown length yields zero.

When SPS2 is absent or both readings are zero, it uses the same instance’s **SPS1 · PenOthers / PenOthersClose**. `PenOthers` supplies the depth trend; a published `PenOthersClose` limits the Socket’s effective nearby region. Plug `PenOthers` uses its original value; choose inversion to match its actual direction.

`PenOthersNewTip` observes a root-centered length sphere. Together with `PenOthersNewRoot`, it describes Plug approach toward the Socket. Separate the objects, then approach in the intended direction to collect length samples. Check and calibrate the desired endpoints. Avatar/mapping changes and input reactivation restart learning. [Geometry/limits](ogb-compatibility.en.md)

## OGB / SPS · Vibration

```text
OGB/Orf/**/TouchOthers;OGB/Orf/**/FrotOthers;OGB/Pen/**/TouchOthers;OGB/Pen/**/FrotOthers;VFH/Zone/Touch/**/Others
```

OgbTouch pairs `TouchOthers` with the same instance’s `TouchOthersClose`, using Touch intensity after a target enters the touch region. Plug `FrotOthers` similarly uses `FrotOthersClose` for close or brushing interaction. Socket Frot and independent VFH Zones read their intensity directly. Intiface vibration defaults to V0, with L0 and other axes available when selected.

## Native PB · Stretch

The template uses `MyPB_Stretch` and `MyPB_IsGrabbed`. Replace MyPB with the actual PhysBone prefix. Grabbing opens GateEnable, releasing closes it, and stretch amount becomes a motion target.

## Apply and customize

Replace removes the current mappings; append retains them. Both edit a draft first. Verify real paths/roles and save; saving disarms input, so activate it explicitly afterward. To detect your own targets, choose Self while keeping paired parameters on the same object.

Custom presets can be saved or removed. Generate experimental root mappings through endpoint calibration. Configure QuickStart steps and Shader diagnostics manually using the paths exposed by the experiment. [Mapping guide](guide.en.md) · [Dictionary](osc-parameters.en.md)
