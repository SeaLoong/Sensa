# Sensa World lab

**English** | [简体中文](README.zh-CN.md)

A device-free **Worlds** harness for known Contact geometry, PB, native SPS and synthetic rendering diagnostics. Open `Assets/SensaLab/Functional/FunctionalLab.unity` for separate functional stations; `Generated/SensaLab.unity` holds geometry boundary cases.

The world's Transform truth and boards are not Avatar OSC receipt. Wear a separately built test Avatar when checking that route. **00 START HERE** is the retained synthetic QuickStart bench, not the product setup or a required desktop preset.

## Install and language

Use a Worlds project with its supported Unity/SDK, UdonSharp and installed official VRCFury as required by the scenes. Do not install the full Avatars package into it. Replace the placeholder with your own local directory:

```shell
python -X utf8 scripts/install-world-lab.py "<World project>"
```

Repository templates live in `tools/unity-world-lab/{Editor,Runtime}`; installation manages `Assets/SensaLab` and required shared sources. It refuses conflicting local source edits and does not overwrite generated scenes. Keep the separate world Git repository local without a remote.

Editor language uses the same `auto/en-US/zh-CN` preference as Sensa authoring: actual Editor UI first, OS fallback, unsupported → English. Language options are under **Tools → Sensa Lab → Language**. Existing menu IDs remain English.

Newly generated world text has a local presentation layer. Runtime Automatic follows VRChat's current language and language-change event, maps Chinese variants to Simplified Chinese and otherwise falls back to English. The local **Sensa Lab Language** panel offers Auto / English / 简体中文. Explicit choice applies only to that client's current session; it is not cross-session persistence or a synchronized world setting.

Worlds SDK **3.10.5** was used to inspect `VRCPlayerApi.GetCurrentLanguage()` and `OnLanguageChanged`. The installed SDK must expose these Udon APIs; support for older SDKs is not assumed.

The six dynamic HUDs use UGUI `Text`. Static `TextMesh` keeps its original object/name/Transform/text with its Renderer disabled; the Editor creates English/Chinese display children and runtime only switches their active state. Static text is not polled every frame, and Udon does not access `TextMesh.text`.

For an existing open scene, use **Tools → Sensa Lab → Refresh display language - 刷新显示语言** to explicitly bind/upgrade display text. Installing source alone does not rewrite your saved scenes. Language controls do not move fixtures, change measurements or send OSC. Uploaded-client fonts, layout and language behavior still require manual verification.

## Interact

World props offer LEFT / RIGHT / PLACE / HOME; directly grabbing exits hand-follow mode. **08 MY AVATAR SPS** has an amber Plug for your Socket and a blue Socket for your Plug. Native Avatar SPS and OGB_ENABLED must be enabled separately.

Geometry stations have reset, pause and injected-missing-sample controls. Visible pickup size is not Contact radius. P1–P4 and C1–C8 are independent lab layouts using A0-based samples, not SPS four-anchor tracking P0–P3 or TCode auxiliary axes.

| Reading | Interpretation |
| --- | --- |
| Truth | Reference-local Transform available to this world |
| Decoded | Estimate reconstructed from known geometry |
| RMS | Fit consistency, not measured accuracy |
| Valid / invalid | Solver/gate state, separate from raw sample bars |
| EXPLORING | Fixture left its reset baseline |

## Evidence and limits

[Capabilities](CAPABILITIES.en.md) distinguishes native scalars, known-geometry estimates and diagnostic code. [Development](DEVELOPMENT.en.md) describes generators and reports; [camera prototype](CAMERA-PROTOTYPE.en.md) is a separate synthetic experiment.

Release CI includes units, browser E2E and isolated native smoke; Unity/World PlayMode and real-client inspection remain separate. Static/isolated unit/EditMode checks do not prove VR grabbing, uploaded OSC, HMD visibility, desktop capture or hardware. Fixtures are local without Object Sync and never automatically send device motion. Keep output experiments off until deliberately testing one at a time.

[Parameter diagrams](https://sealoong.github.io/Sensa/parameter-geometry.html) work independently online; the repository and desktop ZIP retain the offline page.
