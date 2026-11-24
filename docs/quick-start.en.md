# First run

[简体中文](quick-start.md) | **English**

Follow the setup guide to choose a scene, connect one device and prepare an input. Use L0 for an OSR/TCode stroke, or V0 for an Intiface vibrator using its default source. [Which connection does my device use?](devices.en.md)

## 1. Start

For manual control or scripts, [open WebSensa](https://sealoong.github.io/Sensa/websensa/). Use desktop Chrome or Edge for serial or Bluetooth connections.

For **VRChat/OSC**, [download Sensa](https://github.com/SeaLoong/Sensa/releases/latest), extract a **Desktop** package and run it. The **CLI** package opens the same workbench in your browser and reports its address, usually **http://127.0.0.1:5086**. Use the address it actually reports.

Current Desktop/CLI builds are also available in [development previews](https://github.com/SeaLoong/Sensa/releases); Download opens the latest stable release. Choose **x64** for Intel/AMD or **ARM64** for Apple Silicon/Windows ARM. [All download formats and Linux setup](features.en.md#configuration-and-development)

Open **Guided tour** in the Input header. The desktop guide starts with OSC and an L0 example. You can choose another supported input. WebSensa defaults to manual.

In the tour, open **Axis mappings → Try the sway example**. Change sideways position from 0 to 0.04 m: L2 slowly moves from 500 to 560 while L0 stays at 500. **Connect devices → Open 3D simulator** lets you try each axis individually. Closing the simulator returns to the same guide step with your draft and device state preserved.

**Save and exit** records your place. **Resume setup** returns to that step. To browse controls directly, use the input tabs.

![Manual controls in Sensa](screenshots/desktop/english-manual.png)

[Narrow layout](screenshots/mobile/english-manual.png) · [More running examples](screenshots.en.md)

## 2. Prepare input in the highlighted controls

The guide follows **Choose a scene → Prepare input → Axis mappings → Axis profiles → Connect device → View logs → Review setup**. Each step gives an ordered checklist and highlights both the current sidebar tab (top navigation on narrow screens) and the live controls. Use **Tab / Shift+Tab** between the guide, navigation and controls; arrow-key navigation from the highlighted tab also changes the guide step. Mapping, transform and device-motion templates are on their own pages. Expand **Jump to step** for direct navigation. Longer instructions scroll separately while **Back / Next** and emergency stop remain available. Editors suspend the guide and closing them resumes it. **Escape** saves progress and leaves. **Diagnostics** opens with logs expanded on every visit; you can collapse them manually.

Prepare your source in **Input**. Opening a tab does not apply its input mode:

- **Manual:** check L0. For an Intiface vibrator using its default source, use V0 under **More motion axes**; WebSensa also requires V0 under **Motion axes**.
- **Script:** choose a `.funscript` file. For an Intiface vibrator, its output can use **L0 · depth to vibration** as the vibration source.
- **VRChat / SPS:** leave **Input enabled** off. In **Input → OSC**, check **Enable OSC** and the receiving address and port. If you changed them, choose **Save OSC settings**. Choose **Apply input mode** to use OSC. Once you see **Listening**, select **View received parameters** in the guide. [OGB/SPS steps](usage-scenarios.en.md#existing-ogb--sps)
- **Website or software:** configure a source under **Input → Protocol**, then connect the upstream application. [Protocol inputs](protocol-inputs.en.md)

## 3. Choose mappings, transforms and axis profiles

1. Leave **Input enabled** off. In **Input → OSC → Parameters**, find a value that changes when you perform an action and note its path.
2. For a first mapping, choose **Append L0 example** in the guide. If you already have a mapping, choose **Edit axis mappings** instead. Under **Mapping & transforms → Axis mapping**, enter the path you just saw (`Depth` is the example) and select L0 as the target. Repeat the action: **Live input** should show the received value, and **Estimated position** should change within the configured range. This is a preview, not feedback from the device.
3. If you see **No match**, check the parameter list: is the selected source still sending, and does the path match the one in the mapping row? If the list is empty too, check that OSC is enabled in VRChat and that the sender targets the address and port where Sensa is listening. Once the preview looks right, choose **Save changes**. Input stays off after saving.

That is all a direct mapping needs. Use **Computed signal** only if you want to smooth a jittery reading or blend several values with a weighted average. Manual, script and protocol inputs can skip mapping if they already provide the axes you need. For TCode, review travel, direction and speed under **Axis profiles**, save the profile and select it on the output. [Preset reference](presets.en.md)

## 4. Connect outputs, review and enable

1. At the guide's device step, click **Connect or configure a device**, or open **Outputs** directly. Choose **Output type → Add output**.
2. Configure the connection. **OSR/SR6/TCode:** select serial or network settings and a saved axis profile. **Intiface:** enter Central's WebSocket address and select the target with **Device and features → Matching device name**.
3. **Save output**, then **Enable** its card and confirm the connection. [Other output types](devices.en.md)
4. Return to **Input** and click **Apply input mode** when needed. The final guide step shows actual readiness; use **Prepare input** or **Connect device** beside an unfinished item to return to that step. Use **Edit axis mappings** for missing OSC mappings or **Continue later** to keep your place. When ready, **Finish tour** only records progress and does not enable input.
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
