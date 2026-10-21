# World implementation and validation

[简体中文](DEVELOPMENT.md) | **English**

[Installation and language](README.md). Managed source lives under repository-relative `tools/unity-world-lab/{Editor,Runtime}`; generated scenes/assets live in the target project's `Assets/SensaLab`. Installation protects local edits and generated scenes. The independent project stays local without a Git remote.

## Presentation and runtime boundaries

Editor locale selection changes tool UI and newly generated captions. World automatic language uses `VRCPlayerApi.GetCurrentLanguage()` and `OnLanguageChanged`, inspected in Worlds SDK 3.10.5. The installed SDK must expose those Udon APIs; older versions are not presumed compatible. The local session player-tag override takes priority; language is not synchronized.

The six dynamic HUDs translate known phrases through UGUI `Text`, preserving English status/measurement source. Udon does not expose `TextMesh.text` in the checked SDK: static TextMesh therefore retains the original name/Transform/ID/text with its Renderer disabled, while the Editor creates English/Chinese display children. Runtime only uses `SetActive` to switch them, with no per-frame static-text polling.

Localization preserves original objects, parameter paths, event methods, diagnostic JSON keys and fixture state. User-defined names and unknown technical text remain verbatim.

Runtime Udon uses supported SDK APIs; it does not reflect editor types or construct arbitrary library objects. Static/baked Avatar labels are authoring-time assets and require explicit regeneration/upgrade, not runtime translation.

Native SDK CalculateProximity samples a specific known Sender. Udon GPU readback validates CRC and reports local age/callback lag, not external capture latency. PhysBone stations separate grabbing, native scalar state and local geometry. Actual Avatar OSC requires a separately uploaded/worn Avatar.

## Material isolation

Shader and geometry stations use separate runtime encoder materials obtained through a disabled meshless Renderer and `Renderer.material`. Udon cannot use `new Material(...)`; sequence/CRC updates must not modify shared assets.

Explicit **Upgrade isolated encoder materials** updates existing scene bindings. Temporary validation checks instance separation and material content restoration. Generators and geometry validation must not overwrite original scenes or silently recreate missing stations.

## Independent Point geometry cases

These eleven cases use an independent local Point frame, **not** fixed SPS P0–P3. The current generator uses 2 m receivers and ±0.35 m anchor offsets along each axis. Positions below are reference-local:

| Case | Baseline | Expected |
| --- | --- | --- |
| Front | (.02,−.03,.10) | Valid |
| Behind | Z=−.10 | Valid, no mirror |
| Lateral | X=.13, Y=−.05 | Valid |
| No contact | Z=3 (receiver radius × 1.5) | Invalid |
| Saturation | Sender at receiver center | Invalid |
| Wrong radius | Sender .04 instead of .001 | Invalid under the fixed solver |
| Scale ×1.25 | Uniform reference scale; world receiver radius is 2.5 m, below the SDK's 3 m cap | Same local coordinates |
| Rotated frame | (15°,35°,10°) | Same local coordinates |
| Missing P4 | Explicit missing A3 | Invalid |
| Beyond fit volume | Z=PositionRadius+.02, approximately 1.414 m | Invalid despite nonzero samples |
| Origin | Zero | Valid |

Case 09's −1 is injected missing data, not an SDK proximity claim. Each case uses distinct tags and a specific Sender; low residual and fixed fixture identity are not live multiplayer proof.

Saved scenes may retain older geometry. Installing new source does not automatically rebuild those objects. Inspect actual Receiver dimensions and Sender positions rather than inferring that an existing scene matches the current generator.

Grab to explore, reset to restore the baseline, pause to freeze readings and Missing P4 to inject/recover a gap. Helpers show centers rather than physical Contact radii. Controls and positions are local without Object Sync.

## Checks and reports

**Tools → Sensa Lab → Validate localization (Editor only)** compiles Udon and checks pure Editor presentation, without generating user lab scenes, entering PlayMode or operating devices. Read its actual result for the checked revision; it is not client, font/glyph or HMD acceptance.

Developers may choose package unit/EditMode checks locally for a specific task. Release CI runs units, browser E2E and isolated native smoke; these do not replace this world's Unity/PlayMode checks. Scene inspection, capture and private-client exploration are arranged separately as needed. Historical reports are not execution results for current code.

Historical `Validation/` reports include point cases, material isolation, local control events and simulated locomotion. Their temporary baked scenes reference transient VRCFury assets and must be rebuilt when required. Scripted events do not reproduce real hand grabbing; simulated controller travel does not certify actual keyboard/HMD use.

`tests/Sensa.Tests/Fixtures/unity-point-cases.json` preserves SDK samples from the old 0.35 m / ±0.06 m layout for offline historical-data consistency checks. It is not a new capture of the current 2 m layout. Its small comparison tolerance is not a live accuracy bound. Use reports for the checked revision rather than historical test totals or PNG names.

Desktop calibration observes values and builds a draft; it does not arm input. Fixed-root and shader observations use their own coordinate units and freshness gates. Invalid observations preserve captured endpoints but cannot produce valid motion targets.

Still requiring real-client tests: language/font coverage, grabbing/releasing, fast target changes, multiple same-tag Senders, scale, OSC loss/reordering, camera/shader retention, HMD visibility and physical calibration. No harness automatically connects devices or uploads.

[Capabilities](CAPABILITIES.en.md) · [Builds and releases](https://github.com/SeaLoong/Sensa/blob/main/docs/development.en.md)
