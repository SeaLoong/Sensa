# First-run validation record — 2026-10-14

[简体中文](first-run-audit.md) | **English**

For instructions use [First OSR setup](quick-start.en.md). This is historical validation scope, not a current universal compatibility claim.

| Area | Change/check | Boundary |
| --- | --- | --- |
| Download/start | Six-platform packaging and no-output onboarding link | Platform results belong to corresponding CI |
| Device setup | L0-only 400–600 template, other axes ignored | Serial fixed at 115200; no real OSR test or arbitrary-firmware guarantee |
| Avatar component | Automatic right-hand QuickStart receiver | Humanoid/right hand/viewpoint and positive uniform scale; SDK + MA/NDMF |
| Avatar build | QuickStart scene, SDK preprocessing/offline .vrca, actual FX Depth/Active parameters | No upload; client permissions/loading/timing remain |
| World | Five steps, TOUCH, STOP, RESET, 60-second and distance/avatar-change stop | Expected values only; no device feedback |
| Contact values | Actual Udon + SDK CalculateProximity, five-step error <0.000002 | World reference receivers, not uploaded avatar receipt |
| Sensa mapping | Shipped JSON's Depth + Active rules | Mock output/in-memory store, no hardware |
| Output limits | About 400/450/500/550/600, L0 only, missing/zero Active blocks | Commands are not position feedback; ignored axes do not center |
| Everyday SPS | Separate native OGB presets | OGB_ENABLED/haptics required; off-axis limitations remain |
| Loss of data | Explained change-only OSC and default no timeout | Client crash can lose Active=0; world timer is not hardware failsafe |

At that audit: 73 .NET, 12 Web, 25 Python and 21 Unity package tests, plus Web lint/build and 15 world capability states. These counts are historical, not today's test totals. Reports were saved under the local projects' Validation/quick-start, quick-start-avatar.json and sdk-quick-start-*.json.

Stricter bundle inspection found Expression Parameters alone insufficient: the actual RuntimeAnimatorController must contain writable Float Depth and Bool Active. QuickStart now merges the corresponding FX controller; inspection uses a real Animator.

Next real-client acceptance must privately upload, wear the avatar, verify steady steps and STOP with no Sensa outputs, then use a calibrated device with limited travel. Only that proves the full chain for that device/avatar. Sensa does not claim every OSR works with zero configuration.
