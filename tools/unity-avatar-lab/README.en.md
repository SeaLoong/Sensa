# Sensa avatar lab tools

[简体中文](README.md) | **English**

Use **`Assets/SensaAvatarLab/Generated/FullFlow.unity`** for a complete flow: QuickStart, native SPS, tracking, grabbable PB and default-off synthetic shader code. Follow [FullFlow](FULL-FLOW.en.md). Isolated scenes in the [capability matrix](CAPABILITIES.en.md) help diagnose one subsystem.

## Prepare

1. Use the project's Unity 2022.3.22f1, Avatars SDK, VRCFury, Modular Avatar/NDMF, lilToon and prop shaders.
2. Import your licensed Chocolat 1.02 and SPS_Lollipop assets. Templates expect `Assets/Amatousagi/Chocolat/Chocolat.prefab` and `Assets/SeaLoong/SPS_Lollipop/SPS_Lollipop.prefab`.
3. Close the project, then run `python scripts/install-avatar-lab.py "<avatar project>" --tests` from Sensa and reopen.
4. **Tools → Sensa Avatar Lab → Create authoring scenes** creates missing scenes without overwriting existing edits.

The local project is `D:/VRChatProjects/Sensa Test Avatar`. Keep it local-only; never push proprietary models/textures into public Sensa. Tools contain first-party setup, not paid resources, and do not upload.

## Scenes and menus

| Scene | Purpose |
| --- | --- |
| Generated/FullFlow.unity | Integrated daily acceptance |
| Capabilities/QuickStart.unity | Chocolat plus only Quick Start World Receiver |
| Generated/Exclusive.unity | Exclusive Socket root/paired pose and Plug local point/PB |
| Generated/Shared.unity | Two Sockets sharing standard root array, no paired Socket array |

**Sensa Test Props** provides hand/world placement for Sockets, PB reference and Shader rig, visible labels/probes and measurement switches. Existing FullFlow can use **Upgrade FullFlow hand and world controls**. Labels are baked static meshes so the avatar client does not strip required TextMesh components.

Native SPS, prop visibility and Sensa target selection are separate. The Sensa selector defaults Off. Choose Plug to measure your lollipop, Socket for external root diagnostics; paired pose needs matching LabPair markers. Independent LabHandle is not controlled by the target selector; grab enables its coordinate input, release invalidates it. The lollipop starts off.

Gesture Manager is optional and auto-added when installed. In Play Mode select it and use its inspector menus for manual checks. **Add emulator to existing scenes** adds it to old scenes. It does not replace VRChat OSC, remote interaction or actual grabbing.

## Checks and reports

**Validate full build callbacks** preprocesses a clone through SDK/NDMF/VRCFury and checks generated Contacts, parameters, shaders and components. **Build Exclusive with SDK (no upload)** creates a local .vrca using the public Build API; failures are recorded in Validation/sdk-build-error.txt. It does not call upload APIs.

QuickStart has **Create first-run avatar**, **Validate first-run avatar** and **Build Quick Start with SDK (no upload)**. Validation checks right-hand receivers and two local, unsaved, default-zero parameters including actual Animator declarations.

EditMode package tests cover geometry, sharing, NDMF and GPU adapter logic. Reports go to Validation/, local bundles to Builds/. Preprocessing, SDK packaging and live-client success are distinct.

Batch warmup uses AvatarLab.Warmup without -quit; asynchronous SDK BuildWithSdk also exits itself. Synchronous ValidateBuilds may use -quit. Package unit tests use -runTests -testPlatform EditMode -testFilter UnityBox.Sensa.Tests -executeMethod SensaAvatarLab.AvatarLab.PrepareTests -testResults Validation/unity-tests.xml, without -quit. The batch helper skips Editor Toolbox's visible-toolbar-dependent callback without changing ordinary interactive use.

Automated E2E/screenshots are CI-only; do not run local PlayMode integration capture suites. Keep real devices disconnected during automated checks. Log into the SDK only for your own manual upload; keep Avatar **Private** and World private, never public/Community Labs.
