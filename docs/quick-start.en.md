# Start with a real input

[简体中文](quick-start.md) | **English**

Everyday inputs are manual targets, funscript, existing OGB/SPS parameters, or coordinate components you generate. Synthetic steps are development fixtures, not a required installation route.

## Startup and a device baseline

1. Download the appropriate desktop package from [Releases](https://github.com/SeaLoong/Sensa/releases), extract everything, and run `Sensa.exe` or `./Sensa`. No separate .NET installation is required.
2. Open `http://127.0.0.1:5086` with input disarmed. Preview without outputs first, then add firmware-compatible TCode serial/UDP/TCP or connect an already running Intiface Central.
3. Bind TCode outputs to an axis profile matching actual mechanical calibration. A small numeric preset is not your hardware's safe travel; Intiface executes only declared device features.
4. Apply Manual in Control and check explicit targets, direction and stopping. Continuous sending follows edits; it does not generate reciprocating motion. Disarming sends a stop. Emergency stop stays latched until explicitly cleared and rearmed.

Output cards show commands, not mechanical feedback. A local UDP connection state has no remote acknowledgement.

## An existing SPS/OGB Avatar

1. Enable OSC in VRChat, apply OSC in Sensa and listen on `127.0.0.1:9001` by default.
2. Under receiving/forwarding settings, expand OGB parameter activation. Explicitly enable `OGB_ENABLED` heartbeats to VRChat's actual receiving address if needed, commonly `127.0.0.1:9000`. Saving leaves device input disarmed. A heartbeat status is not client acknowledgement.
3. Inspect actual `OGB/Orf/...` or `OGB/Pen/...` parameters. Replace the draft with the depth or vibration template, constrain its instance/source, check calibration and save.
4. Depth detects modern Root/Tip or legacy proximity; touch checks the same object's required Close gate. Intiface vibration defaults to V0; depth-to-vibration requires explicitly choosing L0.
5. Then arm input. Modern radial estimation must first learn length during an outside approach; it is not precise insertion depth. This route usually needs no Sensa Unity package when existing parameters are available.

See [OGB compatibility](ogb-compatibility.en.md) for capability detection, precedence and upstream evidence.

## Direct root coordinates

- **Sensa SPS:** Install the Unity package on your own Avatar. Use Fixed SPS Root Probe to select a Socket/Plug root explicitly. The builder generates four fixed anchors, a dedicated marker and validity metadata. Select the target in the root panel, capture endpoints, replace/save the draft, then explicitly allow experimental spatial input before arming.
- **Shader capture:** Generate native Shader Root Capture, pin a producer ID, select a visible encoded region explicitly and configure the desktop bridge. Calibrate native coordinates in the same root panel. Diagnostic Profile 0 cannot drive motion. A hidden layer is not guaranteed to appear in desktop capture.

Both routes produce Avatar-root local units, not world positions, device feedback or deformed surfaces. [Route comparison](usage-scenarios.en.md) · [Position and scale](positioning.en.md) · [Shader setup](../unity/top.sealoong.sensa/GPU-TRACKING.en.md)

## Other inputs and troubleshooting

Funscript generates one L0 timeline with looping, rate and seeking, without audio/video synchronization. Native PB uses the actual Stretch/IsGrabbed prefix; MyPB in the template is a placeholder to replace.

If nothing is sent, check actual mode, listening port, real parameters, source, saved mappings, gates, output connection and input permission. Recheck permission after configuration, mode or script changes. Ordinary scalars may be delta-only; fixed-rate forwarding must not impersonate fresh sensing.

[User guide](guide.en.md) · [Three mapping templates](presets.en.md) · [Feature reference](features.en.md)
