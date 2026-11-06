# Workbench guide

[简体中文](guide.md) | **English**

Use this map to find a control. [Guides](start.en.md) helps you choose a task; [First run](quick-start.en.md) follows the setup guide from a goal to one working connection.

| Open | Use it to |
| --- | --- |
| **Control** | Connect and manage devices, choose an input, move L0 or play a script |
| **OSC** | Inspect VRChat parameters, choose presets and calibrate mappings |
| **Flow** | Edit computed signals, connect their results to outputs and reuse saved plans |
| **Settings** | Set device travel, protocol listeners and logs |

## Guided setup and scene presets

**Start setup guide** begins four steps: **Choose a scene → Connect device → Prepare input → Review setup**. Later, use **Guided setup** to reopen it. **Save progress, continue later** keeps your place; **Resume setup** continues. **Finish setup** records completion and returns to **Control** with your chosen input. Turn on **Input enabled** when ready.

**Scene presets** opens two groups. **VRChat / OSC mappings** prepares a mapping draft with **Append to mapping draft** or **Replace mapping draft**; review and **Save changes** in the editor. **Device axis profiles** offers **Device motion preset → Review and create an axis profile**; review and save the profile, then select it on your TCode output.

Scene shortcuts open the controls for a task. Selecting a scene or a preset does not enable input.

## Prepare, apply the input mode, then enable input

Prepare your source and output, save, then **Apply input mode** and turn on **Input enabled**. Merely opening a tab prepares its controls. Saving configuration, changing mode or loading a script turns input off. Clearing **Emergency stop** also leaves input off.

In OSC and Flow, **Save changes** saves all computed-signal and axis-mapping drafts together, including edits made in the other workspace. **Restore changes** restores both to their saved state. Output bindings use **Save output** separately. If saving is blocked, the toolbar identifies incomplete drafts and links to their workspace.

## Control

### Manual and script

Use L0 for a position stroke, or V0 under **More motion axes** for an Intiface vibrator using its default source. **Send once** sends the selected target; **Send continuously** follows edits. For funscript, choose **Script**, load a file, apply the mode, enable input and press **Play**. [Player, vibration-source and browser steps](websensa.en.md#manual-controls-and-scripts)

### Combined input

Choose Combined when different source kinds should contribute together. [Worked example](signal-pipeline.en.md#one-result-several-outputs)

### Outputs

In **Control → Outputs**, choose **Output type → Add output**, configure and **Save output**, then **Enable** its card. Connection status, device actions and recent values appear here. [Output settings and bindings](signal-pipeline.en.md#add-outputs-and-bindings)

### Receive a website's serial or Bluetooth commands

Use a [protocol input](protocol-inputs.en.md) for a compatible player, or the [serial/Bluetooth bridge tools](../tools/protocol-bridge/README.md) for those connections.

### L0 recording

**Record L0 targets** captures the main-axis trajectory. **Stop recording and export** saves it as funscript.

### Recording outputs

In **Control → Outputs**, add a **Signal recording** output for selected sources, several tracks or diagnostic data. [Recording and replay](signal-pipeline.en.md#record-and-inspect)

## OSC

Use **Map**, **Parameters** and **Experimental diagnostics** to choose the OSC view. These segmented tabs prepare settings without applying an input mode.

### Parameters and sources

Find the received parameter and check its value. **Browse source** filters the view; **Use source** chooses the source used by mappings. [Parameter dictionary](osc-parameters.en.md)

### Where should I look when something does not work?

Check reception and sender port first, then source selection, saved mapping, output connection and **Input enabled**. A preview can update while input is off.

### Turn an input into motion (mapping)

Open **Scene presets** to choose an OSC preset and load it into **OSC → Map**. You can also use the preset selector there. Select a parameter or computed result, calibrate its range/direction and **Save changes**. [OGB/SPS steps](usage-scenarios.en.md#existing-ogb--sps) · [Template reference](presets.en.md)

### Combine inputs first (computed signals)

Choose **Edit computed signals in Flow** when you need blending, smoothing or a condition. Create the calculation in Flow, then select its result in the mapping. [Calculation examples](computed-signals.en.md)

### Reception, discovery and forwarding

OSC settings contain the listening endpoint, OSCQuery discovery, Hub forwarding and **OGB parameter activation**. VRChat commonly sends to **9001** and receives on **9000**. [Ports and routing](protocol-inputs.en.md)

### Control from root position: inspect, then calibrate

Choose a [tracking setup](usage-scenarios.en.md), inspect valid readings and capture movement endpoints before enabling spatial input. [Units and calibration](positioning.en.md)

## Flow

Flow is the home for creating and editing **Computed signals**. **Map to an axis** on a calculation opens OSC with a new draft; review it and **Save changes** when ready.

**Output connections** summarizes saved routes. **Edit output bindings** opens the output's existing settings dialog at its bindings; **Manage outputs** opens the full device cards in Control. Bindings that use computations read saved results. **Save output** applies bindings separately, preserving unfinished calculation/mapping drafts.

**Save and load a complete plan** exports saved configuration. Save any calculation, mapping or output edits first to include them. [Signal-flow guide](signal-pipeline.en.md)

## Settings and help

**Axis profiles** set TCode direction, travel and motion. A device-motion preset can prepare a new profile; save it and select it on the output. Protocol listeners and logs are also here. Help links to [Guides](start.en.md) and can reopen guided setup or scene presets. [Connection reference](protocol-inputs.en.md) · [Independent desktop instances](quick-start.en.md#run-several-instances)

## Explore approach, contact and position

The [parameter explorer](https://sealoong.github.io/Sensa/parameter-geometry.html) lets you move a target and compare its readings. An offline copy ships with Sensa. [Feature reference](features.en.md)
