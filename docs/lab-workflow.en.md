# Internal lab workflow

[简体中文](lab-workflow.md) | **English**

Avatar/World Labs provide development scenes for checking measurement behavior. For everyday integration, choose [OGB, SPS four-anchor tracking, Contact direct tracking or Shader](usage-scenarios.en.md). Use your own Unity projects and licensed resources, then build or upload privately through the SDK. Start with input off and no outputs.

## Preparation and entry points

| Project/application | Entry |
| --- | --- |
| Avatar | `Assets/SensaAvatarLab/Generated/FullFlow.unity`, SDK private upload |
| World | `Assets/SensaLab/Functional/FunctionalLab.unity`, SDK Build & Test/private upload |
| VRChat | Wear the corresponding Avatar; check OSC/Contacts and needed self-interaction permissions |
| Sensa | Verify actual listener/source; default port 9001 |

Use the internal QuickStart and experiment components already included in FullFlow. Prop placement, SPS activation, measurement selection and device permission are managed separately. [Prop menus](lab-interaction.en.md)

## Verify one question at a time

| Stage | Observe | Verification |
| --- | --- | --- |
| Synthetic scalar | START HERE five steps/STOP and wrist QuickStart values/conditions | Compare each step, then check stopping through STOP and a closed condition |
| Native PB | Stretch amount and IsGrabbed state | Grab and stretch, then release and check stopping |
| OGB / SPS | SPS2 · PenOthersNewRoot / PenOthersNewTip, or SPS1 · PenOthers / PenOthersClose | Fix object/source, separate then approach, and check depth trend and Close presence |
| SPS four-anchor tracking | Dedicated root, P0–P3, changing Sample and endpoint calibration | Move along one axis; check local direction and stopping after sample invalidity |
| Contact direct tracking (SDK Beta) | Add `SensaContactRootProbe` separately and follow [Contact setup](contact-sdk.en.md) for a dedicated own root; inspect metre-based XYZ, relative velocity in m/s, `Radius`, `Sample` and `Proximity_SenderType=1` (Self) | Calibrate position or speed; check stopping after leaving Receiver coverage or Sample activity freezing |
| Shader | Native block, capture region, producer ID, CRC and advancing Frame | Move the selected root and check decoded position, X/Z axes and Avatar world scale; obscure/freeze the block and check invalidity |

Configure synthetic Depth/GateEnable **manually** from actual paths. After the experiment, replace those paths and conditions with actual linkage parameters. Use the Avatar’s PhysBone prefix in place of MyPB in the PB template.

Use the OGB depth or vibration template and enable the heartbeat to VRChat as required by the Avatar. SPS four-anchor tracking uses Dedicated/Exclusive authoring and `Sensa/SPS/<id>/{P0,P1,P2,P3,Sample}`.

Native Shader uses one Camera and three natively skinned points to encode the selected root's position, X/Z axes and Avatar world scale. It uses a nonzero producer ID and sends `Sensa/Shader/<id>` after explicit ROI selection. FullFlow synthetic code and Editor Model Probe PNG use `Sensa/Diagnostics/Shader/0` to check encoding, capture and transport. [Shader guide](../unity/top.sealoong.sensa/GPU-TRACKING.en.md)

## Switch scenes and check time

Disable input, remove the previous mappings/gates, save, verify actual mode/source/validity, then explicitly reactivate. Check each model’s sampling-time rule separately:

- Legacy Point/Handle/Pose use the oldest participant, including grab.
- SPS four-anchor tracking uses changing Sample, default 1000 ms/cap 1250 ms; stationary P can cache.
- Contact direct tracking checks changing Sample with an age cap of 1000 ms, shortened by a smaller positive input timeout; zero coordinates and zero velocity remain valid when the other validity conditions hold.
- Shader bridge defaults to 350 ms freeze; desktop Frame change age caps at 500 ms.

The internal preview configures 500 ms in `tools/unity-world-lab/sensa-preview.json`. Record sample change age, geometric residual and actual device travel together. [Positioning](positioning.en.md)

## World interaction and language

The amber WORLD PLUG in 08 MY AVATAR SPS approaches your Socket; the blue WORLD SOCKET receives your Plug. World Contacts may trigger Self/Others. Expected labels/bars show geometric references; compare them with the actual values received by Sensa.

World text follows VRChat's current language and language-change event. The local panel offers Auto / English / 简体中文; an explicit choice applies only to that player's current session. Existing scenes need their display-language bindings refreshed, and uploaded-client fonts/layout still need manual inspection. Avatar menu text uses the language selected at build time and retains that text after upload. [Language boundaries](languages.en.md)

## Record evidence

Record commit, Unity/SDK/client versions, object/source, actual paths, change ages, stops and whether data was simulated. Record Editor, SDK bundle, ClientSim and actual-client results separately, so changes in Contacts/OSC, grabbing, capture, accuracy and device motion can be traced to the relevant step.

CI runs units, browser E2E and isolated process checks. Developers arrange Unity/World PlayMode and actual-client checks for the behavior being verified. Automated device-related checks use mock transports. [Development and releases](development.en.md) · [Avatar tools](../tools/unity-avatar-lab/README.md) · [World tools](../tools/unity-world-lab/README.md)
