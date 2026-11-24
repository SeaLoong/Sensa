# World capabilities and transport

[简体中文](CAPABILITIES.md) | **English**

[Install, language and interaction](README.md). FunctionalLab separates the following routes; its boards are world-local observations, not proof of Avatar OSC.

| Station | Observes | Does not establish |
| --- | --- | --- |
| Contact | Four SDK samples against one specific Sender | Multiplayer Sender identity |
| PB | IsGrabbed and Stretch from a grabbable handle | XYZ or physical device feedback |
| PB + Contact | Local fit and grab gate | Shared atomic sampling |
| Native SPS | Actual fixture Plug/Socket and OGB geometry | Received Avatar parameters without an uploaded Avatar |
| SPS + PB + Contact | Independent scalar and local readouts | One interchangeable depth signal |
| Shader transport | Synthetic XYZ, advancing frame, CRC/freeze faults | SPS root or model capture |
| SPS Shader | Editor unblended centerline and entry | Final visible mesh or uploadable arbitrary C# reader |

The native SPS station uses a known Sender and SDK CalculateProximity. World truth is available because the harness owns the fixtures; that ability does not transfer to arbitrary Avatars.

## Choose a station by Sensa preset

Replace one axis-mapping draft at a time. Match the actual Avatar instance, prefix and Self/Others category, save, then watch OSC parameters and the mapping preview in Sensa.

| Station and action | Mapping presets | What to check |
| --- | --- | --- |
| 00, five steps then STOP | `osc-l0`, change Depth to `Sensa/QuickStart/Depth` and add `Sensa/QuickStart/Active` → GateEnable | Five values from 0 to 1, gate closes on STOP |
| 02 as PB reference, grab the Avatar handle | `native-pb-stretch` | Stretch changes the main axis, release closes the grab gate |
| 08 native SPS, move along the axis, sideways at fixed depth, then touch | `ogb-depth`, `ogb-touch`, `ogb-depth-touch` | Compare radial depth during lateral motion. Check vibration with an Avatar reporting Touch/Frot |
| 08, enable EXTRA MARKERS and aim a generic Proximity receiver at the tip | `native-contact-axial`, `native-contact-separation`, `native-contact-speed`, `native-contact-approach` | Move sideways to compare Z and separation. Approach, hold and retreat to distinguish speed from increasing proximity. Use SDK 3.10.6+, enable the corresponding advanced reports and SenderType, and match the `SensaLabContact` tag |
| 08, same plug and lateral motion, select Measure this socket on FullFlow Palm or Forearm | `pose-aligned-depth` | EXTRA MARKERS supplies `LabPair` Root, Tip and Side. Replace Main/Others with the actual instance and category. Move along the axis, then outside the aperture and check validity |
| 08, leave the plug stationary as a reference, move your own Avatar root target forward, hold, move sideways | `self-four-anchor-axial`; for a Contact root use `contact-position`, `contact-speed`, `self-contact-stroke` | Equip the matching Sensa four-anchor or direct Contact root prefab, select the actual instance and enable spatial input. Z should hold at fixed depth, speed should decay at rest |

Toggle EXTRA MARKERS off before pairing with another player's Pose Plug to avoid competing markers on the same channel. Stations 06/07 cover Shader transport and model diagnostics.

## Known-geometry references

The independent Point fixture uses a 0.001-radius Sender, 2-radius Receivers and tetrahedral axis offsets of ±0.35. Its generator and decoder both read `SensaPoseProtocol`; inspect actual proximity readings in the current scene. The layout uses its own reference object, without the SPS four-anchor tracking AvatarRootLocal frame or Sample counter.

For the known 20 cm SPS Plug, Socket positions (0,0,.24), (0,0,.12) and (.06,0,.12) represent Outside, Near and Offset. Axial Near/Offset truth is 40%, while the radial estimate is about 40%/32.9%. OGB normalization, SDK signed distance, root decoding and model displacement are different quantities.

Enable native **SPS OSC / OGB_ENABLED** separately. Actual paths and source matter; exact Contact tangency and fully saturated values do not guarantee a useful runtime estimate.

## Diagnostic image bridge

Use an isolated Sensa configuration with **outputs empty and input off**, enable its OSC receiver and apply OSC mode before forwarding. `sensa-preview.json` uses WebUI 5087; set `SENSA_CONFIG_PATH` explicitly to your selected file. Port 9001 below is an example receiver port.

```shell
python -m pip install -r scripts/requirements-capture.txt
python -X utf8 scripts/shader-osc-bridge.py --image "<World project>/Validation/sps-telemetry.png"
python -X utf8 scripts/shader-osc-bridge.py --image "<World project>/Validation/sps-telemetry.png" --watch --duration 300 --port 9001
```

Without `--port`, decoding does not send OSC. The full 16×8 grid needs at least 4×4 pixels per cell. Rectangular stretching is supported, automatic discovery and perspective correction are not.

For replay diagnostics, `--status-every-frame` writes a JSON status for every capture, including invalid samples; the default logs only status changes. Replay tools can acknowledge a decoded frame before replacing it with the next one. OSC data and freshness rules stay unchanged.

Startup/recovery requires two new progressing frames. Duplicate/stale frames, changed XYZ under one sequence, CRC/order faults and freeze cannot restore validity; exit clears it. Force-kill/network loss also needs Sensa's input timeout. A producer sequence reset may require restarting the bridge.

Inspect only `Sensa/Diagnostics/Shader/0/{Frame,X,Y,Z,Valid}`. It is diagnostic transport, not a mappable native root or calibration source. Nonzero `Sensa/Shader/<id>` follows the separate [native root registration](../../unity/top.sealoong.sensa/GPU-TRACKING.en.md). Binary ID, coordinate mode, Frame and CRC remain even though public Producer/Profile fields were removed.

Actual editor model PNGs need the baked Resolver/surface and a rendering non-stereo camera in **Tools → Sensa → SPS GPU Model Probe (Experimental)**. Their entry-minus-root world-axis displacement is not axial insertion. The world's uploadable camera experiment remains synthetic.

## Reports and acceptance

When checking an experimental scene, use its revision-specific `Validation/` reports for components, samples, CRC and freeze recovery. Keep input disarmed and outputs empty during diagnostics. Release CI runs unit checks and browser E2E; these do not replace this world's Unity/ClientSim/PlayMode checks or validate native image capture and hardware motion.

PB grabbing permissions, multilingual fonts/HMD readability, actual uploaded OSC, camera retention, mirrors, HDR/AA, capture latency and multi-player behavior still need real-client acceptance.

[Development](DEVELOPMENT.en.md) · [Camera experiment](CAMERA-PROTOTYPE.en.md) · [Diagrams](https://sealoong.github.io/Sensa/parameter-geometry.html)
