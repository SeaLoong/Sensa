# Three mapping templates

[简体中文](presets.md) | **English**

Templates describe existing parameters; they do not install or generate SPS. Socket/Plug haptics share the OGB namespace. Synthetic steps and fixed body aliases are no longer shipped routes. Sensa SPS and Shader coordinates require an actual producer and calibration, not a guessed wildcard travel range.

| Template | Interpreter | Real input |
| --- | --- | --- |
| OGB / SPS depth | `OgbDepth` | Modern Root/Tip or legacy proximity at the same source, full instance and Self/Others party |
| OGB / SPS vibration | `OgbTouch` → V0 | Touch/Frot and their required Close gates |
| PhysBone stretch | Direct + GateEnable | `MyPB_Stretch`, `MyPB_IsGrabbed`; replace MyPB with the actual prefix |

## OGB compatibility

The depth template defaults to Others:

```text
OGB/Orf/**/PenOthersNewRoot;OGB/Orf/**/PenOthers;OGB/Pen/**/PenOthers
```

Do not add Tip/Close as independent output mappings. A positive modern Socket channel selects pairing; a missing companion or unlearned length yields zero rather than a high legacy fallback. Both modern channels zero or absent permits legacy PenOthers; an existing legacy Socket Close must also open. Plug uses its proximity without universal inversion. Old versions do not universally have one detector: official OGB v1 already supported both capabilities. Detect actual parameters rather than guessing versions.

Touch defaults to:

```text
OGB/Orf/**/TouchOthers;OGB/Orf/**/FrotOthers;OGB/Pen/**/TouchOthers;OGB/Pen/**/FrotOthers;VFH/Zone/Touch/**/Others
```

TouchSelf/Others requires the corresponding Close from the same object; Plug FrotOthers requires its Close, while Socket FrotOthers is direct. Missing gates never promote raw proximity into touch. Independent `VFH/Zone/Touch/<id>/Self|Others` is direct and needs no Close. Explicitly choose Direct for other raw signals.

`**` discovers full instance paths. Constrain the actual object and source for everyday control; never pair Self with Others. Sensa deduplicates each group rather than fusing modern and legacy signals twice. See [OGB compatibility research](ogb-compatibility.en.md) for complete rules and fixed upstream sources.

## Applying and saving

1. Confirm real paths in Parameters. Explicitly enable `OGB_ENABLED` heartbeats if required.
2. Replace the draft with a template and check paths, roles and ranges; inspect existing gates when appending.
3. Saving mappings disarms input. Readiness distinguishes saved configuration from drafts.
4. Check the actual source and output features before arming. Vibration uses V0; explicitly select L0 for Intiface depth-to-vibration.
5. Copy a built-in into a custom template before editing it.

Native PB scalar calibration differs from coordinate endpoint calibration; ordinary Stretch does not gain XYZ. See [usage routes](usage-scenarios.en.md) and the [positioning contract](positioning.en.md).
