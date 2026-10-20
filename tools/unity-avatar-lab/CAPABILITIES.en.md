# Isolated Avatar capabilities

[简体中文](CAPABILITIES.md) | **English**

Use [FullFlow](FULL-FLOW.en.md) for integrated interaction and `Assets/SensaAvatarLab/Capabilities/` to isolate a route. Source and generated menu languages are described in [README](README.md).

| Scene | Isolates | Boundary |
| --- | --- | --- |
| Contact | Four-sample local Point | Known fixture geometry, not remote identity |
| PB | Native Stretch / IsGrabbed | Intensity and gate, no XYZ |
| PBContact | PB target plus Point/Handle samples | Experimental local position; grab/age gates still required |
| SPS | Native VRCFury Socket/Plug and OGB | Enable OGB_ENABLED and actual Socket/Plug |
| SPSContact | Native SPS plus Sensa measurements | Separate fixed-root/local/Pose fields, not one interchangeable array |
| Shader | Synthetic code and CRC/freeze recovery | Diagnostic transport, not an actual root |
| SPSShader | SPS model with an editor capture camera | Camera outside the Avatar is not uploaded |

Read current preprocess reports for Contact/PB/parameter counts: installed dependencies and enabled capabilities affect totals. Do not infer active Contact cost from the size of an Exclusive selection menu.

## Reference actions

Fixture position `Sensa/Lab/Fixture` uses 0=baseline, 1=Near, 2=Offset, 3=Far outside. Native SPS and Sensa target selection remain separate. Hip Avoidance is deliberately disabled in these specific same-avatar SPS fixtures, not in unrelated original models.

For the known 20 cm Plug, modern Self Root/Tip geometry predicts Outside≈.77/.96, Near≈.89/1 and Offset≈.875836/1. Corrected radial estimates are about 40% and 32.9%; saturation leaves the last centimeter unobservable. These are fixture/model references, not a measured client accuracy claim.

PB handles permit grabbing while disabling collisions and posing. Visible spheres are not collision or measurement radii. Actual self/other permissions and hand interaction still require client checks.

## Inspect in Sensa

Apply OSC mode with input off and outputs empty. Use actual PB Stretch/IsGrabbed paths for the native PB route. For OGB, choose the correct external family and source, enable native haptics parameters, and learn paired length outside saturation. Fixed SPS uses only `Sensa/SPS/<id>/{P0,P1,P2,P3,Sample}`; root observations require calibration and explicit experimental permission.

Independent Point/Handle/Pose do not inherit the fixed-root cache or Sample semantics. Synthetic/editor image output belongs only to `Sensa/Diagnostics/Shader/0/{Frame,X,Y,Z,Valid}`, without a mappable native root. Native `Sensa/Shader/<nonzero-ID>` is a separate [producer and registration flow](../../unity/top.sealoong.sensa/GPU-TRACKING.en.md).

Validation checks generated components, writable parameters, budgets, shaders and default-off state. SDK packaging is not upload, VR grabbing, real image capture or hardware validation. Automated E2E/PlayMode/screenshots are CI-only.

[World capabilities](../unity-world-lab/CAPABILITIES.en.md) · [Geometry diagrams](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=en-US)
