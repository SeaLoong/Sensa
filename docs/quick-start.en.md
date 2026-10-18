# First use

[简体中文](quick-start.md) | **English**

Verify the software chain before connecting hardware. Sensa does not flash or calibrate firmware; TCode serial uses **115200, 8N1**. You need an uploadable PC avatar and your own test world; there is currently no public world link. Existing FullFlow setups can use the [lab workflow](lab-workflow.en.md).

## 1. Start Sensa with no outputs

Download the desktop package for your system and CPU from [Releases](https://github.com/SeaLoong/Sensa/releases). Extract everything, run `Sensa.exe` or `./Sensa`, and open `http://127.0.0.1:5086`. No separate .NET installation is required.

Do not add devices yet. Keep input disabled in the top bar and open OSC.

## 2. Prepare the avatar and world

1. Install Modular Avatar/NDMF in a VCC Avatars project. Extract the Unity package to `Packages/top.sealoong.sensa`, with `package.json` directly inside.
2. Add **Sensa → Quick Start World Receiver** to a Humanoid avatar root. Upload privately through the SDK and wear the new version. It generates Depth/Active receivers and Animator parameters at the right-hand bone origin. No SPS, camera, Python or other-player installation is needed.
3. Open `Assets/SensaLab/Functional/FunctionalLab.unity` in the world project. Use SDK Build & Test or your privately uploaded version. **00 START HERE** is beside spawn.
4. Enable OSC and Contacts in VRChat. Sensa receives UDP 9001 by default; avoid another application binding the same port.

QuickStart verifies reception; it does not turn an avatar into an SPS avatar. A generated `FullFlow.unity` already includes this component: do not add a duplicate.

## 3. Check actual parameters

In Control, select and apply OSC mode. In OSC → Mappings, replace drafts with **Connection test**, then save. Keep only its Depth and Active mappings. Saving leaves input disabled.

Search for `Sensa/QuickStart` in Parameters. Select the five steps on the test bench, then STOP:

| Operation | Actual reception in Sensa |
| --- | --- |
| 0/25/50/75/100% | Active=1; Depth≈0/.25/.5/.75/1 |
| STOP | Active=0; gate closed |
| TOUCH | Depth rises as the right wrist approaches the cyan sphere |

With no outputs, enable input to inspect the five logical L0 steps. TOUCH uses the right-hand bone origin, usually at the wrist. Desktop users can click the step buttons. RESET restores and stops the bench; walking more than 3 meters away or reaching 60 seconds also closes the test.

The world's Expected value is only an expectation. Compare it with actual Sensa parameters; a changing world display does not prove generated avatar components or delivered OSC.

## 4. Connect hardware for a small-stroke test

1. Disable input. In Settings, create an axis profile using **OSR first test · small L0 stroke**: L0 only, logical 0–100% to TCode 400–600, speed limit 100. Verify these values against your hardware calibration.
2. Add a serial output in Control, choose the actual port and bind that profile. Network firmware needs the correct UDP/TCP destination. Save, enable and connect.
3. Check actual mode and mappings, enable input and repeat the five steps. Sent targets should be about **400, 450, 500, 550, 600**, allowing rounding by 1.
4. Press world STOP and confirm Active=0, then disable input. Cards show targets, not measured mechanical positions. Stop is not centering or physical power-off.

## Switch to ordinary input

Stop input, select one of the [five current presets](presets.en.md), or add actual parameters. Save replacements and remove the QuickStart Active gate. Native SPS requires enabled Haptics/OSC; some avatars also need `OGB_ENABLED=true`. Neither VRCFury Socket radial estimation nor Plug proximity supplies accurate insertion depth at arbitrary orientations.

PB stretch can use native Stretch plus IsGrabbed directly. Contact position estimates are disabled by default; four proximity samples are not a reliable tracking guarantee. See [Positioning principles and limits](positioning.en.md).

## No data or movement

Check in order: new avatar worn → VRChat OSC/Contacts enabled → actual OSC mode → correct listener port → correct input source → saved mappings → valid gates → connected output → enabled input.

Ordinary scalar timeout defaults to off because unchanged VRChat values may not be resent. The bench's automatic stop also relies on the client sending Active=0; disable input explicitly when finished. See the [User guide](guide.en.md) for transport/configuration troubleshooting.

[Home](../README.en.md) · [World tools](../tools/unity-world-lab/README.en.md) · [Avatar tools](../tools/unity-avatar-lab/README.en.md)
