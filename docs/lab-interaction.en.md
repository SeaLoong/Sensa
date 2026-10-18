# Hold, place and identify test targets

[简体中文](lab-interaction.md) | **English**

This describes internal lab props, not a production installation/control route. Start with the [three integration routes](usage-scenarios.en.md). The lab uses `Assets/SensaAvatarLab/Generated/FullFlow.unity` and `Assets/SensaLab/Functional/FunctionalLab.unity`; rebuild and privately upload changes before client testing.

## Avatar props

Under **Sensa Test Props**, Palm Socket, Forearm Socket, PB handle and Shader rig offer:

1. **Left hand / Right hand** to follow a hand.
2. Move into position and choose **Place in world**; the prop stays when you walk away.
3. **Home / reset** returns to the initial pose; select a hand again to retrieve it.

The lollipop keeps **SPS_Lollipop → LeftHand / RightHand / Fixed / Off**. The same menu contains **SPS OSC**, **Measure plug**, per-socket **Measure this socket**, and shader synthetic/CRC switches. Placement alone does not enable measurement or software output.

Labels, opening centers, +Z arrows and probe balls are visible by default. **Visible labels / probes** hides them without changing measurement. Avatar text is a double-sided static mesh rather than a client-unsupported TextMesh component.

QuickStart stays at the right wrist solely for the internal synthetic scalar-step bench. It is not a production route or movable SPS prop, and has no built-in step preset. Configure fixture mappings manually from actual parameters.

## World controls

The physical rack, QuickStart ball and native SPS props provide **LEFT / RIGHT / PLACE / HOME**. Directly grabbing a pickup exits button-follow mode. Moving a PB reference frame does not stretch the PB; grab its ball for that. These are local actions and never operate OSR hardware directly.

## Native SPS with your avatar

At **08 MY AVATAR SPS** near spawn:

- Amber **WORLD PLUG**, 20 cm long: approach your enabled avatar Socket and inspect its actual OGB parameters.
- Blue **WORLD SOCKET**: approach with your avatar Plug and inspect its actual OGB parameters.

Enable native SPS/SPS OSC. Select the OGB / SPS depth or vibration template, pin the observed instance/source, save and explicitly apply OSC input. If required, explicitly enable the OGB parameter heartbeat in receiver settings; it does not grant device input permission. World Contacts can trigger Self/Others; suffixes alone do not prove origin.

Separate first, then approach. With an aligned 20 cm Plug, 10 cm insertion is about 50%. Lateral offset exposes radial-estimation error. The world explains geometry; Sensa confirms actual receipt.

![Native SPS station](images/native-sps-avatar-zone.png)

## P and C probe labels

These identify input samples, **not output axes or stroke percentages**.

| Layout marker | Color | Raw suffix |
| --- | --- | --- |
| P1 / C1 | Red | A0 |
| P2 / C2 | Blue | A1 |
| P3 / C3 | Green | A2 |
| P4 / C4 | Yellow | A3 |
| C5–C8 | Purple, cyan, orange, light gray | A4–A7 |

P1–P4 form a tetrahedron; C1–C8 form a cube. The raw indices overlap but positions differ, so P2 and C2 are not interchangeable. Balls mark centers, not receiver radii.

These displays belong to legacy paired Pose/PB experiments. **Measure plug** shows Palm/Plug P probes; Socket measurement shows C probes, with Root/Tip/Side groups sharing positions but distinct paths. Independent PB uses P probes. This is not the new fixed-root protocol: its A0–A3 anchors stay under the avatar root while a dedicated marker follows the selected root. Do not substitute the Socket's eight C probes, or their first four indices, for the new geometry. Sensa retains real OSC paths; L/R/V/A axes keep their device meaning.

![Probe colors](images/probe-colors.png)

Build/ClientSim checks can inspect placement, reset, colors and generated controllers; actual results belong to the corresponding commit report. They do not certify uploaded avatar OSC, physical VR grabbing or hardware.

Legacy P/C labels identify Contact samples; paired estimates remain blocked from motion by default. Four/eight samples and zero residual prove neither one Sender nor one frame. The new fixed-root route has separate geometry, a dedicated Self marker, validity and a changing heartbeat; it is not this legacy display. Experimental permission, calibration and stop checks still apply. [Positioning](positioning.en.md)

This lab's Shader prop remains a synthetic transport test. The package separately provides native SPS root encoding, not deformed-mesh sampling; actual client capture still needs acceptance. [Shader guide](../unity/top.sealoong.sensa/GPU-TRACKING.en.md)
