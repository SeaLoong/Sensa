# Unity tracking components and build pipeline

[简体中文](unity-build.md) | **English**

Sensa's Unity scripts store authoring settings. During an Avatar build, NDMF reads those settings on the build copy, generates Contacts, constraints, FX animation and menus, then removes the author scripts. Your source Avatar and prefabs remain editable; standard generated Avatar components perform the uploaded measurement.

## Choose a measurement route

| Route and prefab | What it measures | Coordinates and requirements |
| --- | --- | --- |
| SPS four-anchor tracking: `SensaSpsRootProbe.prefab` | SPS Socket/Plug root position, with explicit bone or marker targets also supported | `AvatarRootLocal` authored units; four Receivers and one Sender |
| Contact direct tracking (SDK Beta): `SensaContactRootProbe.prefab` | Root position, relative velocity and proximity change rate | `AvatarRootMeters` in metres; one Receiver and one Sender; advanced Proximity parameters required |
| Shader root capture: `SensaShaderCapture.prefab` | Position, X/Z axes and world scale encoded into a desktop image | `AvatarRootLocal` authored units; PC Built-in, a geometry-shader-capable backend and desktop bridge |
| Following plane: `SensaTrackingFrame.prefab` | A plane that moves and rotates with a bone or root, for depth and lateral offset | Choose SPS four-anchor or Contact direct tracking; generates Origin/Forward/Right points |
| Point/Handle/Pose | Points, grabbable handles or paired orientation in a chosen frame | Each uses its own reference, protocol and freshness rules |

All three root prefabs accept an explicit `Target` within your Avatar: a bone/empty-object `Transform`, SPS Socket/Plug, Sensa Component or native Contact. Bones and ordinary markers can be selected directly. Native Contacts use their shape center; SPS targets use their authoring root geometry. [Coordinates and units](positioning.en.md) · [Contact SDK reports](contact-sdk.en.md)

Use **Automatic SPS Setup** for several existing SPS targets, choosing SPS four-anchor tracking or Contact direct tracking for the group. Root-only measurement reads position and rotation; Plug length is required when tip tracking, paired Plug markers or grab handles are enabled. Configure Shader capture through its separate authoring prefab, with its own Producer ID and desktop rectangle.

## Place and configure a prefab

1. Install the Unity package's VPM dependencies: NDMF **1.5.0+**, Modular Avatar **1.10.0+** and matching VRChat Avatars SDK. Install official VRCFury when selecting SPS author targets. Contact direct tracking supports **3.10.6-beta.3** through `advancedParameters`, with compatibility for Beta.2's `advancedProximityParameters`.
2. Create your chosen route from **GameObject → Sensa**, or place its prefab inside the Avatar hierarchy. Check that `Target` selects the root you intend to measure.
3. SPS four-anchor tracking and Contact prefabs default to instance `Root`. Use distinct names such as `Root`, `Chest` and `Hand` for multiple points. An empty `Collision Channel` derives a stable channel from the instance name; enter an override when managing channels explicitly. Rename a duplicate to give it an independent automatic channel.
4. Give Shader capture a unique `Producer Id` from 1–65535 and pin the same ID in the desktop bridge. Follow [Shader setup](../unity/top.sealoong.sensa/GPU-TRACKING.en.md) for presentation and capture registration.
5. Build the Avatar normally or use NDMF's processed preview. Inspect generated measurement components, then check parameters, calibrate and enable input through the desktop guide.

Keep the authoring host as an ordinary GameObject. Its Transform may be a measurement reference, and its generated Contacts, constraints and animation remain part of the build result.

## Create a plane that follows a bone

1. Select a bone or SPS object inside the Avatar and choose **GameObject → Sensa → Tracking Frame**, or add `SensaTrackingFrame.prefab`.
2. Check **Reference frame** (`reference`). This single field accepts a Transform, SPS Socket/Plug, Sensa Component or native Contact. The menu fills a recognized selected target; when creating at the Avatar root, choose the reference yourself.
3. Set a unique **Instance name** (`instanceName`), default `Frame`, using at most 40 ASCII letters, digits, underscores or hyphens. Choose SPS four-anchor or Contact direct tracking as **Tracking method** (`trackingMethod`).
4. Place the centre with **Origin offset** (`positionOffset`) and adjust its orientation with **Axis rotation (degrees)** (`rotationOffset`). Both use the resolved root's local axes; the position offset applies before the added rotation. Six axis buttons choose a depth direction quickly, and Scene move/rotate handles allow finer adjustment.
5. Inspect the XY plane and +Z arrow in Scene: **+Z is positive depth, +X is right and +Y is up**. **Axis marker distance** (`axisLength`) is the Origin-to-Forward/Right distance in authored Avatar-root units, default 0.2 and configurable from 0.05 to 0.5.
6. Add a matching root prefab for measured target P on the same Avatar: `SensaSpsRootProbe.prefab` or `SensaContactRootProbe.prefab`. Assign its target and a separate instance name, such as `Target`; an existing measurement in the same coordinate frame can be reused.
7. After building, confirm valid desktop coordinates for the target, Origin and Forward. In Flow, expand Spatial calculation presets → Follow a moving plane, select the target and plane Origin, review the drafts, then save and connect outputs.

Generated points are named `<name>_Origin`, `<name>_Forward` and `<name>_Right`. A source reference follows bone movement and rotation. The measured frame lives under the Avatar root, following position and rotation through a ParentConstraint. Marker spacing follows uniform Avatar scale. Bone scale can move an offset origin; axis lengths retain the authored Avatar-root size. SPS authoring geometry retains its uniform-scale requirement.

| Tracking method | Generated components and fields | Desktop coordinates |
| --- | --- | --- |
| SPS four-anchor tracking | 15 Contacts; 3 groups of 5 fields | `Sensa/SPS/<name>_<marker>/…`, AvatarRootLocal |
| Contact direct tracking | 6 Contacts; 3 groups of 12 fields | `Sensa/Contact/<name>_<marker>/…`, AvatarRootMeters |

Scene also shows coverage for the selected tracking method. Points used by the current calculation need valid coverage: the default template uses target P, Origin and Forward; Right provides the additional direction when needed. Each marker retains its own Sample check. Shorter axis spacing amplifies direction noise; compare known poses in the client to assess the default 0.2 spacing and behavior during fast movement. Choose one coordinate frame for the measured target and plane markers. Independent Point/Pose use their own ReferenceLocal frame for measurements directly within that reference. [Depth, offset and angle calculations](computed-signals.en.md#combine-root-coordinates)

## How author scripts enter the build

Sensa authoring components implement `VRC.SDKBase.IEditorOnly`: `SensaComponent`, `SensaAutoSetup`, `SensaFixedRootProbe`, `SensaContactRootProbe`, `SensaShaderCapture`, `SensaTrackingFrame`, `SensaPointProbe`, `SensaPoseSocket`, `SensaPosePlug` and the internal lab fixture `SensaQuickStart`.

| Setting | Build behavior |
| --- | --- |
| Script implements `IEditorOnly` | Identifies an authoring script to the VRChat SDK; Sensa removes that component after generation |
| GameObject tagged `EditorOnly` | Removes the object and its children as editorial helpers; reserve this for separate, purely editorial previews |
| Author component has `Enabled` unchecked | Removes the author script and skips its generation |
| Author is on an inactive object | Reads enabled settings; runtime activation follows each generated rig and its menu rules |

QuickStart remains an internal synthetic lab fixture. Use a root or tracking-frame prefab, or Point/Pose, for everyday tracking.

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

Tracking frames use the same Generating entry: after standalone root authors and before automatic SPS setup, create the three points and remove the Tracking Frame author before base SensaComponent cleanup. Generated measurements retain the existing SPS/Contact protocols.

`BuildContext.GetState` records generation for each build. SPS four-anchor tracking, Contact, Shader and the other authors share this scheduler while keeping their own runtime protocols. The SDK `-1026` check diagnoses remaining settings; actual generation always belongs to the early NDMF pass.

This ordering has also been checked in SDK **3.10.6-beta.3**, NDMF **1.14.8**, Modular Avatar **1.18.7** and VRCFury **1.1434.0** packages. Current VRCFury postpones SDK component cleanup to `int.MaxValue`. Sensa completes its own author cleanup and therefore also works with the SDK's default order. Other tools can register later SDK callbacks; Contact counting describes Sensa's NDMF checkpoint.

## Assets and references

Generators operate on the build copy. Targets, bones, PhysBones and Raycast references must belong to that Avatar. The basic component validates references before creating native components so configuration errors are easy to locate.

Sensa creates temporary animator/menu/parameter inputs for MA and leaves build-asset serialization to NDMF. The native root Shader ships in the package at `Runtime/Shaders/SensaRootTelemetry.shader`; building references that asset directly. Rebuilding after a package update adopts the current encoder.

The basic `SensaComponent` binds native Contacts to their selected axis/bone so they continue following it. Related FX parameters are writable. Socket range and Contact sizes use the selected axis's local units, equal to metres at axis scale one; SPS four-anchor tracking and direct Contact tracking retain their separate coordinate contracts above. Supplementary Contact signals use tags matching their Senders. Existing-parameter signals reference the original parameter and retain its type.

SPS four-anchor and Contact root-scale checks follow a constraint's actual target and MA Merge Animator's `relativePathRoot`. Keep Avatar-root scale fixed while scaling child objects as needed. Shader sampling additionally validates original and quantized axes and uniform world scale, catching settings that would produce invalid packets during the build.

All three root routes validate native Contact offsets and rotations before generation. Offsets must be finite; rotation quaternions must be finite and nonzero and are normalized when read, preserving the authored Contact configuration. Shader capture also checks the final world basis inherited from the Avatar and its parents, catching accumulated nonuniform scaling that would keep encoded packets invalid. Sensa Pose Socket checks existing parameter declarations before generating any Receivers and reports duplicate names during the build. Instance names and pair channels use the specified ASCII characters.

## Official sources and verification scope

The following official documentation and source were inspected on **2026-10-23 (China Standard Time)**:

| Source | Rule checked |
| --- | --- |
| [VRChat SDK interface documentation](https://github.com/vrchat-community/creator-docs/blob/f437f5081c4476aaf443b507a7ec4a9d21e0e63b/Docs/docs/sdk/build-pipeline-callbacks-and-interfaces.md#ieditoronly) | Meaning of `IEditorOnly` and SDK validation |
| [Official Base 3.10.6-beta.3 package](https://github.com/vrchat/packages/releases/download/3.10.6-beta.3/com.vrchat.base-3.10.6-beta.3.zip) | Rechecked `RemoveAvatarEditorOnly` at default order `-1024`; see [Contact tracking](contact-sdk.en.md) for the Contact interface and package digests |
| [Official Base 3.10.6-beta.2 package](https://github.com/vrchat/packages/releases/download/3.10.6-beta.2/com.vrchat.base-3.10.6-beta.2.zip) | `RemoveAvatarEditorOnly` ordering and component/object cleanup in `VRCSDKBase-Editor.dll`, inspected as managed assembly |
| [NDMF 1.5.0 SDK hooks](https://github.com/bdunderscore/ndmf/blob/eb332294b65fe06dfdd38fbe33d5d8bda68eb267/Editor/VRChat/BuildFrameworkPreprocessHook.cs#L24) | Minimum-supported early `-11000` and late `-1025` hooks |
| [MA 1.10.0 extension guide](https://github.com/bdunderscore/modular-avatar/blob/a71af7ae0a7caa904cf67f04a70754ae2939a8bb/docs~/docs/extending.md#L5) · [plugin definition](https://github.com/bdunderscore/modular-avatar/blob/a71af7ae0a7caa904cf67f04a70754ae2939a8bb/Editor/PluginDefinition/PluginDefinition.cs#L23) | Generate before MA in Generating, merge during Transforming |
| [NDMF execution model](https://github.com/bdunderscore/ndmf/blob/a03cb9374e3ff5c788c65bed7fa45016b0784c36/docfx~/execution-model.md) · [best practices](https://github.com/bdunderscore/ndmf/blob/a03cb9374e3ff5c788c65bed7fa45016b0784c36/docfx~/best-practices.md#L11) | Same-phase ordering, per-build state, author cleanup and asset serialization |
| [VRCFury developer guide](https://github.com/VRCFury/vrcfury.com/blob/3d507b6dc5c118e3c88d067fa4efd06f9a3ead1c/docs/50-tutorials/zz-api.mdx) · [build hook](https://github.com/VRCFury/VRCFury/blob/6bd33f4cb453df816c943a335e47f64e6a37e188/com.vrcfury.vrcfury/Editor-Avatars/Hooks/VrcPreuploadHook.cs#L7) | Fury's `-10000` hook and temporary-asset/merge responsibilities |

These sources establish implementation and ordering. Unity EditMode contracts are written and have not been executed in Unity Editor for this change; see the [verification record](e2e-status.en.md) for actual results. Avatar upload, client OSC, rendering and device interactions receive separate acceptance checks.

[Unity package](../unity/top.sealoong.sensa/README.md) · [Automatic setup](../unity/top.sealoong.sensa/AUTOMATION.en.md) · [Dependencies and measurements](../unity/top.sealoong.sensa/COMPATIBILITY.en.md)
