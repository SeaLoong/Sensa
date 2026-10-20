# Internal lab workflow

[简体中文](lab-workflow.md) | **English**

Avatar/World Labs are development tools, not installation routes. For actual use choose [OGB, fixed SPS roots or Shader](usage-scenarios.en.md). No paid models, public world or automatic upload are included. Use your own projects/licensed resources, initially with input off and no outputs.

## Preparation and entry points

| Project/application | Entry |
| --- | --- |
| Avatar | `Assets/SensaAvatarLab/Generated/FullFlow.unity`, SDK private upload |
| World | `Assets/SensaLab/Functional/FunctionalLab.unity`, SDK Build & Test/private upload |
| VRChat | Wear the corresponding Avatar; check OSC/Contacts and needed self-interaction permissions |
| Sensa | Verify actual listener/source; default port 9001 |

FullFlow already contains internal QuickStart/experiments; do not add duplicates. Prop placement, SPS activation, measurement selection and device permission are separate. [Prop menus](lab-interaction.en.md)

## Verify one question at a time

| Stage | Observe | Do not infer |
| --- | --- | --- |
| Synthetic scalar | START HERE five steps/STOP, wrist QuickStart's actual values/gates | Production SPS/position accuracy |
| Native PB | Actual Stretch/IsGrabbed; release closes gate | Contact XYZ |
| OGB / SPS | Actual object/source, Root/Tip or legacy proximity/Close | Accurate insertion for arbitrary poses |
| Fixed roots | Dedicated root, P0–P3, changing Sample, endpoints/invalidity stop | Atomic frames/world coordinates |
| Shader | Actual native block/ROI/ID/CRC/advancing Frame | Synthetic code establishes capture |

Configure synthetic Depth/GateEnable **manually** from actual paths. No built-in “link test” or QuickStart preset exists. Remove fixture Active gates before production mappings. Replace MyPB in the PB template with its real prefix instead of using an old `Sensa/Lab/PB` placeholder.

Use unified OGB depth/vibration templates rather than separate Socket/Plug presets; explicitly enable the heartbeat to VRChat if needed. Dedicated/Exclusive fixed roots use only `Sensa/SPS/<id>/{P0,P1,P2,P3,Sample}`; independent Point/Pose is not a prerequisite.

Native Shader uses one Camera, an actual CPU root and nonzero ID, sending `Sensa/Shader/<id>` after explicit ROI selection. FullFlow synthetic code and Editor Model Probe PNG are only `Sensa/Diagnostics/Shader/0` transport diagnostics, not position input. [Shader guide](../unity/top.sealoong.sensa/GPU-TRACKING.en.md)

## Switch scenes and check time

Disable input, remove the previous mappings/gates, save, verify actual mode/source/validity, then explicitly reactivate. Do not call every spatial timeout “oldest one second”:

- Legacy Point/Handle/Pose use the oldest participant, including grab.
- Fixed SPS uses changing Sample, default 1000 ms/cap 1250 ms; stationary P can cache.
- Shader bridge defaults to 350 ms freeze; desktop Frame change age caps at 500 ms.

The 500 ms in `tools/unity-world-lab/sensa-preview.json` is explicit internal preview configuration, not every route's default. Low residual proves neither shared Sender, atomic frames nor correct travel. [Positioning](positioning.en.md)

## World interaction and language

The amber WORLD PLUG in 08 MY AVATAR SPS approaches your Socket; the blue WORLD SOCKET receives your Plug. World Contacts may trigger Self/Others. Expected labels/bars are geometric references, not Avatar OSC acknowledgements; inspect actual Sensa values.

Per-player automatic World language/local switching is being integrated and needs runtime acceptance. Avatar menu text is generated at build time, not translated per player. [Language boundaries](languages.en.md)

## Record evidence

Record commit, Unity/SDK/client versions, object/source, actual paths, change ages, stops and whether data was simulated. Editor, SDK bundle and ClientSim prove separate boundaries. Real uploads, Contacts/OSC, VR grabs, desktop/HMD blocks, accuracy and mechanisms need separate acceptance.

Browsers, full-process smoke, screenshots and World PlayMode run only in Actions. Device tests use mocks locally too. [Workflow](development.en.md) · [Avatar tools](../tools/unity-avatar-lab/README.md) · [World tools](../tools/unity-world-lab/README.md)
