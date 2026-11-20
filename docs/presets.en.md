# Configuration templates: mappings, transforms and axis profiles

[简体中文](presets.md) | **English**

Configuration templates live in the preset selector under **Mapping & transforms → Axis mapping**, in **Computed signals → Common transforms**, and in **Axis profiles → Device motion presets**. There is no separate combined preset dialog. Mappings and calculations load editable drafts and require an explicit save. Review travel, direction and speed in the axis editor, save, then select the profile on a TCode output. Loading a template does not enable input.

## Built-in mapping templates

A mapping preset fills common paths and motion roles so you can build a mapping quickly. Choose the matching Avatar feature, select its live source, capture your input endpoints and save. The rows remain editable for your own paths, direction, range and conditions.

| Template ID | Purpose | Default destination |
| --- | --- | --- |
| `osc-l0` | Replace Depth with a received OSC parameter, optionally add a dead zone and smoothing | 0–1 → L0 0–999 |
| `ogb-depth` | Stable SPS3 DepthOthers, or a legacy paired estimate/depth trend | Depth → L0 |
| `ogb-depth-touch` | Prepare SPS depth and touch-strength mappings together | Depth → L0; Touch → V0 |
| `ogb-touch` | Touch/Frot or standalone VFH Touch Zone | V0 |
| `native-contact-separation` | Native Contact reference-point distance | 0–0.20 m → L0 |
| `native-contact-speed` | Relative contact-point speed in any direction | 0–1 m/s → V0 |
| `native-contact-approach` | Positive change in proximity, not physical speed | 0–2 proximity units/s → V0 |
| `contact-position` | Contact direct position; calibrate the selected axis in metres | SensaPoint Z → Depth / L0 |
| `contact-speed` | Contact relative speed; calibrate strength in m/s | SensaPoint Speed → V0 |
| `native-pb-stretch` | Native PB Stretch/IsGrabbed | Depth + GateEnable |

## OGB / SPS · Depth

**Stable SPS3:** The preset reads `OGB/Socket/<id>/DepthOthers` or `OGB/Plug/<id>/DepthOthers` directly. It is a 0–1 proximity reading, not insertion depth in metres or a percentage of plug length. Use the actual range for L0. If several objects match, narrow the path to the one you intend. If upgrading an avatar leaves an old mapping pointing only to `OGB/Orf` or `OGB/Pen`, update the path or reload the preset; saved user mappings are not overwritten. [Stable SPS3 details](sps3.en.md)

**Older avatars:** The preset also accepts these Others aliases:

```text
OGB/Orf/**/PenOthersNewRoot;OGB/Orf/**/PenOthers;OGB/Pen/**/PenOthers
```

OgbDepth first pairs `PenOthersNewRoot` and `PenOthersNewTip` from the same source, instance and Self/Others category: **SPS2/SPS3 · PenOthersNewRoot / PenOthersNewTip** in the explorer. Unsaturated samples estimate Plug length before producing a depth trend. An incomplete pair or unknown length yields zero.

When SPS2/SPS3 is absent or both readings are zero, it uses the same instance’s **SPS1 · PenOthers / PenOthersClose**. `PenOthers` supplies the depth trend; a published `PenOthersClose` limits the Socket’s effective nearby region. Plug `PenOthers` uses its original value; choose inversion to match its actual direction.

`PenOthersNewTip` observes a root-centered length sphere. Together with `PenOthersNewRoot`, it describes Plug approach toward the Socket. Separate the objects, then approach in the intended direction to collect length samples. Check and calibrate the desired endpoints. Avatar/mapping changes and input reactivation restart learning. [Geometry/limits](ogb-compatibility.en.md)

## OGB / SPS · Vibration

Stable SPS3 maps `OGB/Socket/<id>/TouchOthers` or `OGB/Plug/<id>/TouchOthers` and `FrotOthers` directly to V0. No `Close` parameter is required; standalone touch zones use `OGB/Touch/<id>/Others`. Only use paths the avatar actually publishes. Legacy paths:

```text
OGB/Orf/**/TouchOthers;OGB/Orf/**/FrotOthers;OGB/Pen/**/TouchOthers;OGB/Pen/**/FrotOthers;VFH/Zone/Touch/**/Others
```

OgbTouch pairs `TouchOthers` with the same instance’s `TouchOthersClose`, using Touch intensity after a target enters the touch region. Plug `FrotOthers` similarly uses `FrotOthersClose` for close or brushing interaction. Socket Frot and independent VFH Zones read their intensity directly. Intiface vibration defaults to V0, with L0 and other axes available when selected.

## Native PB · Stretch

The template uses `MyPB_Stretch` and `MyPB_IsGrabbed`. Replace MyPB with the actual PhysBone prefix. Grabbing opens GateEnable, releasing closes it, and stretch amount becomes a motion target.

## Native Contact: which preset should I use?

In [Avatars SDK 3.10.6](https://github.com/vrchat/packages/releases/tag/3.10.6), select **Sender Type** and the measurement you need under the receiver’s **Advanced Parameters**. Ensure both animator parameters are available through avatar OSC. In **Input → OSC → Parameters**, confirm their paths and values change. Load one preset and replace `MyContact` in **both** rows with the receiver’s parameter name (not its GameObject name). No Sensa root probe is needed.

| Preset | Try this with input disabled | Expected target at the default range |
| --- | --- | --- |
| Distance (`_PointSeparation`) | With a recognized sender in contact, move the reference points from 5 cm to 15 cm apart | L0 goes from about 250 to 749 out of 999. Measures inner reference points, not the gap between the outer surfaces; `-1` means no contact. |
| Speed intensity (`_SenderVelocityMagnitude`) | Move past the receiver at 0.5 m/s, then hold still relative to it | V0 is about 50%, then zero. Moving away can also produce vibration while still in contact. |
| Vibration on approach (`_ProximitySpeed`) | With a **Proximity** receiver, increase proximity from 0.3 to 0.4 in 0.1 s, then withdraw | +1/s gives about 50% V0. A steady or decreasing value gives zero. This responds to a change, not sustained proximity. |

All three include a second row: `_SenderType` → `GateEnable`. A missing value or type 0 (absent/unrecognized sender) keeps the gate closed; types 1–4 open it. This gates the **whole OSC axis mapping set**, not just the adjacent row. Try one preset at a time rather than appending it to unrelated mappings. Select one OSC source; raw parameters do not provide Sensa’s activity Sample. Save after checking the preview; saving leaves input off. The table describes command targets, not measured hardware motion. [Contact fields, units and limits](contact-sdk.en.md) · [Parameter explorer](parameter-geometry.html#parameter-reference)

## Contact direct tracking: calibrated root mappings

Use `contact-position` or `contact-speed` after building the dedicated own-root Sender/Receiver. Both use `Sensa/Contact/Root/*`; replace `Root` with the actual instance. Position starts with Z mapped from 0–0.2 m to Depth, and speed starts with 0–1 m/s mapped to V0. Calibrate these example ranges for the actual movement. You can also generate a mapping from the root panel. Select **X/Y/Z/Distance** for position, or **VelocityX/Y/Z/Speed/ProximitySpeed** for movement strength, capture 0%/100% endpoints, inspect the preview and save. The generated SensaPoint mapping uses `Sensa/Contact/<id>/**` with the selected source and metric; position defaults to Depth, velocity metrics to V0. Choose a calibrated axis for subtle depth trends and a separate touch/Close gate when contact confirmation is needed. [Contact setup](contact-sdk.en.md)

## Apply and customize

Replace loads the preset into the mapping draft; append adds its rows. Both preserve computed signals. Review the paths/roles, then **Save changes**: calculations and axis mappings save together, including edits made in Mapping & transforms → Computed signals. **Restore changes** restores both sets of drafts. Saving disables input; enable it when ready. To detect your own targets, choose Self while keeping paired parameters on the same object.

Custom presets can be saved or removed. Generate experimental root mappings through endpoint calibration. Configure QuickStart steps and Shader diagnostics manually using the paths exposed by the experiment. [Mapping guide](guide.en.md) · [Dictionary](osc-parameters.en.md)

Create [computed signals](computed-signals.en.md) in **Mapping & transforms → Computed signals** for blending and intermediate calculations, **Save changes**, then select their results in **Mapping & transforms → Axis mapping** or output bindings. Custom presets store OSC parameter and tracking mappings. A [complete plan](signal-pipeline.en.md#save-and-reuse-a-complete-plan) exports saved axis mappings, axis profiles, computations and outputs together; save current edits first to include them.

## Common transforms

Expand **Common transforms** under **Mapping & transforms → Computed signals** and select an example to load a calculation draft. Presets do not create target-axis mappings or change the input mode automatically.

| Preset | Default behavior | Next action |
| --- | --- | --- |
| Manual smoothing | Smooth Manual L0 over 250 ms | Use the result in an axis mapping or output binding |
| Manual/script mix | Equal-weight average of Manual L0 and Script L0 | Prepare and apply Combined input |
| Threshold switch | Turn on at L0 ≥ 60%; off below 40% | Choose a gate or intensity destination |
| Slow wave | A 0–1 sine wave with a four-second period | Review range/frequency, then connect a destination |

Sources and settings remain editable. Each load creates an independent calculation draft. Click **Save changes** before selecting its saved result in an output binding.

## Device axis profiles

Expand **Device motion presets** on **Axis profiles**, choose a template, then review and save it in the axis editor. Saving does not bind or enable an output automatically.

| Preset | Axes or limits |
| --- | --- |
| OSR first run · short L0 travel | L0 maps to TCode 400–600 with speed limit 100; other axes ignored |
| SR6 / OSR6 six axes | L0/L1/L2/R0/R1/R2 |
| OSR2 three axes | L0/R1/R2 |
| L0 only | Only L0; other axes ignored |
| V0 only | Only V0; other axes ignored |
| L0 with locked pose | L0 moves; other position/rotation and auxiliary axes lock at midpoint; V0/V1/V2 ignored |

Select the saved profile on a TCode output. Intiface features and sources are configured separately in **Output settings**; a TCode axis preset does not change them.
