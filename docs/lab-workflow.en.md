# Lab integration workflow

[简体中文](lab-workflow.md) | **English**

Use your own avatar/world projects and licensed assets. The repository supplies no public world link and uploads nothing automatically. Keep device outputs empty initially. See [Interaction](lab-interaction.en.md) for prop placement.

| Stage | Entry point |
| --- | --- |
| Avatar project | `Assets/SensaAvatarLab/Generated/FullFlow.unity`, private SDK upload |
| World project | `Assets/SensaLab/Functional/FunctionalLab.unity`, SDK Build & Test or private upload |
| VRChat | Wear the new avatar; enable OSC/Contacts and required self interaction |
| Sensa | Apply OSC mode, listen on default UDP 9001, leave input disabled |

FullFlow already contains QuickStart and experimental components; do not duplicate them. Prop selection, SPS enablement, measurement selection and desktop input permission are separate states.

## Recommended order

1. **Reception:** select the five START HERE steps and STOP. Use Connection test with only Depth/Active mappings. Check actual parameters; the world's Expected is not receipt confirmation.
2. **Native PB:** grab your avatar's PB, map actual `_Stretch` to Depth and `_IsGrabbed` to GateEnable. The template's `Sensa/Lab/PB` is a test path to replace. Release should close the gate. No Contact XYZ is needed.
3. **Native SPS:** enable avatar SPS/SPS OSC and inspect actual OGB paths. Modern VRCFury Socket uses same-instance NewRoot/NewTip; Plug uses PenOthers/PenSelf. Copy a draft and use its actual Self path for self tests. Separate before approaching to learn length; radial proportion is not arbitrary-pose stroke truth.
4. **Spatial experiments:** open OSC → Experimental diagnostics and observe Point/Handle/Root/Pose with experimental input disabled. Expand local points/roots for endpoint calibration. Explicit permission does not prove tracking reliability. Root/SharedRoot remain diagnostic-only.
5. **Shader transport:** Synthetic code tests images, frames, CRC, Valid, freeze and recovery. Fixed (.25, −.5, .75) is not SPS data. Real editor GPU model snapshots also do not establish general live client capture. [Bridge limits](../unity/top.sealoong.sensa/GPU-TRACKING.en.md)

Before switching tests, disable input, replace/save mappings, then inspect source, actual mode and gates before enabling. Remove unrelated QuickStart Active or other test gates. Ordinary scalar timeout defaults to off; spatial experiments still check the oldest contributing channel, with a default one-second age limit.

## World SPS targets

At **08 MY AVATAR SPS**, the amber WORLD PLUG approaches your Socket, while the blue WORLD SOCKET receives your Plug. World Contacts may trigger Self/Others. Choose actual received parameters rather than treating menus or suffixes as identity proof. World values are geometry references, not avatar OSC acknowledgments.

## Hardware last

Follow [First use](quick-start.en.md) for a small L0 range and verify hardware center/speed. Connect devices only after checking reception and stopping behavior. Cards show commands; low experimental residuals do not justify hardware activation.

Record commit, Unity/SDK/client versions, object/source, actual paths, sample age, failure reason and stopping behavior. Editor/ClientSim/SDK bundle reports prove only their own checks. Uploaded avatar OSC, physical VR grabbing, HMDs and mechanical behavior need separate acceptance.

[Positioning](positioning.en.md) · [Avatar tools](../tools/unity-avatar-lab/README.en.md) · [World tools](../tools/unity-world-lab/README.en.md)
