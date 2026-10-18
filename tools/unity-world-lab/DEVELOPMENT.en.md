# World lab implementation and validation

[简体中文](DEVELOPMENT.md) | **English**

This is a device-free PC Worlds harness. FunctionalLab separates signal systems; Generated/SensaLab contains geometry boundaries. Source lives in repository-relative `tools/unity-world-lab`, with shared GPU probe/protocol sources. Replace `<World project>` with your local world project directory, then sync from the Sensa repository root:

```powershell
python -X utf8 scripts/install-world-lab.py "<World project>"
```

The installer refuses locally edited owned files and does not overwrite generated scenes. Scene generators also refuse existing scenes. The project remains local Git with no remote; Library/Temp/Logs/Builds are excluded. DisabledPackages~ retains optional packages excluded after Harmony conflicts.

## Runtime systems

- Native SDK CalculateProximity measures known Contact Senders; four local samples reconstruct points.
- Udon GPU readback runs every six Update frames, validating packet CRC and displaying age/callback lag. These are not external capture latency.
- PhysBone stations expose a grabbable sphere, native state and measured coordinates.
- SPS2 uses installed VRCFury authoring and its normal world baking hook, with legacy compatibility retained.
- Paired markers can stimulate a compatible avatar, but wearing an uploaded avatar is still required for avatar OSC.
- Visible telemetry is deliberately inspectable. Camera-only fixed-viewport output is an experiment, not a proven hidden avatar bridge.

See [capabilities and exact numerical references](CAPABILITIES.en.md) and [interaction guide](https://github.com/SeaLoong/Sensa/blob/main/docs/lab-interaction.en.md).

## Material isolation

Functional shader and geometry stations use independent runtime encoder materials. A disabled meshless **Runtime encoder material** Renderer provides a cloned `Renderer.material`. Udon does not support `new Material(...)`; do not substitute that constructor.

Sequence/sample/CRC writes affect runtime instances, destroyed when Play Mode ends, not material assets. **Upgrade isolated encoder materials** updates existing scenes. The validation harness checks instance separation and asset/memory contents before/after, producing `material-isolation.json`.

Geometry validation no longer invokes layout/scene generation or saves original scenes. Missing PB stations/cases must be prepared through menus. Only pickup display size is adjusted; whole probe frames/text are not rescaled.

## Eleven geometry cases

Stations at Z=4–9 m display SDK proximity, Truth, Decoded, RMS, expected state and a position vector.

| Case | Baseline | Expected |
| --- | --- | --- |
| Front | (.02,−.03,.10) | Valid |
| Behind | Z=−.10 | Valid, no mirror |
| Lateral | X=.13,Y=−.05 | Valid |
| No contact | Z=.60 | Invalid |
| Saturated | Sender at receiver center | Invalid |
| Wrong radius | Sender radius .04 | Invalid for fixed .001 solver |
| Scale ×2 | Uniform reference scale | Local Z=.10 |
| Rotated frame | (15°,35°,10°) | Local coordinates unchanged |
| Missing P4 | Explicit missing A3 | Invalid |
| Beyond volume | Z=.26 | Invalid even if all values exist |
| Origin | Zero | Valid |

Case 09's −1 is injected missing-data state, not an SDK proximity claim. Each case uses distinct tags and a specific Sender; it does not establish multiplayer identity isolation. RMS is fit consistency, not real accuracy.

Grabbing the white ball leaves the baseline and shows EXPLORING. RESET drops/restores it; PAUSE freezes readings and marks PAUSED; MISSING P4 toggles the injected gap. P1–P4 bars and center markers share colors. Their visible sphere size is not receiver or Sender radius. Local-only objects are not Object Sync.

## Validation artifacts

Historical editor checks write editor-results.json, telemetry.png, camera-output.png, world-preview.png and point-cases.json. PlayMode checks bake a temporary scene, run ClientSim/Udon/SPS sampling and save reports under Validation/ and Validation/offset/. The harness restores the VRCFury preference after avoiding a duplicate PlayMode rebuild. BakedPlayValidation.unity references temporary assets and must be rebuilt rather than treated as a permanent scene.

The desktop fixture `tests/Sensa.Tests/Fixtures/unity-point-cases.json` records actual SDK samples. Valid cases must reconstruct within 0.1 mm of those offline coordinates; this is data-consistency tolerance, not live accuracy.

Reports include controlsPassed for missing-sample→invalid, reset→valid and pause/resume behavior. Scripted Udon events do not simulate real hand grabbing. Layout/locomotion reports inspect usable heights, floor space, actual simulated controller travel and jumping, not real keyboard/HMD behavior.

**Current policy:** automated E2E, full-process smoke and screenshot generation run only in CI. Do not execute these historical PlayMode screenshot menus as local automated checks. Local compile/EditMode unit checks and manual private-world exploration are separate. The public CI does not provision the full proprietary Unity projects.

## UI diagnostics

Sensa has XZ/YZ projections and separate calibration. The ±25 cm grid is a visual reference, not a guaranteed valid volume. Capture 0% and 100%; a 10→5 cm range auto-inverts and 7.5 cm previews 50%. Out-of-range preview clamps to 0–100%. Invalid samples hide position/progress and disable capture while preserving recorded endpoints. Missing objects require reselection; changing target/axis clears endpoints.

Current WebUI screenshots are produced by the [CI E2E suite](https://github.com/SeaLoong/Sensa/blob/main/docs/e2e.en.md), including English/Chinese desktop and narrow layouts.

Still requiring real-client validation: grabbing/releasing, rapid target switching, multiple same-tag players, avatar scale, OSC packet loss, shader culling, camera retention, HMD visibility, external capture lag and actual hardware calibration. No lab automatically enables hardware.
