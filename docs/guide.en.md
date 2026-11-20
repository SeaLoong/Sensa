# Workbench guide

[简体中文](guide.md) | **English**

Use this map to find a control. [Guides](start.en.md) helps you choose a task; [First run](quick-start.en.md) follows the setup guide from a goal to one working connection.

| Open | Use it to |
| --- | --- |
| **Input** | Choose manual, script, OSC or protocol sources and inspect incoming parameters |
| **Mapping & transforms** | Map inputs to axes, edit reusable calculations and import/export plans |
| **Axis profiles** | Start from a device preset and calibrate travel, direction and speed |
| **Output** | Connect devices, apps and recordings; edit output bindings |
| **Diagnostics** | Inspect runtime logs |

## Guided setup and configuration templates

**Start setup guide** follows seven steps: **Choose a scene → Prepare input → Axis mappings → Axis profiles → Connect device → View logs → Review setup**. Each step opens its page, gives concrete instructions and highlights both the current navigation tab and actual controls. You can operate those controls directly; arrow-key navigation from the highlighted tab also updates the guide to the corresponding step. Opening an editor pauses the tour until you close it. **Escape** or **Save and exit** keeps your place. The emergency stop remains available in the tour. If input, a required OSC mapping or an output is missing, open the corresponding setup step or choose **Continue later**. When ready, **Finish tour** records completion without enabling input or changing the configuration.

Configuration templates live in the preset selector under **Mapping & transforms → Axis mapping**, in **Computed signal → Common transforms**, and in **Axis profiles → Device motion presets**. There is no separate combined preset dialog. Mappings and calculations load editable drafts and require an explicit save. Review travel, direction and speed in the axis editor, save, then select the profile on a TCode output. Loading a template does not enable input.

Use the input tabs on the control page to open manual, script or OSC settings.

## Prepare, apply the input mode, then enable input

Prepare your source and output, save, then **Apply input mode** and turn on **Input enabled**. Merely opening a tab prepares its controls. Saving configuration, changing mode or loading a script turns input off. Clearing **Emergency stop** also leaves input off.

In **Mapping & transforms**, **Save changes** saves all computed-signal and axis-mapping drafts together, including edits made in the other subtab. **Restore changes** restores both to their saved state. Output bindings use **Save output** separately. If saving is blocked, the toolbar identifies incomplete drafts and links to their workspace.

## Input

### Manual and script

Use L0 for a position stroke, or V0 under **More motion axes** for an Intiface vibrator using its default source. **Send once** sends the selected target; **Send continuously** follows edits. For funscript, choose **Script**, load a file, apply the mode, enable input and press **Play**. [Player, vibration-source and browser steps](websensa.en.md#manual-controls-and-scripts)

### Combined input

Choose Combined when different source kinds should contribute together. [Worked example](signal-pipeline.en.md#one-result-several-outputs)

### Outputs

In **Outputs**, choose **Output type → Add output**, configure and **Save output**, then **Enable** its card. Connection status, device actions and recent values appear here. [Output settings and bindings](signal-pipeline.en.md#add-outputs-and-bindings)

### Receive a website's serial or Bluetooth commands

Use a [protocol input](protocol-inputs.en.md) for a compatible player, or the [serial/Bluetooth bridge tools](../tools/protocol-bridge/README.md) for those connections.

### L0 recording

**Outputs → Record L0 targets** captures the main-axis trajectory. **Stop recording and export** saves it as funscript.

### Recording outputs

In **Outputs**, add a **Signal recording** output for selected sources, several tracks or diagnostic data. [Recording and replay](signal-pipeline.en.md#record-and-inspect)

## OSC

In **Input → OSC**, choose **Parameters** or **Experimental diagnostics**. Mappings live separately in **Mapping & transforms**. These segmented tabs prepare settings without applying an input mode.

### Parameters and sources

Under **Input → OSC**, check **Enable OSC** and the receiving address and port. If you changed the settings, choose **Save OSC settings**. Choose **Apply input mode** to use OSC. Once you see **Listening**, select **View received parameters** in the guide or open the **Parameters** tab directly. Leave **Input enabled** off while checking values. **Browse source** filters the view; **Use source** chooses the source used by mappings. [Parameter dictionary](osc-parameters.en.md)

### Where should I look when something does not work?

If a mapping shows **No match**, return to the parameter list and confirm that the selected source is sending on that path. If the paths differ, use the one shown in the list. If nothing is arriving there either, check the sender’s destination address and port against Sensa’s listener settings. Leave input off while troubleshooting.

### Turn an input into motion (mapping)

In **Input → OSC → Parameters**, find a numeric value that changes when you perform an action and choose **Map** on its row. In **Mapping & transforms → Axis mapping**, set the target to L0. Repeat the action and compare **Live input** with **Estimated position** on that row. Adjust the range or reverse the direction if needed, then choose **Save changes**. Input stays off after saving. [OGB/SPS steps](usage-scenarios.en.md#existing-ogb--sps) · [Template reference](presets.en.md)

### Combine inputs first (computed signals)

If several readings should drive one axis, add a weighted average step to the current mapping. Each input’s weight determines its influence on the result. [Calculation examples](computed-signals.en.md)

### Reception, discovery and forwarding

OSC settings contain the listening endpoint, OSCQuery discovery, Hub forwarding and **OGB parameter activation**. VRChat commonly sends to **9001** and receives on **9000**. [Ports and routing](protocol-inputs.en.md)

### Input from root position: inspect, then calibrate

Choose a [tracking setup](usage-scenarios.en.md), inspect valid readings and capture movement endpoints before enabling spatial input. [Units and calibration](positioning.en.md)

## Mapping & transforms

Use **Axis mapping** to choose which source drives which axis. If one parameter drives L0 directly, leave the processing steps collapsed.

Expand the steps only if a reading needs smoothing or several readings need blending. Appending a step or clicking an existing one opens **Computed signal**. After editing, choose **Return to current mapping** to go back to the same row without adding another mapping. The calculation is shared: once saved, other mappings and outputs that use it will use the new result too.

Expand **Output connections** on the **Outputs** page to inspect saved routes. **Edit output bindings** opens the output's existing settings dialog at its bindings; **Manage outputs** locates the full device cards on the same page. Bindings that use computations read saved results. **Save output** applies bindings separately, preserving unfinished calculation/mapping drafts.

**Save and load a complete plan** exports saved configuration. Save any calculation, mapping or output edits first to include them. [Signal-flow guide](signal-pipeline.en.md)

## Axis profiles, diagnostics and help

**Axis profiles** set TCode direction, travel and motion. A device-motion preset can prepare a new profile; save it and select it on the output. Protocol listeners are under **Input → Protocol**; logs are under **Diagnostics**, expanded by default on every visit. Help links to [Guides](start.en.md) and can reopen guided setup. [Connection reference](protocol-inputs.en.md) · [Independent desktop instances](quick-start.en.md#run-several-instances)

## Explore approach, contact and position

The [parameter explorer](https://sealoong.github.io/Sensa/parameter-geometry.html) lets you move a target and compare its readings. An offline copy ships with Sensa. [Feature reference](features.en.md)
