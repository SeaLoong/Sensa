# Unity tracking components and build pipeline

[简体中文](unity-build.md) | **English**

Sensa's Unity scripts store authoring settings. During an Avatar build, NDMF reads those settings on the build copy, generates Contacts, constraints, FX animation and menus, then removes the author scripts. Your source Avatar and prefabs remain editable; standard generated Avatar components perform the uploaded measurement.

## Choose a measurement route

| Route and prefab | What it measures | Coordinates and requirements |
| --- | --- | --- |
| SPS four-anchor tracking: `SensaSpsRootProbe.prefab` | SPS Socket/Plug root position, with explicit bone or marker targets also supported | `AvatarRootLocal` authored units; four Receivers and one Sender |
| Contact direct tracking (SDK Beta): `SensaContactRootProbe.prefab` | Root position, relative velocity and proximity change rate | `AvatarRootMeters` in metres; one Receiver and one Sender; advanced Proximity parameters required |
| Shader root capture: `SensaShaderCapture.prefab` | Root coordinates encoded into a desktop image | `AvatarRootLocal` authored units; PC Built-in, a geometry-shader-capable backend and desktop bridge |
| Point/Handle/Pose | Points, grabbable handles or paired orientation in a chosen frame | Each uses its own reference, protocol and freshness rules |

All three root prefabs accept an explicit `Target` within your Avatar: a bone/empty-object `Transform`, SPS Socket/Plug, Sensa Component or native Contact. Bones and ordinary markers can be selected directly. Native Contacts use their shape center; SPS targets use their authoring root geometry. [Coordinates and units](positioning.en.md) · [Contact SDK reports](contact-sdk.en.md)

Use **Automatic SPS Setup** for several existing SPS targets, choosing SPS four-anchor tracking or Contact direct tracking for the group. Root-only measurement reads position and rotation; Plug length is required when tip tracking, paired Plug markers or grab handles are enabled. Configure Shader capture through its separate authoring prefab, with its own Producer ID and desktop rectangle.

## Place and configure a prefab

1. Install the Unity package's VPM dependencies: NDMF **1.5.0+**, Modular Avatar **1.10.0+** and matching VRChat Avatars SDK. Install official VRCFury when selecting SPS author targets. Contact direct tracking needs an SDK exposing `advancedProximityParameters`, verified against **3.10.6-beta.2**.
2. Create your chosen route from **GameObject → Sensa**, or place its prefab inside the Avatar hierarchy. Check that `Target` selects the root you intend to measure.
3. SPS four-anchor tracking and Contact prefabs default to instance `Root`. Use distinct names such as `Root`, `Chest` and `Hand` for multiple points. An empty `Collision Channel` derives a stable channel from the instance name; enter an override when managing channels explicitly. Rename a duplicate to give it an independent automatic channel.
4. Give Shader capture a unique `Producer Id` from 1–65535 and pin the same ID in the desktop bridge. Follow [Shader setup](../unity/top.sealoong.sensa/GPU-TRACKING.en.md) for presentation and capture registration.
5. Build the Avatar normally or use NDMF's processed preview. Inspect generated measurement components, then check parameters, calibrate and enable input through the desktop guide.

Keep the authoring host as an ordinary GameObject. Its Transform may be a measurement reference, and its generated Contacts, constraints and animation remain part of the build result.

## How author scripts enter the build

All nine Sensa authoring components implement `VRC.SDKBase.IEditorOnly`: `SensaComponent`, `SensaAutoSetup`, `SensaFixedRootProbe`, `SensaContactRootProbe`, `SensaShaderCapture`, `SensaPointProbe`, `SensaPoseSocket`, `SensaPosePlug` and the internal lab fixture `SensaQuickStart`.

| Setting | Build behavior |
| --- | --- |
| Script implements `IEditorOnly` | Identifies an authoring script to the VRChat SDK; Sensa removes that component after generation |
| GameObject tagged `EditorOnly` | Removes the object and its children as editorial helpers; reserve this for separate, purely editorial previews |
| Author component has `Enabled` unchecked | Removes the author script and skips its generation |
| Author is on an inactive object | Reads enabled settings; runtime activation follows each generated rig and its menu rules |

QuickStart remains an internal synthetic lab fixture. Use the three root prefabs above or Point/Pose for everyday tracking.

`IEditorOnly` identifies an author script; the NDMF plugin schedules generation. Retaining the host while removing only the author component lets bones, reference points and generated native components keep working.

## Build order

Sensa has one NDMF generation entry point. NDMF and Modular Avatar are package dependencies; the SDK callback checks that generation completed.

| Checkpoint | Sensa and upstream work |
| --- | --- |
| Early NDMF SDK hook, order `-11000` | Runs Resolving, Generating and Transforming. Sensa uses **Generating → BeforePlugin("nadena.dev.modular-avatar")** to read author settings and create MA inputs |
| MA Transforming | Merges temporary animators, parameters and menus, handles paths/names and removes its authoring components |
| VRCFury SDK hook, order `-10000` | Processes its SPS authors; Sensa has already read the root geometry it needs |
| Read-only Sensa check, SDK order `-1026` | Checks that Sensa authors were consumed. Disabled NDMF build processing or later-inserted authors produce a build error listing the remaining types |
| NDMF Optimizing SDK hook, order `-1025` | Sensa checks author cleanup and Contact count after MA's work in this same phase |
| Default SDK cleanup, order `-1024` | Removes EditorOnly objects and IEditorOnly scripts; standard generated components continue into the SDK build |

`BuildContext.GetState` records generation for each build. SPS four-anchor tracking, Contact, Shader and the other authors share this scheduler while keeping their own runtime protocols. The SDK `-1026` check diagnoses remaining settings; actual generation always belongs to the early NDMF pass.

These numbers follow the audited versions below. Current VRCFury also postpones SDK component cleanup. Sensa completes its own author cleanup and therefore also works with the SDK's default order. Other tools can register later SDK callbacks; Contact counting describes Sensa's NDMF checkpoint.

## Assets and references

Generators operate on the build copy. Targets, bones, PhysBones and Raycast references must belong to that Avatar. The basic component validates references before creating native components so configuration errors are easy to locate.

Sensa creates temporary animator/menu/parameter inputs for MA and leaves build-asset serialization to NDMF. The native root Shader ships in the package at `Runtime/Shaders/SensaRootTelemetry.shader`; building references that asset directly. Rebuilding after a package update adopts the current encoder.

The basic `SensaComponent` binds native Contacts to their selected axis/bone so they continue following it. Related FX parameters are writable. Socket range and Contact sizes use the selected axis's local units, equal to metres at axis scale one; SPS four-anchor tracking and direct Contact tracking retain their separate coordinate contracts above. Supplementary Contact signals use tags matching their Senders. Existing-parameter signals reference the original parameter and retain its type.

## Official sources and verification scope

The following official documentation and source were inspected on **2026-10-23 (China Standard Time)**:

| Source | Rule checked |
| --- | --- |
| [VRChat SDK interface documentation](https://github.com/vrchat-community/creator-docs/blob/f437f5081c4476aaf443b507a7ec4a9d21e0e63b/Docs/docs/sdk/build-pipeline-callbacks-and-interfaces.md#ieditoronly) | Meaning of `IEditorOnly` and SDK validation |
| [Official Base 3.10.6-beta.2 package](https://github.com/vrchat/packages/releases/download/3.10.6-beta.2/com.vrchat.base-3.10.6-beta.2.zip) | `RemoveAvatarEditorOnly` ordering and component/object cleanup in `VRCSDKBase-Editor.dll`, inspected as managed assembly |
| [NDMF 1.5.0 SDK hooks](https://github.com/bdunderscore/ndmf/blob/eb332294b65fe06dfdd38fbe33d5d8bda68eb267/Editor/VRChat/BuildFrameworkPreprocessHook.cs#L24) | Minimum-supported early `-11000` and late `-1025` hooks |
| [MA 1.10.0 extension guide](https://github.com/bdunderscore/modular-avatar/blob/a71af7ae0a7caa904cf67f04a70754ae2939a8bb/docs~/docs/extending.md#L5) · [plugin definition](https://github.com/bdunderscore/modular-avatar/blob/a71af7ae0a7caa904cf67f04a70754ae2939a8bb/Editor/PluginDefinition/PluginDefinition.cs#L23) | Generate before MA in Generating, merge during Transforming |
| [NDMF execution model](https://github.com/bdunderscore/ndmf/blob/a03cb9374e3ff5c788c65bed7fa45016b0784c36/docfx~/execution-model.md) · [best practices](https://github.com/bdunderscore/ndmf/blob/a03cb9374e3ff5c788c65bed7fa45016b0784c36/docfx~/best-practices.md#L11) | Same-phase ordering, per-build state, author cleanup and asset serialization |
| [VRCFury developer guide](https://github.com/VRCFury/vrcfury.com/blob/3d507b6dc5c118e3c88d067fa4efd06f9a3ead1c/docs/50-tutorials/zz-api.mdx) · [build hook](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Hooks/VrcPreuploadHook.cs#L7) | Fury's `-10000` hook and temporary-asset/merge responsibilities |

These sources establish implementation and ordering. Unity EditMode contracts are written and have not been executed in Unity Editor for this change; see the [verification record](e2e-status.en.md) for actual results. Avatar upload, client OSC, rendering and device interactions receive separate acceptance checks.

[Unity package](../unity/top.sealoong.sensa/README.md) · [Automatic setup](../unity/top.sealoong.sensa/AUTOMATION.en.md) · [Dependencies and measurements](../unity/top.sealoong.sensa/COMPATIBILITY.en.md)
