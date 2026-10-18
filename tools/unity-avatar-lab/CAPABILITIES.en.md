# Avatar capability matrix

[简体中文](CAPABILITIES.md) | **English**

Use [FullFlow](FULL-FLOW.en.md) for daily acceptance. Isolated scenes under `Assets/SensaAvatarLab/Capabilities/` separate input chains using the same base model. Exclusive/Shared remain combined/sharing comparisons.

| Scene | Final Contacts | Sensa receivers | Experimental PB | Operation / result |
| --- | --- | --- | --- | --- |
| Contact | 5 | 4 | 0 | Baseline/Near/Offset/Far outside; LabContact Point, baseline (0,0,.1) |
| PB | 0 | 0 | 1 | Grab/stretch/release; Sensa/Lab/PB_IsGrabbed and _Stretch, no XYZ |
| PBContact | 5 | 4 | 1 | LabCombined Handle, four samples plus grab gate |
| SPS | 25 | 0 | 0 | Enable FixtureSocket, Outside to learn length, Near/Offset; actual OGB and 20 cm SPS surface |
| SPSContact | 38 | 12 | 0 | Select Fixture Plug measurement; local tip Outside Z≈−.04, Near Z≈.08, Offset X≈−.06/Z≈.08 |
| Shader | 0 | 0 | 0 | Default off; synthetic (.25,−.5,.75), CRC fault, two-fresh-frame recovery |
| SPSShader | 25 | 0 | 0 | Real SPS plus editor capture Camera outside avatar root |

PB counts exclude Chocolat's original hair/clothing. Original model PhysBones are not modified by experimental collision settings.

In Play Mode, select GestureManager and operate menus. Contact/SPS fixture position uses `Sensa/Lab/Fixture`: default=0, Near=1, Offset=2, Far outside=3. Native SPS activation is separate; SPSContact also needs a Sensa target selection.

Enable **Enable SPS OSC (local)** / OGB_ENABLED. VRChat OSC and Socket activation alone do not replace it. For your own Plug use Self. Native Contact parameters may not all appear in Expression Parameters; inspect the report's contactParameters.

These three SPS fixtures deliberately disable Hip Avoidance to permit known same-avatar hip-mounted interaction. The original lollipop/daily-avatar settings are unchanged.

For a 20 cm Plug, Self NewRoot/NewTip expects Outside≈.77/.96, Near≈.89/1, Offset≈.875836/1. With root-radius compensation and learned length, Near≈40%, Offset≈32.9%. Fully saturated Root leaves the final 1 cm unknown, so the conservative result is about 95%, not proof of full insertion.

PB-only Stretch is not XYZ. PBContact supplies experimental local estimates without proving a shared Sender/frame. New experimental handles allow grabbing, disable collisions and keep a nonzero grab radius; verify real self/other interaction permissions in the client.

## Connect to Sensa

Keep outputs empty and apply OSC mode. Use PB · Stretch with actual Stretch/IsGrabbed paths. Copy the modern radial template and select actual Self/Others paths for SPS. Contact/PBContact have no default positioning preset: observe them in OSC → Experimental diagnostics. Explicit permission and oldest-channel freshness still do not establish reliable positioning. Restrict the actual instance/source and check current reports and received paths.

The [world capability guide](../unity-world-lab/CAPABILITIES.en.md) covers diagnostic transport at `Sensa/Shader/v1/0/{X,Y,Z,Frame,Valid,Producer,Profile}` (Profile0, preview-only). This lab's SPSShader Camera is outside the avatar and is **not uploaded**; its uploadable Shader scene produces synthetic code. The separate [native root capture](../../unity/top.sealoong.sensa/GPU-TRACKING.en.md) uses actual root transforms and nonzero producer/Profile1. SDK build success does not prove client camera retention or HMD invisibility.

## Build/check tools

**Create capability matrix** creates seven scenes without overwriting edits. **Validate capability matrix** runs SDK/NDMF/VRCFury preprocessing and checks component counts, SPS shaders and PB settings; it does not mean every scene has a separately built .vrca.

**Build Shader with SDK (no upload)** and **Inspect Shader SDK bundle** check the synthetic rig's cameras, default-off selection and local CRC parameter. Client visibility remains a separate manual test. Automated E2E/screenshots run only in CI.

All Avatar/World uploads remain private. Tools do not upload automatically; local models/projects do not go to the public repository.
