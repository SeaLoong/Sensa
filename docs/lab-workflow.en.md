# Test avatar, world and Sensa workflow

[简体中文](lab-workflow.md) | **English**

Keep Sensa's output list empty for the first three tests. **Expected** on world boards means a reference value; output cards show sent commands. Neither is hardware position feedback.

## Prepare once

| Where | Open | Action |
| --- | --- | --- |
| Avatar Unity project | `Assets/SensaAvatarLab/Generated/FullFlow.unity` | Build and upload **Private**. Do not add duplicate QuickStart/automatic components |
| World Unity project | `Assets/SensaLab/Functional/FunctionalLab.unity` | SDK Build & Test or private upload; no public/Community Labs publishing |
| VRChat | Newly uploaded FullFlow avatar | Enable OSC, Contacts and required self-interaction permissions |
| Sensa | `http://127.0.0.1:5086` | No devices yet; enable OSC receiving, save, select OSC and apply input mode |

Unity Play Mode / ClientSim does not emit avatar OSC. Real avatar → Sensa testing requires the VRChat client. For your own avatar, follow [QuickStart](quick-start.en.md).

Stop other programs owning UDP 9001. Pin the avatar source when multiple sources exist. The shader bridge uses a separate source; switch back after testing it.

## Every time you change tests

1. **Disable input** and turn off unused avatar experiments.
2. Choose the new preset and **Replace draft**, not Append draft. Retained GateEnable rules all participate.
3. **Save and apply mappings**. Saving disables input.
4. Check received OSC, then enable input to inspect running targets. **Workflow checks** identifies inactive listeners/modes, unsaved drafts, gates and invalid tracking.

Calibration and pose replacement buttons also replace the entire draft and remove old gates. Restore mappings before saving to discard the draft. Explicitly add back any custom vibration/auxiliary/gate rules you still need.

## Test 1: QuickStart signal chain

At **00 START HERE**, no SPS or measurement selector is needed.

- Preset: **Start · Test world → My avatar**, exactly Depth and Active.
- Five buttons: `Sensa/QuickStart/Depth` ≈ 0/.25/.5/.75/1; Active=1.
- With input on, logical L0 follows those percentages. STOP sets Active=0 and closes the gate.
- TOUCH measures right-wrist proximity to the cyan ball. RESET restores and stops. Leaving >3 m or waiting 60 seconds also stops.

No parameters means investigate avatar version, OSC, Contacts and port. Correct parameters with a stationary target means check applied mode, input, saved mappings and source.

## Test 2: Your grabbed PB handle

Avatar menu **Sensa Test Props → PB handle → Left hand / Right hand**. Move it in front of you and **Place in world**. This fixes the reference frame; grab and move the white ball to exercise PB.

1. Replace with **Sensa PB handle · Z displacement (calibrate)**. Find `Sensa/Handle/v1/LabHandle/Self/` and pin the source.
2. In **Range calibration**, choose LabHandle. Keep it grabbed while capturing 0% and 100%; expect four valid samples and coordinates.
3. **Replace with calibration**, save, re-enable input and move between endpoints. Releasing should invalidate tracking and stop output.

LabHandle does not need a Socket selection in Sensa Lab. No physical collisions is intentional. Check VRChat PhysBone self-interaction permissions if it cannot be grabbed.

## Test 3: Native SPS

Enable **Sensa Test Props → SPS OSC**. Placement, native SPS activation, Sensa measurement and software input are independent switches.

| Test | Avatar/world action | Sensa |
| --- | --- | --- |
| Your Plug into your Socket | Lollipop RightHand; Palm Socket placed in front | SPS Socket new depth · Self only; actual Socket path |
| World Plug into your Socket | Amber WORLD PLUG at **08 MY AVATAR SPS** | Socket preset and actual observed instance |
| Your Plug into world Socket | Lollipop into blue WORLD SOCKET | SPS Plug preset and actual observed instance |

Separate the targets first, then approach to learn Root/Tip length. World Contacts can affect Self and Others; suffix alone does not establish origin. World experiment boards are local measurements, not proof of your avatar's OSC.

## Test 4: Additional geometry and shader experiments

- **Measure plug:** local Plug position relative to its reference; calibrate it as a local point.
- **Measure this socket:** eight C1–C8 root probes; root XYZ is not accurate insertion ratio.
- **Paired pose:** matching `LabPair` Root/Tip/Side markers are required. Ordinary SPS alone cannot provide full paired pose.
- **Synthetic code:** shader transport/frame/CRC/Valid test only. Fixed (.25, −.5, .75) is not SPS geometry; a 0–.2 m Z mapping saturates at 100%.
- **Actual SPS GPU PNG:** exported through the Unity editor GPU Probe. Offset is approximately (.06, 0, .12), so the Z template previews 60%. Follow [image bridging](../tools/unity-world-lab/CAPABILITIES.en.md#image-bridge), check Valid, CRC failure, freeze and recovery.

Shader is optional. Afterwards turn it off, stop the bridge and restore avatar source/preset. Exiting a bridge does not power off hardware.

## Finally connect a device

Follow [QuickStart](quick-start.en.md) to assign the small L0 profile. Repeat five steps: expected sent targets 400/450/500/550/600, other axes ignored. STOP, then disable input. Verify hardware stroke, direction, speed interpretation and firmware independently.

Record avatar upload time, world version, Sensa commit/preview, source, paths, actions, expected/received values and failures. `Validation/latest-suite.json` records automated checks; it does not certify real-client or hardware behavior. Software E2E and screenshots run only in CI; [development notes](development.en.md) explain remaining validation boundaries.
