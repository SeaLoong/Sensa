# Automation and fixed-root sampling

[简体中文](AUTOMATION.md) | **English**

Automatic SPS Setup reads existing SPS Socket/Plug authoring geometry at build time and creates Sensa markers, fixed anchors and native parameters without modifying SPS. Default measurement is a root point, not GPU surface geometry or remote Avatar tracking. Desktop spatial input defaults off. [Principles and limits](COMPATIBILITY.en.md)

## Minimal setup

Add **Sensa → Automatic SPS Setup** to the Avatar root after configuring SPS with VRCFury. Discover All is the default; Selected Targets can limit discovery, and Excluded Targets take priority. New components default to Exclusive with an initially Off in-game menu; existing serialized policies are retained. Do not assign one target to duplicate automatic groups.

| Capability | Generated content | Meaning |
| --- | --- | --- |
| Fixed SPS root tracking (socketRootTracking) | 4 fixed Receivers + 1 dedicated Sender per Socket/Plug | Self root position in AvatarRootLocal |
| Paired Socket Tracking | 8 Receivers for each Root/Tip/Side marker | Advanced three-point straight-pose experiment |
| Paired Plug Markers | Three matching-channel markers | Undeformed reference points, not GPU tips |
| Local Plug Tip Tracking | Tetrahedron at a reference Socket plus local marker | Undeformed-tip experiment relative to that frame |
| Create Plug Grab Handles | Separate PhysBone handle, samples and grab state | Grab gating, not orientation |

Local Plug Tip Tracking requires a reference Socket; a sole candidate can be selected automatically. Common target/reference movement supplies no world displacement. Inspect generation plans, positive uniform scale, names and Contact usage from every plugin before upload.

For one target, add **Fixed SPS Root Probe** and explicitly select an SPS Socket, Plug, Sensa root component or native Contact. ReadRoot resolves its CPU Transform root centre without guessing from names. Keep instance names and Collision Channels unique. New components generate random channels by default; regenerate after duplication. The packaged `SensaSpsRootProbe.prefab` and **GameObject → Sensa → Fixed-anchor SPS Root Probe** menu now both create the fixed-four-anchor author with an empty target that must be assigned explicitly. Duplicated prefab instances also require unique names/channels. Legacy eight-channel `SensaPoseSocket.standardSpsRoot` builds fail with migration guidance; replace that author. Three-point Pose remains available.

## Default fixed four anchors

Anchors stay in Avatar-root local coordinates, centred on `(0,1,0)`, with a 0.5 half-span and four noncoplanar points. Receiver radius is 2.5 and dedicated Sender radius is 0.001. The Sender follows target-root position/rotation without following target-bone scale, so its radius remains defined by Avatar-root scale.

| Policy | Base root Contact cost | Behavior |
| --- | --- | --- |
| Dedicated | 5 per target | Independent Socket and Plug measurements; simultaneous observation |
| Exclusive | 5 per target | One selected target; reduces active count, not registered total |
| SharedRootArray | 8 shared Receivers | Legacy moving Socket-array diagnostics, not the fixed-four-anchor protocol |

Base costs exclude optional pose, tip, PB handles and other plugins. Manual Fixed SPS Root Probe Others Diagnostic adds four Receivers, for nine total. Its Others Valid always remains zero and cannot drive output.

SharedRootArray allows at most 16 eligible, equally scaled targets. Slot/Ready and post-switch samples avoid immediate reuse of an old slot; the moving frame and missing common identity make it unsuitable for motion mapping. Legacy eight-range SpsRoot data is not accepted as the new Profile=1: rebuild fixed-root authors.

## Scale and publication

The Avatar root requires positive uniform scale, with `2.5 × authoredRootScale × ScaleFactor` below approximately 2.999 m. Known root-scale animation and Avatar-root ScaleConstraint are rejected during authoring. Unsupported runtime ScaleFactor disables Contacts and clears Valid/ranges. Scale metadata copies VRChat's built-in ScaleFactor, rather than world scale or arbitrary custom scale animation.

FX copies four Raw values into public values approximately every 0.05 seconds, then advances a 32-step Heartbeat (step i is i/31, wrapping approximately every 1.6 seconds) and publishes Profile, Valid and Scale. Liveness permits unchanged distances to remain cached; it is not an atomic frame, frameId or reliable UDP protocol. NDMF removes authoring components, leaving native runtime components.

## Paths and desktop workflow

The fixed Self root prefix is `Sensa/SpsRoot/v1/<instance>/Self`:

| Relative path | Content |
| --- | --- |
| `/Root/RawA0..RawA3` | Raw Contact proximity read by FX |
| `/Root/A0..A3` | Four FX-published proximities used by desktop reconstruction |
| `/Profile` | 1, identifying AvatarRootTetrahedron |
| `/Valid` | 1 while local, selected and within supported scale |
| `/Scale` | Built-in ScaleFactor |
| `/Heartbeat` | 32-step i/31 producer-liveness counter (0–1) |

Metadata is directly below Self, **not below Root**. This protocol has no `/Root/Valid`. Optional Others diagnostics use the same structure with Valid=0. Reconstructed coordinates are AvatarRootLocal, not world coordinates.

Apply OSC mode and open **OSC → Experimental diagnostics → Local points and roots → Two-endpoint calibration**. A fixed Self root supports X/Y/Z/Distance: capture endpoints and save drafts. It requires a unique valid instance, matching source and metric. SharedRoot/Others cannot generate motion mappings. Saving still requires separate experimental permission and input activation.

`osc.allowExperimentalSpatialInput` defaults to false and blocks existing spatial mappings too. Fixed roots require Profile=1, Valid=1, positive Scale and a current producer heartbeat. Desktop heartbeat age defaults to one second, with a protocol maximum of 1.25 seconds. It does not establish that every range packet arrived. Point/Handle/Pose still use the oldest contributing channel, including Handle grab state, with a default one-second limit.

## Other experiments and native PB

Local Bone or PB Probe works independently of SPS using Target/Reference and the older four-range Point/Handle samples. Pose uses three sets of eight ranges. Their reference may move with the target; do not confuse them with the fixed Avatar-root profile. Native PB stretch can directly use `_Stretch`+`_IsGrabbed` without reconstruction; replace MyPB in the desktop template with the real prefix.

Legacy authoring prefabs and QuickStart remain explicit experiments/development fixtures, rather than default recommendations. Low residuals, successful calibration and synthetic Editor checks do not establish tracking acceptance. Uploaded-client OSC, real grabbing, mixed Senders, GPU and hardware effects need separate validation; this work does not claim them verified.

[Installation](README.en.md) · [Compatibility](COMPATIBILITY.en.md) · [Shader guide](GPU-TRACKING.en.md)
