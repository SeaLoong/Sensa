# Your first OSR test with Sensa

[简体中文](quick-start.md) | **English**

You need a TCode-capable device, its cable/network settings, PC VRChat and an avatar you can re-upload. Sensa does not flash or calibrate firmware. Serial currently uses **115200, 8N1**; confirm this against your device documentation.

## Choose a route

| Goal | Avatar requirement | Sensa preset |
| --- | --- | --- |
| Verify the complete chain | Quick Start World Receiver | Start · Test world → My avatar |
| Use existing SPS daily | Native SPS OSC/Haptics | Matching Socket/Plug and Self/Others preset |
| Track a local bone or grabbed PB | Local Bone or PB Probe, or automatic setup | Local point/PB preset, calibrated |
| Investigate geometry or shader data | Advanced Unity setup | Matching diagnostics/experiment |

**Automatic SPS Setup's default Root is diagnostic only.** QuickStart tests the chain; it does not turn an arbitrary avatar into an SPS avatar. If FullFlow is already configured, follow the [lab workflow](lab-workflow.en.md).

## 1. Download

Download the appropriate [release preview](https://github.com/SeaLoong/Sensa/releases), usually `win-x64.zip` on Windows. Extract everything, run `Sensa.exe`, and open `http://127.0.0.1:5086`. Select English in the top bar if needed. Keep the output list empty for now.

Download `top.sealoong.sensa-*.zip` separately for Unity.

## 2. Add the avatar component

1. Open your humanoid avatar in a VCC **Avatars** project. Check its right-hand bone mapping.
2. Install Modular Avatar (with NDMF). Extract Sensa to `Packages/top.sealoong.sensa`; `package.json` must be directly inside that directory. SPS, VRCFury, cameras and installation by other players are unnecessary for QuickStart.
3. Select the root with Avatar Descriptor. Add **Sensa → Quick Start World Receiver** once. No manual placement or parameter setup is needed.
4. Build & Publish through the VRChat SDK as **Private**, then wear the new version.

Build generates two local Contacts at the right-hand bone origin, usually the wrist: a depth Float and an activation Bool. It merges FX parameters, uses no network parameter bits and defaults both values to zero without saving them. Radius follows viewpoint height; the world adjusts to the current avatar height. Touch with the wrist, not only fingertips.

The test avatar project already includes `Assets/SensaAvatarLab/Capabilities/QuickStart.unity`. Use **`Assets/SensaAvatarLab/Generated/FullFlow.unity`** for one avatar containing QuickStart, PB, SPS, pose and optional shader experiments. Do not redistribute its proprietary model assets.

## 3. Verify avatar → Sensa

1. Enable VRChat **OSC → Enabled** and Avatar Dynamics/Contacts.
2. Enable Sensa OSC receiving and save. Normal local VRChat sends to UDP **9001**; no other program should own that port.
3. Choose OSC and **Apply input mode**.
4. Select **Start · Test world → My avatar**, **Replace draft**, then **Save and apply mappings**. Keep only its Depth and Active rules.
5. Open `Assets/SensaLab/Functional/FunctionalLab.unity` in the world project. Enter through SDK Build & Test or your private upload. There is no public test-world link.
6. At **00 START HERE**, press the five percentage buttons. Search `Sensa/QuickStart` in Sensa. You may enable input to inspect running targets while the output list remains empty.

| Action | Received OSC | Logical L0 |
| --- | --- | --- |
| Enter, no button pressed | Active=0; Depth may not have been sent | Gate closed |
| 0 / 25 / 50 / 75 / 100% | Active=1; Depth≈0 / .25 / .5 / .75 / 1 | Approximately 0 / 25 / 50 / 75 / 100% |
| TOUCH | Active=1; moving the right wrist toward the cyan ball raises Depth | Follows distance |
| STOP, >3 m away, 60-second expiry, avatar change | Active returns to 0 after the client sends it | Gate closes; stop requested |

Steps move a world Contact Sender to generate controlled inputs. TOUCH is free distance testing. The ball is grabbable; RESET returns it home and stops. Desktop users can click buttons. Selection is local, not broadcast.

![QuickStart station](images/quick-start-bench.png)

The world displays **Expected**, not measured avatar receipt or device position. Compare it with Sensa's actual received values. A transition may fluctuate for a frame; steady steps should normally be within about 1%. Unusual bone scale/viewpoints and client differences need real testing.

## 4. Connect OSR only after that

1. Disable input. Create an axis profile using **OSR first test · small L0 stroke**: only L0, logical 0–100% → TCode **400–600**, speed limit 100. Check these against your calibrated hardware; the preset is not universal mechanical calibration.
2. Add **TCode Serial**, choose the real port and assign that profile. Network firmware instead needs the correct UDP/TCP endpoint.
3. Save, connect, check mode and mappings, then enable input. Already active input/open gates may send motion immediately upon connection.
4. Repeat 0→25→50→75→100%. Sent targets should be approximately **400, 450, 500, 550, 600**, allowing rounding by 1.
5. Press world STOP, confirm the gate closes, then disable input. Stop does not power off or center hardware. Ignored axes do not automatically center either.

Input timeout defaults off because VRChat may only send changes. World auto-stop depends on the client sending Active=0; abnormal exit may lose that packet. It does not replace firmware timeout protection, Sensa's stop control or physical power isolation. Explicitly disable input after testing.

## 5. Switch to everyday SPS

Stop input, replace the entire draft with the [matching SPS preset](presets.en.md), and remove the QuickStart gate. Native haptics/OSC must be enabled, sometimes through **OGB_ENABLED**. Test avatars expose **Enable SPS OSC (local)** / **SPS OSC**; arbitrary avatars may use other controls.

Find the actual Socket/Plug instance and pin its source. NewRoot/NewTip and older PenOthers are not exact 3D stroke truth under arbitrary offsets/angles. Add Sensa components only for extra tracking, PB or paired pose. QuickStart can be removed and the avatar re-uploaded without affecting native SPS.

## Troubleshoot

| Symptom | Check |
| --- | --- |
| World changes, no QuickStart OSC | New avatar worn, OSC/Contacts enabled, receiver port free |
| Depth but no Active | Both receivers generated, session not expired, no old gates |
| OSC changes, target does not | Applied mode, saved mappings, input on, correct pinned source |
| Running target changes, output blank | Profile assignment, enabled connection and logs |
| Serial cannot open | Port, ownership, driver/permissions, 115200 TCode support |
| Sent target but no motion | Firmware, power and hardware calibration; UI is not mechanical feedback |
| Stops while stationary | Input timeout or the station's 60-second limit |
| Always gated after switching to SPS | Remove QuickStart Active and check native SPS parameters |

References: [VRChat Contacts](https://creators.vrchat.com/common-components/contacts/), [VRCFury SPS](https://vrcfury.com/sps/).
