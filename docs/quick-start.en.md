# First run

[简体中文](quick-start.md) | **English**

Follow the setup guide to choose a scene, connect one device and prepare an input. Use L0 for an OSR/TCode stroke, or V0 for an Intiface vibrator using its default source. [Which connection does my device use?](devices.en.md)

## 1. Start

For manual control or scripts, [open WebSensa](https://sealoong.github.io/Sensa/websensa/). Use desktop Chrome or Edge for serial or Bluetooth connections.

For **VRChat/OSC**, [download Sensa](https://github.com/SeaLoong/Sensa/releases/latest), extract a **Desktop** package and run it. The **CLI** package opens the same workbench in your browser and reports its address, usually **http://127.0.0.1:5086**. Use the address it actually reports.

Current Desktop/CLI builds are also available in [development previews](https://github.com/SeaLoong/Sensa/releases); Download opens the latest stable release. Choose **x64** for Intel/AMD or **ARM64** for Apple Silicon/Windows ARM. [All download formats and Linux setup](features.en.md#configuration-and-development)

Click **Start setup guide**. Choose the scene you want, such as **VRChat / SPS control**, **Play a funscript** or **Manual device control**, then continue. WebSensa shows the scenes supported by the browser host.

The guide stays available as **Guided setup**. **Save progress, continue later** keeps your place; **Resume setup** returns to it. Scene shortcuts open the relevant controls directly.

![Manual controls in Sensa](screenshots/desktop/english-manual.png)

[Narrow layout](screenshots/mobile/english-manual.png) · [More running examples](screenshots.en.md)

## 2. Add an output

1. In the guide, click **Connect or configure a device** to open **Control → Outputs**. Choose an **Output type** and click **Add output**.
2. Enter your device's connection in **Output settings**:
   - **OSR / SR6 / TCode:** select serial and the port, or enter its network endpoint. Choose the device's axis profile.
   - **Intiface:** start Intiface Central and scan for your device. Enter its WebSocket address in Sensa. Use **Matching device name** under **Devices and features** to limit control to your device.
3. Click **Save output**, then **Enable** on the output card. Confirm that it connects.

For TCode, **Scene presets → Device axis profiles** offers a **Device motion preset**. Click **Review and create an axis profile**, check direction and travel in the editor, then save. Select that saved profile on your TCode output. You can also edit profiles in **Settings → Axis profiles**.

Return to the guide after the output is available, then continue to input preparation. [Other output types](devices.en.md)

## 3. Enable input and inspect results

In the guide, click **Open input settings** and prepare your chosen scene:

- **Manual:** check L0, or V0 under **More motion axes** for an Intiface vibrator. In WebSensa, also enable V0 under **Motion axes**.
- **Script:** click **Choose script** and load a `.funscript`. For a vibration-only Intiface device, set its output's **Vibration source** to **L0 · Depth to vibration**.
- **VRChat / SPS:** receive OSC parameters, choose a mapping preset and save the calibrated mapping. [OGB/SPS steps](usage-scenarios.en.md#existing-ogb--sps)
- **Website or software:** configure a protocol input and connect the upstream application. [Protocol input steps](protocol-inputs.en.md)

Click **Apply input mode** if shown. Return to the guide, check the output and prepared input, then click **Finish setup**. Finishing records your progress and returns to **Control** with your chosen input. Turn on **Input enabled** separately when ready.

For a first manual movement, make a small slider adjustment and click **Send once**. **Send continuously** follows later edits. For a script, press **Play** after enabling input.

The output card shows connection status and recent values. If nothing happens, check the selected device/port, output **Enable**, applied input mode and **Input enabled**.

Turn off **Input enabled** when finished. **Emergency stop** stops all outputs and stays active until cleared. Saving settings, changing input mode or replacing a script turns input off; enable it again when ready. Clearing emergency stop also leaves input off.

## 4. Choose sources and add computation

Use the scene shortcuts to switch tasks, or reopen **Guided setup** for the steps. **Scene presets** lets you inspect OSC and device-motion presets. Loading a preset prepares an editable draft; save it to change the running configuration.

Once one connection works, [computed signals](computed-signals.en.md) can mix inputs or smooth a response. [Choose a setup](usage-scenarios.en.md) for additional input and Avatar tracking options.

## 5. Save recordings and complete plans

[Recording and replay](signal-pipeline.en.md#record-and-inspect) can save your interaction as funscript. [Complete plans](signal-pipeline.en.md#save-and-reuse-a-complete-plan) save mappings, calculations, axis profiles and outputs together.

Browser settings and guide progress are saved locally; download completed browser recordings before reloading or closing the page. [WebSensa connection details](websensa.en.md) · [Workbench map](guide.en.md) · [All guides](start.en.md)

## Run several instances

Opening the same desktop configuration again reuses its running service. For an independent setup, use a named instance:

```sh
Sensa --instance studio
Sensa --new-instance
```

Named configurations live in `instances/<name>/config.json` beside the original configuration. Read the current listening addresses in the console/workbench. `--config <path>` selects a configuration; `--open-browser false` runs the CLI in the background. [Configuration locations and runtime details](architecture.en.md)
