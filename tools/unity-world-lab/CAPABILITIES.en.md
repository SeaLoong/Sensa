# Capability tests and Sensa integration

[简体中文](CAPABILITIES.md) | **English**

For real-client acceptance use the [avatar/world/Sensa workflow](https://github.com/SeaLoong/Sensa/blob/main/docs/lab-workflow.en.md). World boards do not automatically become avatar OSC.

Open `Assets/SensaLab/Functional/FunctionalLab.unity`; Generated/SensaLab remains the geometry regression scene. In ClientSim close the menu and focus Game view. Rest/Near/Offset/Outside/Freeze buttons control fixtures; PB stations use real grabbing. None connects hardware.

## Stations

| Station | Input/action | Expected / Sensa relationship |
| --- | --- | --- |
| 01 Contact only | Grab ball or Near/Offset/Outside | Four SDK proximity samples; formula error <0.0001. Avatar path Sensa/Point/v1/LabContact/Self/Root/A0..A3 |
| 02 PB only | Grab/stretch/release, no Contacts | IsGrabbed and Stretch, no XYZ. Avatar Sensa/Lab/PB; native PB-stretch preset |
| 03 PB + Contact | Grab measured PB target | Experimental local fit plus grab gate; inspect LabCombined in OSC diagnostics; no default motion preset |
| 04 Native SPS | Actual VRCFury Plug/Socket; Rest first, then Near/Offset | Real OGB/Orf/FixtureSocket parameters; 20 cm Plug |
| 05 SPS + PB + Contact | PB moves real Plug; Contact measures PB point | Three readouts together; release before preset baseline comparison |
| 06 Shader transport | Synthetic (.25,−.5,.75), sequence, Freeze/ToggleOutput/Corrupt | Error <0.00004; frozen >350 ms invalid; real CRC corruption |
| 07 SPS Shader | Actual shader, moved Socket, GPU centerline | Length ≈.2 m; Offset entry-minus-root ≈(.06,0,.12); editor PNG bridge |

The native SPS station uses its **known specific Sender** and SDK CalculateProximity, not arbitrary remote identity detection. World Transform truth is not an avatar runtime capability.

## Reference values

Contact radius 1 mm, Receiver radius .35 m:

| Position (m) | P1/A0 | P2/A1 | P3/A2 | P4/A3 |
| --- | --- | --- | --- | --- |
| (0,0,.10) | .48541 | .48541 | .73483 | .73483 |
| (0,0,.05) | .60593 | .60593 | .75874 | .75874 |
| (.06,0,.10) | .40627 | .51463 | .79683 | .60286 |
| (0,0,.60) | 0 | 0 | 0 | 0 |

SPS 20 cm Plug, Socket relative to Plug root:

| State | Position | Signed SDK proximity (m) | Axial depth truth | Radial estimate |
| --- | --- | --- | --- | --- |
| Rest/Outside | (0,0,.24) | +.04 | 0 | 0 |
| Near | (0,0,.12) | −.08 | .400 | .400 |
| Offset | (.06,0,.12) | −.06584 | .400 | .32918 |

SDK distance, OGB normalization, Root/Tip estimation and shader model measurements are different quantities. Enable **SPS OSC** / **Enable SPS OSC (local)**, which sets OGB_ENABLED. For your own Plug use Self. Sensa compensates the 1 cm root radius, but saturation leaves the last centimeter unobservable.

## PB behavior

Experimental handles allow grabbing, disallow posing and collisions, have an empty collision list and no Unity Collider on the visible sphere. Keep a nonzero PhysBone radius for grabbing. Contacts measure; they are not PB collision objects. Actual grabbing/self-interaction permissions still need client testing. No old Dynamic Bone package is required.

## Image bridge

Use an isolated Sensa configuration with **no outputs**. Replace `<World project>` in the commands below with your local world project directory. The shipped `tools/unity-world-lab/sensa-preview.json` uses WebUI 5087. Set SENSA_CONFIG_PATH to its absolute path before starting Sensa. Free UDP 9001 and pin the bridge source.

```powershell
python -m pip install -r scripts/requirements-capture.txt
# Offline: no network without --port
python scripts/shader-osc-bridge.py --image "<World project>/Validation/functional/sps-telemetry.png"
# Continuous editor PNG; explicitly opt into local OSC
python scripts/shader-osc-bridge.py --image "<World project>/Validation/sps-telemetry.png" --watch --duration 300 --port 9001
# Native root screen capture requires explicit producer registration:
# unity/top.sealoong.sensa/GPU-TRACKING.en.md
```

The full 16×8 grid must be present, at least 4×4 pixels per cell. Rectangular stretching is supported, automatic discovery/perspective correction is not. Startup/recovery needs two fresh increasing frames. Duplicate/stale frames cannot restore Valid; changing XYZ under the same sequence is invalid. Freeze, ordering errors, CRC failure and normal exit close Valid. Force-kill/network loss additionally needs Sensa stream timeout; the example sets 500 ms. Restart the bridge when the producer's sequence resets.

Observe `Sensa/Shader/v1/0/{X,Y,Z,Frame,Valid,Producer,Profile}`. Profile0/ID0 is diagnostic preview, not motion input or a calibration reference. The .12 m model displacement differs from the SPS insertion quantity. Profile1 registration uses the [package guide](../../unity/top.sealoong.sensa/GPU-TRACKING.en.md).

For actual model PNGs, run the baked SPS scene in the editor, open **Tools → Sensa → SPS GPU Model Probe (Experimental)**, select non-stereo Camera and matching Resolver/Surface Renderer, enable continuous PNG export, set the file and capture. The camera must keep rendering. Encoded entry-minus-root uses world axes within ±1 m; invalid/out-of-range data exports invalid packets.

This lab's uploadable camera rig produces synthetic code; its real SPS model PNG requires the editor. The separate package generates a native root-transform producer, not a deformation-model capture. Fixed coordinates/CRC do not guarantee zero lag or HMD invisibility.

## Reports

Historical reports are `Validation/functional/results.json`, `sps-gpu.json` and `sensa-bridge.json`, not live VR grabbing evidence. Current Windows x64 CI checks Profile0 transport CRC failure, stale-frame refusal, two-frame recovery and freeze invalidation with input disarmed and no outputs. Automated E2E/screenshots run only in CI.

[PhysBones](https://creators.vrchat.com/common-components/physbones/) · [SPS](https://vrcfury.com/sps/)
