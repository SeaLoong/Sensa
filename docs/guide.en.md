# Workbench guide

[简体中文](guide.md) | **English**

This is a map of the workbench. For the first connection, follow [First run](quick-start.en.md). For VRChat/SPS, follow [OGB/SPS setup](usage-scenarios.en.md#existing-ogb--sps).

| Open | Use it to |
| --- | --- |
| **Control** | Connect a device, choose an input, move L0 or play a script |
| **OSC** | Inspect VRChat parameters, choose presets and calibrate mappings |
| **Flow** | Add calculations, bindings, recordings and reusable plans |
| **Settings** | Set device travel, protocol listeners and logs |

## Prepare, apply the input mode, then enable input

Prepare your source and output, save, then **Apply input mode** and turn on **Input enabled**. Merely opening a tab prepares its controls. Saving configuration, changing mode or loading a script turns input off. Clearing **Emergency stop** also leaves input off.

## Control

### Manual and script

Start with L0. **Send once** sends the selected target; **Send continuously** follows edits. **More motion axes** reveals the other axes. For funscript, choose **Script**, load a file, apply the mode, enable input and press **Play**. [Player and browser steps](websensa.en.md#manual-controls-and-scripts)

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

Choose a [preset](presets.en.md), **Replace draft**, calibrate its range/direction and **Save mappings**. [OGB/SPS steps](usage-scenarios.en.md#existing-ogb--sps)

### Combine inputs first (computed signals)

Add a named computation when you need blending, smoothing or a condition. [Calculation examples](computed-signals.en.md)

### Reception, discovery and forwarding

OSC settings contain the listening endpoint, OSCQuery discovery, Hub forwarding and **OGB parameter activation**. VRChat commonly sends to **9001** and receives on **9000**. [Ports and routing](protocol-inputs.en.md)

### Control from root position: inspect, then calibrate

Choose a [tracking setup](usage-scenarios.en.md), inspect valid readings and capture movement endpoints before enabling spatial input. [Units and calibration](positioning.en.md)

## Flow

Use Flow after a direct input/output connection works. It adds calculations, per-output bindings and **Save and load a complete plan**. [Signal-flow guide](signal-pipeline.en.md)

## Settings and help

**Axis profiles** set TCode direction, travel and motion. Select the saved profile on the output. Protocol listeners and logs are also here. [Connection reference](protocol-inputs.en.md) · [Independent desktop instances](quick-start.en.md#run-several-instances)

## Explore approach, contact and position

The [parameter explorer](https://sealoong.github.io/Sensa/parameter-geometry.html) lets you move a target and compare its readings. An offline copy ships with Sensa. [Feature reference](features.en.md)
