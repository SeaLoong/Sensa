# Sensa Avatar lab

**English** | [简体中文](README.zh-CN.md)

A local, device-free authoring harness for independent SPS, PB, Contact and rendering checks. Use `Assets/SensaAvatarLab/Generated/FullFlow.unity` for the integrated fixture, or the [capability scenes](CAPABILITIES.en.md) to isolate a subsystem. These are test assets, not a minimal daily Avatar or proof of uploaded-client behavior.

[Parameter diagrams](https://sealoong.github.io/Sensa/parameter-geometry.html?lang=en-US) explain the geometry without an Avatar or device. The repository and desktop ZIP retain the offline HTML page.

## Install into your own project

1. Prepare an **Avatars** project with its SDK-supported Unity version, official VRCFury, Modular Avatar/NDMF and shaders required by your licensed models.
2. The fixture templates expect `Assets/Amatousagi/Chocolat/Chocolat.prefab` and `Assets/SeaLoong/SPS_Lollipop/SPS_Lollipop.prefab`. Import your own licensed copies; they are not distributed here.
3. Close Unity and run from the Sensa checkout:

```shell
python -X utf8 scripts/install-avatar-lab.py "<Avatar project>" --tests
```

4. Reopen and use **Tools → Sensa Avatar Lab → Create authoring scenes**. Existing scenes and locally edited managed source are protected, rather than silently overwritten.

Source templates live under `tools/unity-avatar-lab/Editor`; installed source and generated assets live under `Assets/SensaAvatarLab`. Keep the project local; never push licensed models, textures, logs or credentials to Sensa. Tools do not upload.

## Language and menus

Editor tools choose language automatically from Editor UI, then OS when unavailable, with unsupported languages falling back to English. Explicit English/简体中文 preferences persist locally. See the available Sensa language control in the installed Editor UI.

Editor menu paths remain stable English IDs for automation. Generated Avatar menus and baked visible labels use authoring/build-time language; changing the preference does not translate an already uploaded Avatar separately per wearer. User object/instance names and parameter IDs stay unchanged.

## Choose the fixture

| Scene | Purpose |
| --- | --- |
| Generated/FullFlow.unity | [Integrated interaction route](FULL-FLOW.en.md) |
| Generated/Exclusive.unity | One selected measurement target, initially Off |
| Generated/Dedicated.unity | Simultaneous independent measurements; select an exact source in Sensa |
| Capabilities/* | Contact, PB, SPS and shader isolation |
| Capabilities/QuickStart.unity | Hidden synthetic transport fixture, not product onboarding |

Native SPS activation, OGB_ENABLED, measurement selection, prop visibility and desktop input are separate. The lollipop and synthetic shader start off. Gesture Manager, when installed, is an optional preview aid and does not replace real client grabbing or OSC.

## Checks and boundaries

Package EditMode tests cover geometry, parameters, selection and authoring behavior. SDK preprocessing works on clones; explicit **Build … with SDK (no upload)** commands create local bundles. Reports in `Validation/` and bundles in `Builds/` are revision-specific evidence, not automatically current results.

Release CI runs units, browser E2E and isolated native smoke. Avatar Unity/EditMode/PlayMode and private-client checks remain separate. Keep input off and outputs empty before every route change. No tool connects hardware or uploads automatically.

[FullFlow](FULL-FLOW.en.md) · [Capability matrix](CAPABILITIES.en.md) · [Unity package](../../unity/top.sealoong.sensa/README.md)
