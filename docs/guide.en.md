# Workbench guide

[简体中文](guide.md) | **English**

Use this map to find a control. [Guides](start.en.md) helps you choose a task; [First run](quick-start.en.md) follows the setup guide from a goal to one working connection.

| Open | Use it to |
| --- | --- |
| **Control** | Connect a device, choose an input, move L0 or play a script |
| **OSC** | Inspect VRChat parameters, choose presets and calibrate mappings |
| **Flow** | Add calculations, bindings, recordings and reusable plans |
| **Settings** | Set device travel, protocol listeners and logs |

## Guided setup and scene presets

**Start setup guide** begins four steps: **Choose a scene → Connect device → Prepare input → Review setup**. Later, use **Guided setup** to reopen it. **Save progress, continue later** keeps your place; **Resume setup** continues. **Finish setup** records completion and returns to **Control** with your chosen input. Turn on **Input enabled** when ready.

**Scene presets** opens two groups. **VRChat / OSC mappings** prepares a mapping draft with **Append to mapping draft** or **Replace mapping draft**; review and **Save mappings** in the editor. **Device axis profiles** offers **Device motion preset → Review and create an axis profile**; review and save the profile, then select it on your TCode output.

Scene shortcuts open the controls for a task. Selecting a scene or a preset does not enable input.

## Prepare, apply the input mode, then enable input

Prepare your source and output, save, then **Apply input mode** and turn on **Input enabled**. Merely opening a tab prepares its controls. Saving configuration, changing mode or loading a script turns input off. Clearing **Emergency stop** also leaves input off.

## Control

### Manual and script

Use L0 for a position stroke, or V0 under **More motion axes** for an Intiface vibrator using its default source. **Send once** sends the selected target; **Send continuously** follows edits. For funscript, choose **Script**, load a file, apply the mode, enable input and press **Play**. [Player, vibration-source and browser steps](websensa.en.md#manual-controls-and-scripts)

### Combined input

Choose Combined when different source kinds should contribute together. [Worked example](signal-pipeline.en.md#one-result-several-outputs)

### Outputs

Choose **Output type → Add output**, configure and **Save output**, then **Enable** its card. Connection status and recent values appear on the card. [Output settings and bindings](signal-pipeline.en.md#add-outputs-and-bindings)

### Receive a website's serial or Bluetooth commands

Use a [protocol input](protocol-inputs.en.md) for a compatible player, or the [serial/Bluetooth bridge tools](../tools/protocol-bridge/README.md) for those connections.

### L0 recording

**Record L0 targets** captures the main-axis trajectory. **Stop recording and export** saves it as funscript.

### Recording outputs

Add a **Signal recording** output for selected sources, several tracks or diagnostic data. [Recording and replay](signal-pipeline.en.md#record-and-inspect)

## OSC

### Parameters and sources

Find the received parameter and check its value. **Browse source** filters the view; **Use source** chooses the source used by mappings. [Parameter dictionary](osc-parameters.en.md)

### Where should I look when something does not work?

Check reception and sender port first, then source selection, saved mapping, output connection and **Input enabled**. A preview can update while input is off.

### Turn an input into motion (mapping)

Open **Scene presets** to choose an OSC preset and load it into a mapping draft. You can also use the preset selector in OSC. Calibrate its range/direction and **Save mappings**. [OGB/SPS steps](usage-scenarios.en.md#existing-ogb--sps) · [Template reference](presets.en.md)

### Combine inputs first (computed signals)

Add a named computation when you need blending, smoothing or a condition. [Calculation examples](computed-signals.en.md)

### Reception, discovery and forwarding

OSC settings contain the listening endpoint, OSCQuery discovery, Hub forwarding and **OGB parameter activation**. VRChat commonly sends to **9001** and receives on **9000**. [Ports and routing](protocol-inputs.en.md)

### Control from root position: inspect, then calibrate

Choose a [tracking setup](usage-scenarios.en.md), inspect valid readings and capture movement endpoints before enabling spatial input. [Units and calibration](positioning.en.md)

## Flow

Use Flow after a direct input/output connection works. It adds calculations, per-output bindings and **Save and load a complete plan**. [Signal-flow guide](signal-pipeline.en.md)

## Settings and help

**Axis profiles** set TCode direction, travel and motion. A device-motion preset can prepare a new profile; save it and select it on the output. Protocol listeners and logs are also here. Help links to [Guides](start.en.md) and can reopen guided setup or scene presets. [Connection reference](protocol-inputs.en.md) · [Independent desktop instances](quick-start.en.md#run-several-instances)

## Explore approach, contact and position

The [parameter explorer](https://sealoong.github.io/Sensa/parameter-geometry.html) lets you move a target and compare its readings. An offline copy ships with Sensa. [Feature reference](features.en.md)
