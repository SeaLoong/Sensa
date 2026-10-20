# Three built-in mapping templates

[简体中文](presets.md) | **English**

Templates reduce repeated setup. They grant no input permission and do not ensure an Avatar generated the parameters. Inspect actual source/paths before choosing one, then check direction, range and gates. [Choose a route](usage-scenarios.en.md)

| Template ID | Purpose | Default destination |
| --- | --- | --- |
| `ogb-depth` | Modern Socket radial estimate, legacy Socket or Plug proximity | Depth → L0 |
| `ogb-touch` | Touch/Frot or standalone VFH Touch Zone | V0 |
| `native-pb-stretch` | Native PB Stretch/IsGrabbed | Depth + GateEnable |

## OGB / SPS · Depth

The default Others aliases are:

```text
OGB/Orf/**/PenOthersNewRoot;OGB/Orf/**/PenOthers;OGB/Pen/**/PenOthers
```

OgbDepth finds modern NewTip within the same source, complete instance and Self/Others category. Positive modern values take priority. An incomplete pair or unknown learned length yields zero instead of hiding behind a high legacy value. Legacy proximity is considered only when modern values are absent/both zero; legacy Socket Close gates it when present. Plug values are not universally inverted.

NewTip is a root-centered length sphere. The result is radial, not general axial insertion or XYZ. Separate the actual objects before approaching. Avatar/mapping changes and reactivation clear learning. [Geometry/limits](ogb-compatibility.en.md)

## OGB / SPS · Vibration

```text
OGB/Orf/**/TouchOthers;OGB/Orf/**/FrotOthers;OGB/Pen/**/TouchOthers;OGB/Pen/**/FrotOthers;VFH/Zone/Touch/**/Others
```

OgbTouch pairs ordinary Touch with same-instance Close; Plug Frot also needs Close. Socket Frot and standalone VFH Zones read directly without inventing a Close. For Intiface vibration, confirm V0 as the source; L0-to-vibration requires an explicit choice.

## Native PB · Stretch

The template uses `MyPB_Stretch` and `MyPB_IsGrabbed`. Replace MyPB with the actual PhysBone prefix. Grab opens GateEnable; releasing should close it. This is a scalar signal, not local XYZ, and needs no Contact reconstruction.

## Apply and customize

Replace removes the current mappings; append retains them. Both edit a draft first. Verify real paths/roles and save; saving disarms input, so activate it explicitly afterward. For Self, change the category rather than mixing auxiliary values from different objects.

Custom presets can be saved/removed. Internal QuickStart steps, legacy Point/Pose and Shader diagnostics have no built-ins. Configure synthetic fixtures manually; they are not production routes. Generate experimental root mappings through endpoint calibration. [Mapping guide](guide.en.md) · [Dictionary](osc-parameters.en.md)
