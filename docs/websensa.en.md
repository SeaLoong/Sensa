# WebSensa

[简体中文](websensa.md) | **English**

[Open WebSensa](https://sealoong.github.io/Sensa/websensa/) to adjust signals, play funscript files and drive several outputs from a browser. It runs directly in the page. You do not need to start a local Sensa service.

WebSensa, the Node.js service and Electron use one workbench and one TypeScript signal engine. The **Control**, **OSC**, **Flow** and **Settings** workspaces keep the same controls and layout. A browser runs the engine locally; the service's WebUI and Electron connect to the Node.js host. Available connections depend on the host and its installed adapters.

## Connect an output

1. In **Control → Output**, choose an **Output type**, then **Add output**.
2. In **Output settings**, enter the endpoint and choose a name, profile or signal binding. **Save output** applies the configuration.
3. Click **Enable** on its card. Serial and Bluetooth devices are selected through the browser's permission dialog; use **Choose serial port** when configuring Web Serial.
4. Prepare the input, then turn on **Input enabled** to send signals.

Add more cards to fan out signals. Each card shows its own connection, values and errors. Saving configuration applies the same behavior as the executable: it closes input, preserves unchanged connections, and waits for you to enable input again.

## Manual controls and scripts

**Manual** supports all twelve axes: **L0–L2, R0–R2, V0–V2 and A0–A2**. Select the axes that should participate. The sliders use **0–999**; the signal engine converts them to **0–1**, and the output profile determines the device range. **Send once** updates the target; **Continuous send** follows slider changes. Open the additional axes to adjust rotation, vibration and auxiliary controls.

To play a file, select **Script**, click **Apply input mode** if shown, and **Choose script**. A `.funscript` or compatible `.json` file supplies its real first position. Select a **Script target axis**, playback speed, loop or A–B range, then enable input and play. The timeline supports seeking, action stepping and keyboard controls.

At the end of a non-looping script, playback holds its final target and keeps the current input state. **Stop** ends playback and requests output stop. Pausing holds the cursor and also stops output. **Emergency stop** stops all outputs; clearing it leaves input off until you enable it again.

**Record L0 targets** captures the shared engine's calculated stroke. Start recording, control or play a signal, then **Stop recording and export**. For independent tracks or signal data, add a **Signal recording** output, configure its bindings and choose Funscript, CSV or JSON Lines. Completed files can be downloaded, loaded into the script player or used as replay sources.

## Browser connections

| Output type | Destination and behavior |
| --- | --- |
| Intiface | Buttplug v3 WebSocket; position, vibration and rotation features discovered from the server |
| TCode WebSocket / serial | Selected axes encoded with the shared axis profiles, ranges and motion settings; serial uses Web Serial |
| Sensa · HTTP / WebSocket | Sensa axis-command messages, for connection to another Sensa protocol input or a compatible receiver |
| HTTP JSON / WebSocket JSON | Individual signal bindings encoded as `{address, value, type, …}` messages |
| MIDI CC | A selected MIDI output with `CC/channel/controller` signal bindings |
| Bluetooth LE | A selected device with a supported GATT profile and source axis |
| Signal recording | Page-local Funscript tracks, CSV or JSON Lines |

The two JSON families have different wire formats. **Sensa · HTTP / WebSocket** uses channel-command messages understood by [Sensa protocol inputs](protocol-inputs.en.md#httpwebsocket-json-for-applications); its WebSocket receiver acknowledges commands with `{ "ok": true }`. Generic **HTTP JSON / WebSocket JSON** sends the shared signal-binding envelope.

Bluetooth profiles include **LOOB**, **Thrust Sync**, **Svakom V1**, **Lovense single-vibration** and **Youou VX001**. Choose the matching profile and the source axis before enabling the output. [Profile details and bridges](protocol-inputs.en.md#bluetooth-and-virtual-serial-wiring)

Intiface cards default to **All devices**. To split devices into separate outputs on one socket, set each card's **Target device** or **Matching device name** to a distinct device. Default position features use inverted L0, matching the executable; feature mappings select a different source or direction. Different explicit device indices also distinguish devices with the same name. MIDI bindings can share one port on different channel/controller pairs. One TCode card sends its selected axes together; different WebSocket paths can use the same service port.

## Calculations, recordings and explorer input

The **Flow** workspace uses the same calculations, bindings, mapping curves, priorities and replay sources as the executable. Combine manual, script and paired input values, or route a calculation to several outputs. Network listeners belong to the Node.js host; the standalone page does not open UDP/TCP or OSC listener ports.

From the [parameter explorer](https://sealoong.github.io/Sensa/parameter-geometry.html), choose **Send to WebSensa**. In the opened workbench click **Connect parameter explorer**. Incoming values appear in the input panel without enabling output. Turn on **Input enabled** to route them. A stopped or expired stream closes input; a fresh value updates the preview and lets you enable it again.

## Choosing a host

| Host | Connections |
| --- | --- |
| Standalone WebSensa | Browser WebSocket/HTTP, supported serial/Bluetooth/MIDI APIs, local files and paired explorer input |
| Node.js service WebUI | Native listeners, UDP/TCP/OSC, filesystem recordings, vendor integrations and installed native adapters |
| Electron | The same Node.js service and workbench inside a desktop window |

The output menu disables unavailable types. Desktop Chromium browsers usually provide the widest device API support; Firefox and Safari can still use WebSocket and HTTP outputs. HTTP receivers need a matching CORS policy, and an HTTPS page must use endpoints allowed by that browser's mixed-content and local-network rules.

Browser configuration and language preferences are saved locally. Reloading prepares an inactive configuration; it does not reconnect outputs automatically. Completed browser recordings remain in page memory, so download them before closing or reloading. Native recordings use the service's recording directory.

[First run](quick-start.en.md) · [Signal-flow guide](signal-pipeline.en.md) · [Adapter packages](adapter-catalog.en.md)
