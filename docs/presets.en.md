# Five built-in mapping templates

[简体中文](presets.md) | **English**

A preset fills common paths and motion roles so you can build a mapping quickly. Choose the matching Avatar feature, select its live source, capture your input endpoints and save. The rows remain editable for your own paths, direction, range and conditions.

| Template ID | Purpose | Default destination |
| --- | --- | --- |
| `ogb-depth` | SPS2 paired estimate, SPS1 or Plug depth trend | Depth → L0 |
| `ogb-touch` | Touch/Frot or standalone VFH Touch Zone | V0 |
| `contact-position` | Contact direct position; calibrate the selected axis in metres | SensaPoint Z → Depth / L0 |
| `contact-speed` | Contact relative speed; calibrate strength in m/s | SensaPoint Speed → V0 |
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

## Contact direct tracking: calibrated root mappings

Use `contact-position` or `contact-speed` after building the dedicated own-root Sender/Receiver with the supported beta SDK. Both use `Sensa/Contact/Root/*`; replace `Root` with the actual instance. Position starts with Z mapped from 0–0.2 m to Depth, and speed starts with 0–1 m/s mapped to V0. Calibrate these example ranges for the actual movement. You can also generate a mapping from the root panel. Select **X/Y/Z/Distance** for position, or **VelocityX/Y/Z/Speed/ProximitySpeed** for movement strength, capture 0%/100% endpoints, inspect the preview and save. The generated SensaPoint mapping uses `Sensa/Contact/<id>/**` with the selected source and metric; position defaults to Depth, velocity metrics to V0. Choose a calibrated axis for subtle depth trends and a separate touch/Close gate when contact confirmation is needed. [Contact setup](contact-sdk.en.md)

## Apply and customize

Replace removes the current mappings; append retains them. Both edit a draft first. Verify real paths/roles and save; saving disarms input, so activate it explicitly afterward. To detect your own targets, choose Self while keeping paired parameters on the same object.

Custom presets can be saved or removed. Generate experimental root mappings through endpoint calibration. Configure QuickStart steps and Shader diagnostics manually using the paths exposed by the experiment. [Mapping guide](guide.en.md) · [Dictionary](osc-parameters.en.md)

Configure input blending and intermediate calculations through [computed signals](computed-signals.en.md). Custom presets store OSC parameter and tracking mappings. The [complete plan](signal-pipeline.en.md#save-and-reuse-a-complete-plan) in Flow exports axis mappings, axis profiles, computations and outputs together for reuse. For proportional blending, create a weighted average first, then use its result in an axis mapping or output binding.
