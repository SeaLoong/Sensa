# Lab props: hold, place and interpret

[简体中文](lab-interaction.md) | **English**

This page is for internal Avatar/World Labs. See [routes](usage-scenarios.en.md) for production use. Generated scenes are `Assets/SensaAvatarLab/Generated/FullFlow.unity` and `Assets/SensaLab/Functional/FunctionalLab.unity`. Rebuild/private-upload after changes; nothing uploads automatically.

## Avatar menus

In **Sensa Test Props**, choose Palm Socket, Forearm Socket, PB handle or Shader rig:

1. Left hand/Right hand follows that hand.
2. Place in world stops following and keeps the location.
3. Home / reset returns home; select a hand again to retrieve it.

The lollipop retains SPS_Lollipop → LeftHand/RightHand/Fixed/Off. Menus also expose SPS OSC, Measure plug, Socket's Measure this socket and synthetic Shader/CRC-fault controls. Placement, measurement, SPS activation and device permission are distinct.

Names, entry centers, +Z and probes start visible; Visible labels / probes hides helpers. Text uses double-sided static meshes, not post-upload TextMesh. Menus use build-time language; per-player World language needs client acceptance. [Languages](languages.en.md)

QuickStart stays on the right wrist for internal scalar steps, not as a production SPS prop. No built-in step preset exists: configure actual paths manually. World test balls can be held/placed.

## World buttons and native SPS area

LEFT/RIGHT follow the local player's hand, PLACE stays put, HOME releases/resets. Direct grabbing exits button-follow mode. Moving a PB reference frame does not stretch its bone; grab the PB ball. Buttons affect local props, not devices.

08 MY AVATAR SPS contains:

- Amber WORLD PLUG: 20 cm, approaching your Socket.
- Blue WORLD SOCKET: receiving your Avatar's Plug.

Enable Avatar SPS/SPS OSC, fix Sensa instance/source and choose depth/vibration. Explicitly enable OGB heartbeat if required; it grants no device permission. Separate then approach. Ten centimeters into an aligned 20 cm Plug is only an approximate 50% reference; lateral offset exposes radial error. Self/Others does not authenticate players; World text is not an OSC receipt.

![Native SPS Avatar area](images/native-sps-avatar-zone.png)

## Legacy P/C colors are not fixed anchors

Paired Pose/PB experiments retain these sample labels, not device axes or travel percentages:

| Marker | Color | Legacy leaf |
| --- | --- | --- |
| P1/P2/P3/P4 | Red/blue/green/yellow | A0/A1/A2/A3 |
| C5/C6/C7/C8 | Purple/cyan/orange/light gray | A4/A5/A6/A7 |

Tetrahedra use P1–P4; eight-point arrays use C1–C8. C1–C4 reuse red/blue/green/yellow but differ spatially: P2 is not C2. Measure plug shows Palm/Plug-handle P frames; Socket uses C arrays, with Root/Tip/Side sharing locations but separate paths. Independent PB frames also use P.

Four-anchor tracking uses **P0–P3 fixed under the Avatar root** and a dedicated moving marker, colored blue/teal/purple/rose. Neither old C arrays nor their A0–A3 subset are those anchors. Lists retain real paths; L/R/V/A remain device-command axes.

![Legacy probe centers/colors](images/probe-colors.png)

## Acceptance boundaries

Build/ClientSim checks can establish menus, placement, reset and generated controllers, not uploaded Avatar OSC, HMD grabbing or hardware. Legacy spatial motion defaults blocked; channel count/low residual proves neither common Sender nor atomic frames.

Four-anchor tracking has its own geometry/Sample and still requires opt-in, calibration and stop checks. Lab Shader props are synthetic transport fixtures. Native root encoding has a separate producer and still does not sample the deformed mesh. [Positioning](positioning.en.md) · [Workflow](lab-workflow.en.md) · [Shader](../unity/top.sealoong.sensa/GPU-TRACKING.en.md)
