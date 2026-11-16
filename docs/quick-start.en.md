# First run

[简体中文](quick-start.md) | **English**

Follow the setup guide to choose a scene, connect one device and prepare an input. Use L0 for an OSR/TCode stroke, or V0 for an Intiface vibrator using its default source. [Which connection does my device use?](devices.en.md)

## 1. Start

For manual control or scripts, [open WebSensa](https://sealoong.github.io/Sensa/websensa/). Use desktop Chrome or Edge for serial or Bluetooth connections.

For **VRChat/OSC**, [download Sensa](https://github.com/SeaLoong/Sensa/releases/latest), extract a **Desktop** package and run it. The **CLI** package opens the same workbench in your browser and reports its address, usually **http://127.0.0.1:5086**. Use the address it actually reports.

Current Desktop/CLI builds are also available in [development previews](https://github.com/SeaLoong/Sensa/releases); Download opens the latest stable release. Choose **x64** for Intel/AMD or **ARM64** for Apple Silicon/Windows ARM. [All download formats and Linux setup](features.en.md#configuration-and-development)

Click **Start setup guide**. Choose the scene you want, such as **VRChat / SPS control**, **Play a funscript** or **Manual device control**, then continue. WebSensa shows the scenes supported by the browser host.

The guide stays available as **Guided setup**. **Save and exit** keeps your place; **Resume setup** returns to it. Scene shortcuts open the relevant controls directly.

![Manual controls in Sensa](screenshots/desktop/english-manual.png)

[Narrow layout](screenshots/mobile/english-manual.png) · [More running examples](screenshots.en.md)

## 2. Prepare input in the highlighted controls

The guide follows **Choose a scene → Prepare input → Mapping & transforms → Axis profiles → Connect device → Review setup**. Each step opens the relevant page, highlights real controls and dims the rest. You can interact with the highlighted controls, using **Tab / Shift+Tab** to move forward or backward between them and the guide. The mapping step highlights OSC mapping presets for OSC, and the first common transform example for manual, script and protocol scenes; **Scene presets** opens all transform choices. Use **Jump to step** to reveal the step list. Longer instructions scroll separately, keeping **Back / Next** and emergency stop available. Opening an editor suspends the guide; closing it resumes the guide. Press **Escape** to save progress and leave.

Prepare your source in **Input**. Opening a tab does not apply its input mode:

- **Manual:** check L0. For an Intiface vibrator using its default source, use V0 under **More motion axes**; WebSensa also requires V0 under **Motion axes**.
- **Script:** choose a `.funscript` file. For an Intiface vibrator, its output can use **L0 · depth to vibration** as the vibration source.
- **VRChat / SPS:** inspect received parameters and sources in **Input → OSC**. [OGB/SPS steps](usage-scenarios.en.md#existing-ogb--sps)
- **Website or software:** configure a source under **Input → Protocol**, then connect the upstream application. [Protocol inputs](protocol-inputs.en.md)

## 3. Choose mappings, transforms and axis profiles

**Mapping & transforms** has **Axis mapping** and **Computed signals** subtabs. Open **Scene presets** and choose a card:

- **VRChat / OSC mappings:** SPS depth, vibration, combined depth/vibration and other templates. Append or replace drafts, then check actual paths and ranges.
- **Transforms:** manual smoothing, manual/script mixing, a threshold switch or a slow wave. After loading a calculation, select its result in an axis mapping or output binding.
- **Device axis profiles:** TCode first-run short travel, OSR2/SR6, L0-only or V0-only. Review direction, travel and speed in the editor before saving.

**Save changes** saves axis mappings and calculations together; **Restore changes** restores both. Manual and script inputs can drive motion axes directly, so skip transforms when unnecessary. TCode profiles live on the separate **Axis profiles** page; select a saved profile on the output to use it. [Preset reference](presets.en.md)

## 4. Connect outputs, review and enable

1. At the guide's device step, click **Connect or configure a device**, or open **Outputs** directly. Choose **Output type → Add output**.
2. Configure the connection. **OSR/SR6/TCode:** select serial or network settings and a saved axis profile. **Intiface:** enter Central's WebSocket address and select the target with **Device and features → Matching device name**.
3. **Save output**, then **Enable** its card and confirm the connection. [Other output types](devices.en.md)
4. Return to **Input** and click **Apply input mode** when needed. The final guide step shows actual readiness; use **Prepare input** or **Connect device** beside an unfinished item to return to that step. **Finish tour** only records progress and does not enable input.
5. Turn on **Input enabled** separately when ready. For a first manual movement, make a small adjustment and **Send once**; for a script, press **Play**. Inspect connection state and recent values in **Outputs**.

Turn off **Input enabled** when finished. **Emergency stop** stops all outputs and stays latched until released. Saving configuration, changing mode or replacing a script turns input off; releasing emergency stop also requires explicit input activation. Calculations, mappings and output connections can be edited separately, and navigation preserves unfinished drafts.

## 5. Save recordings and complete plans

[Recording and replay](signal-pipeline.en.md#record-and-inspect) can save your interaction as funscript. [Complete plans](signal-pipeline.en.md#save-and-reuse-a-complete-plan) export saved mappings, calculations, axis profiles and outputs together. Save your edits first to include them.

Browser settings and guide progress are saved locally; download completed browser recordings before reloading or closing the page. [WebSensa connection details](websensa.en.md) · [Workbench map](guide.en.md) · [All guides](start.en.md)

## Run several instances

Opening the same desktop configuration again reuses its running service. For an independent setup, use a named instance:

```sh
Sensa --instance studio
Sensa --new-instance
```

Named configurations live in `instances/<name>/config.json` beside the original configuration. Read the current listening addresses in the console/workbench. `--config <path>` selects a configuration; `--open-browser false` runs the CLI in the background. [Configuration locations and runtime details](architecture.en.md)
