# Internal lab integration

[简体中文](lab-workflow.md) | **English**

This page preserves internal avatar/world tooling, rather than defining a production installation/control route. Start with the [OGB / SPS, Sensa SPS fixed-root or Shader capture routes](usage-scenarios.en.md). Use your own projects and licensed assets; there is no public world link or automatic upload. Keep outputs empty and input disarmed initially. [Prop interaction](lab-interaction.en.md)

| Stage | Internal tool entry |
| --- | --- |
| Avatar project | `Assets/SensaAvatarLab/Generated/FullFlow.unity`, private SDK upload |
| World project | `Assets/SensaLab/Functional/FunctionalLab.unity`, SDK Build & Test or private upload |
| VRChat | Wear the corresponding avatar; enable OSC/Contacts and required self interaction |
| Sensa | Check the receiver port/source; 9001 is the usual receive port |

FullFlow already contains QuickStart and experimental components. Do not duplicate them. Prop placement, SPS enablement, measurement selection and Sensa input permission are separate states.

## Verification order

1. **Internal scalar fixture:** START HERE's five steps/STOP and wrist QuickStart test synthetic steps/gates only. Manually configure Depth/GateEnable from actual received parameters; there is no built-in Connection test or QuickStart preset. Expected world values are not OSC acknowledgments.
2. **Native PB:** map the actual `_Stretch`/`_IsGrabbed` parameters to stretch/gating. Replace `MyPB` in the PhysBone template with the actual prefix; the template does not prescribe `Sensa/Lab/PB`. Release should close the gate, without Contact XYZ.
3. **Existing OGB / SPS:** enable avatar SPS/SPS OSC and inspect actual OGB parameters. Explicitly enable the OGB parameter heartbeat in receiver settings if required. Use the unified depth or vibration template, pinning object/source. Modern Root/Tip priority and legacy single-proximity fallback depend on actual producer capabilities, rather than separate Socket/Plug presets. Separate before approaching to learn length; radial proportion is not accurate arbitrary-pose stroke.
4. **Fixed root:** use Fixed SPS Root Probe/Automatic SPS Setup on an avatar you can build, explicitly selecting the root. Four anchors stay under the avatar root; a dedicated Self marker and Profile/Valid/Scale/changing heartbeat guard the measurement. Calibrate in the local points/roots panel before explicitly permitting experimental spatial input. Others is diagnostic-only. Legacy Point/Handle/paired Pose/SharedRoot remain internal experiments, not the new fixed-root protocol or prerequisites for production routes.
5. **Shader:** the package's native producer samples actual root transforms with nonzero producer/Profile1. Explicit ROI registration leads to the same root calibration flow; actual client capture still needs acceptance. Internal fixed (.25,−.5,.75) synthetic codes and Editor Model Probe PNGs are Profile0 diagnostics, not native-root or final-mesh evidence. [Shader guide](../unity/top.sealoong.sensa/GPU-TRACKING.en.md)

Disarm before switching tests, remove the previous mappings/gates, save and check actual mode/source/validity before deciding to enable input. The three built-in templates exclude synthetic steps. Do not retain fixture Active gates in production mappings.

## Freshness and stopping

Use each route's rules, rather than applying a universal one-second oldest-channel rule. Legacy Point/Handle/Pose inspect the oldest contributing channel; fixed roots inspect validity/changing heartbeat; Shader roots inspect changing Frame. Cached stationary values and repeated identical metadata establish different things. A stricter positive input timeout still applies. [Positioning/stopping](positioning.en.md)

The device-free `tools/unity-world-lab/sensa-preview.json` explicitly sets a 500 ms timeout; that is not every route's default. Low residual does not establish identity, atomic sampling or correct device stroke.

## World SPS targets

At **08 MY AVATAR SPS**, amber WORLD PLUG approaches your Socket; blue WORLD SOCKET receives your Plug. World Contacts may trigger Self/Others. Inspect actual parameters rather than treating menus or suffixes as identity proof. World values are geometry references, not avatar OSC acknowledgments.

## Devices and evidence

Follow [First use](quick-start.en.md) to establish connection, direction and a small range. Explicitly permit device input only after checking reception/stopping. Output cards show commands rather than device readback.

Record commit, Unity/SDK/client versions, object/source, paths, sample age and stop behavior. Editor/ClientSim/SDK bundles prove their respective checks. Actual upload, Contacts/OSC, VR grabbing, desktop/HMD codes, accuracy and mechanical behavior need separate acceptance.

[Three routes](usage-scenarios.en.md) · [Avatar tools](../tools/unity-avatar-lab/README.en.md) · [World tools](../tools/unity-world-lab/README.en.md)
