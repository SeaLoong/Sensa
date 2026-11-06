# Devices and connections

[简体中文](devices.md) | **English**

Sensa sends movement, vibration or other controls to a device. Choose the connection your device actually supports, then use [First run](quick-start.en.md) to connect it and select an input.

**OSR/SR6 are devices. TCode is their control protocol. Intiface Central discovers and connects compatible devices through Buttplug. VRChat/SPS supplies input values.** You can combine an input and an output to make a flow such as **VRChat/SPS → Sensa → TCode → OSR**.

## OSR and TCode

Use a **TCode** output for an OSR, SR6 or another controller that accepts TCode. Choose serial, UDP, TCP or WebSocket to match its firmware and your host. WebSensa supports browser serial and TCode WebSocket; use Desktop/CLI for native UDP or TCP.

Select an **Axis profile** on the output. Check direction and travel in **Settings → Axis profiles** before moving the device. L0 is the usual main stroke; the other axes depend on the controller and device.

[Connect your first output](quick-start.en.md#2-add-an-output) · [Output settings and bindings](signal-pipeline.en.md#add-outputs-and-bindings)

## Intiface devices

Start **Intiface Central**, scan for your device and add an **Intiface** output in Sensa using Central's WebSocket address. Set **Matching device name** or choose a discovered **Target device** to limit control to that device.

The device's advertised features determine what Sensa can send. Position, vibration and rotation are separate controls. For a first manual test, an OSR-like position feature uses L0; a vibrator using the default vibration source uses V0 under **More motion axes**. In WebSensa, also enable V0 under **Motion axes**.

For an L0 funscript on a vibration-only device, select **L0 · Depth to vibration** as the output's **Vibration source**. Use actuator mappings when individual features need different sources.

[Manual and script steps](websensa.en.md#manual-controls-and-scripts) · [Feature routing reference](signal-pipeline.en.md#add-outputs-and-bindings)

## Other devices and applications

Desktop/CLI also provide Handy, Lovense, Autoblow, VacuGlide and DG-LAB outputs, plus OSC, MIDI CC, HTTP/WebSocket JSON and MQTT. The selected output shows its connection settings and supported bindings.

WebSensa can use supported Bluetooth profiles, browser MIDI, HTTP and WebSocket outputs. Bluetooth support requires a matching protocol profile as well as browser access; it does not cover every Bluetooth device.

A website or player can send commands **into** desktop Sensa through a [protocol input](protocol-inputs.en.md). For example: **website → Sensa virtual Buttplug device → TCode → OSR**. This is a separate connection from using Intiface as an output. [Serial and Bluetooth bridge tools](../tools/protocol-bridge/README.md) cover compatible upstream applications that need those interfaces.

## Choose desktop or WebSensa

| Connection or task | Desktop / CLI | WebSensa |
| --- | --- | --- |
| Manual controls and funscripts | Yes | Yes |
| Live VRChat / OSC input | Yes | Use desktop |
| TCode serial | Native serial component | Browser with Web Serial |
| TCode WebSocket and Intiface | Yes | Yes, subject to browser connection rules |
| Native TCode UDP / TCP | Yes | Use desktop |
| Bluetooth | Optional bridge and matching profile | Web Bluetooth and matching profile |
| MIDI output | Native MIDI component | Browser with Web MIDI |
| Receive another application's device commands | Protocol listeners and bridges | Use desktop |
| Recording output | Filesystem recordings | Download files before closing the page |

The output menu explains unavailable choices. Browser serial, Bluetooth and MIDI need browser support and device permission. HTTP/WebSocket endpoints must meet browser HTTPS, local-network and CORS requirements.

[Open WebSensa](https://sealoong.github.io/Sensa/websensa/) · [Download Sensa](https://github.com/SeaLoong/Sensa/releases/latest) · [Download formats](features.en.md#configuration-and-development)

## Check a connection

Save the output settings, then **Enable** its card and check its connection status. Choose and apply your input separately, then turn on **Input enabled** when ready. A connected device alone does not start playback or send manual movement.

If nothing happens, check the endpoint or port, device selection, output enabled state, source axis and **Input enabled**. The [workbench map](guide.en.md) helps you find these controls; the [connection reference](protocol-inputs.en.md) covers ports and bridges.
