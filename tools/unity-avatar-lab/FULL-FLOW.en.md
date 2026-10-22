# Integrated Avatar fixture

[简体中文](FULL-FLOW.md) | **English**

Open `Assets/SensaAvatarLab/Generated/FullFlow.unity`. It combines the licensed base/props with Sensa measurements, an independent PB handle, synthetic transport fixtures and optional rendering experiments. Keep uploads Private. [Preparation and language](README.md)

## Place, then measure

**Sensa Test Props** groups Home/reset, Left hand, Right hand and Place in world. Move a prop with a hand, place it, then move relative to it. Pickup/placement is local and unsaved. Visibility changes helpers, not measurement or input permission.

Native SPS/prop activation, **SPS OSC** (OGB_ENABLED), **Measure plug / Measure this socket**, shader selection and desktop input are independent controls. Menus use the author's generated language; English names here identify the stable fixture operation.

White Socket centers and +Z show entry/inward direction. Root/Tip/Side are paired reference landmarks. Helper P1–P4 and C1–C8 belong to independent Point/Pose experiments with A0-based fields. They are **not** SPS four-anchor tracking P0–P3, TCode auxiliary axes, or a visualization of Contact radius. SPS four-anchor tracking parameters must be inspected as their own protocol.

## Keep routes separate

Start Sensa with no outputs and input off. Apply OSC mode, enable receiving and inspect actual parameters. Replace the whole mapping draft between routes; do not accumulate old gates.

| Route | Avatar/world operation | Inspect |
| --- | --- | --- |
| PB | Place reference, grab/stretch/release the white handle | Actual Stretch plus IsGrabbed gate; scalar PB needs no XYZ |
| Native SPS | Activate SPS and OGB_ENABLED; move an enabled Plug against a Socket | Actual Self/Others paths; root/paired length channel before saturation, then radial estimate |
| SPS four-anchor tracking | Select your own root measurement | `Sensa/SPS/<id>/P0…P3` and changing `Sample`; Avatar-root coordinates |
| Independent local/Pose | Move relative to the chosen reference, or use matching LabPair landmarks | Separate experimental estimate, oldest-channel freshness; no default motion permission |
| Synthetic shader | Enable code, corrupt CRC, freeze/disable | Diagnostic Frame/XYZ/Valid transport; not an SPS measurement |
| QuickStart | Use the lab's five levels then STOP | Synthetic Depth/Active fixture only; no product preset is required or supplied |

For native SPS, inspect the actual instance/source instead of choosing Self/Others solely from a world prop's appearance. The **08 MY AVATAR SPS** world station provides an amber Plug and a blue Socket; its board values are not proof of Avatar OSC receipt.

SPS four-anchor tracking requires explicit experimental permission, two-point calibration and separate input activation. A single root is not a pose or direct device stroke. [Current package contract](../../unity/top.sealoong.sensa/AUTOMATION.en.md)

## Shader and evidence

FullFlow's uploadable shader fixture produces synthetic (.25,−.5,.75) code and starts off. It does not become an actual SPS deformation reader. The editor GPU Model Probe and the package's native root-transform capture are [different paths](../../unity/top.sealoong.sensa/GPU-TRACKING.en.md).

The image bridge's diagnostic namespace cannot calibrate native root observations. CRC, advancing frames and recovery test transport; client camera retention, desktop ROI, HMD visibility and latency remain separate acceptance work.

Generator/upgrade commands protect existing assets. Validation preprocesses a clone and records Contacts, FX declarations, menus and default-off state; explicit SDK build commands package locally without uploading. Inspect the report generated for the actual revision rather than copying historical counts.

Release CI runs units, browser and native mock checks. The experimental Avatar's Unity/PlayMode and actual-client checks remain separate. Before a separate device test, validate calibration, limits and stopping through the main Sensa guide. Sent targets are commands, not mechanical feedback. Never commit licensed models or independent-project assets here.
