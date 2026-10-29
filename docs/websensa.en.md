# WebSensa

[简体中文](websensa.md) | **English**

[Open WebSensa](https://sealoong.github.io/Sensa/websensa/) to control devices and applications directly from a browser. Use manual controls, play a funscript or connect the parameter explorer, then send the result to several outputs. The page runs on its own; its Control, Outputs and Help pages follow the desktop workbench layout.

## Connect and send

1. In **Outputs**, add an output and choose its connection type.
2. Enter an endpoint, or select a serial, Bluetooth or MIDI device when the browser asks.
3. Connect the output and select its target axis or feature.
4. In **Control**, choose **Manual** and enable input. Adjust a value to send it.

Add several outputs to fan out one control or script. Each output keeps its own target and connection status. Intiface devices share the same endpoint connection, with one output managing each physical device. MIDI destinations can share a port on distinct channel/controller pairs. TCode uses one output per endpoint/serial port and sends the selected axes together; different WebSocket paths can share one service port.

## Manual controls

The manual panel provides position, rotation and intensity axes. Choose L0/L1/L2, R0/R1/R2 or V0 as needed, then adjust the sliders. TCode uses normalized positions mapped to its axis values; vibration and MIDI use their protocol ranges.

**Stop** ends sending. **Emergency stop** also holds input off until cleared. Connection controls stay available while input is off, so you can prepare devices before sending a value.

## Play a script

Open a `.funscript` file from your computer. The timeline shows its trajectory and cursor. Choose a destination axis, playback speed from **0.1× to 4×**, and whether to loop.

Enable input and press **Play**. Pause holds the playback cursor; seek moves to a selected point. A loaded script starts at its actual first target, including a nonzero first value. Use **Stop** to end playback.

For a simple recording, start the manual L0 recorder, move the control and finish. Download the generated funscript to play it again in WebSensa or Sensa Desktop.

## Output connections

| Type | Select | Data sent |
| --- | --- | --- |
| Intiface / Buttplug | Central WebSocket, device and feature | Position, vibration or rotation commands supported by the selected feature |
| TCode WebSocket | WebSocket endpoint and axes | TCode text frames |
| TCode serial | Browser-selected serial port and baud rate | TCode text frames over Web Serial |
| JSON WebSocket | WebSocket endpoint | Axis values as JSON messages |
| HTTP JSON | HTTP endpoint | JSON requests to the receiving service |
| MIDI CC | MIDI output, channel and controller | MIDI controller values |
| Bluetooth | Supported device profile and browser-selected device | Profile-specific GATT commands |

Bluetooth profiles include **LOOB** and **Thrust Sync** for L0 position, and **Svakom V1**, **Lovense single-vibration** and **Youou VX001** for V0 intensity. Choose the matching profile before selecting the device. [Profile details](protocol-inputs.en.md#bluetooth-and-virtual-serial-wiring)

Use Sensa Desktop for UDP/TCP sockets, OSC reception, vendor cloud integrations and the full recording/computation system. [Desktop connections](signal-pipeline.en.md#add-outputs-and-bindings) · [Device bridge tools](../tools/protocol-bridge/README.md)

For a custom JSON WebSocket receiver, acknowledge each command with `{ "ok": true }`. HTTP/JSON messages use Sensa's channel-command model, so they can connect directly to a configured [JSON protocol input](protocol-inputs.en.md#httpwebsocket-json-for-applications).

## Bring in an explorer value

Open the [parameter explorer](https://sealoong.github.io/Sensa/parameter-geometry.html), choose a parameter and send it to WebSensa. Select the explorer source in WebSensa, enable input and move the target in the diagram. This makes it possible to try a simulated depth or touch reading on the selected output using the same workbench controls.

## Browser support and settings

| Feature | Browser requirement |
| --- | --- |
| WebSocket / HTTP | The endpoint must accept the page's connection; HTTP uses the receiver's CORS policy |
| Serial / Bluetooth / MIDI | A browser implementing the corresponding API and permission to use the selected device |
| HTTPS website to a local service | Browser mixed-content and local-network permission rules apply; use an endpoint permitted by your browser |
| Files | Funscript files are opened from your device and exports are downloaded there |

The connection picker shows available capabilities. Chromium-based desktop browsers generally expose the broadest set of device APIs. Language preference is kept in the browser; device credentials and connection settings are entered for the current session.

[Desktop first run](quick-start.en.md) · [Feature comparison](features.en.md) · [Signal-flow guide](signal-pipeline.en.md)
