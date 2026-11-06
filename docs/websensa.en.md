# WebSensa

[简体中文](websensa.md) | **English**

[Open WebSensa](https://sealoong.github.io/Sensa/websensa/) to control an OSR/TCode device or connect through Intiface, using sliders or a `.funscript`. It runs in your browser without installing Sensa. For live **VRChat/SPS/OGB**, use the [desktop first run](quick-start.en.md).

Use **Start setup guide** to choose manual control or funscript playback, then follow device connection, input preparation and review. **Save progress, continue later** and **Resume setup** let you return to it. [Full first-run steps](quick-start.en.md)

To route a website or player to OSR, use **Sensa Desktop** [protocol inputs](protocol-inputs.en.md) and forward the received controls to your device. [Compare device connections](devices.en.md)

## Connect an output

1. Click **Connect or configure a device** in the guide, or open **Control → Outputs**. Choose your **Output type**, then **Add output**.
2. Enter the connection in **Output settings**, then click **Save output**.
3. Click **Enable** on the output card and confirm it connects.

For **OSR/TCode**, use TCode WebSocket or serial. **Choose serial port** opens the browser's permission picker. **Scene presets → Device axis profiles** can prepare an axis profile: review and save it, then select it on your output. Check direction and travel before movement.

For **Intiface**, start Central and enter its WebSocket address. Under **Devices and features**, enter **Matching device name** to control your device. Once connected, **Target device** can select a discovered device; **All devices** controls every matching device.

## Manual controls and scripts

For a first movement, choose **Manual** and click **Apply input mode** if shown. If using the guide, review the prepared input and click **Finish setup**, then turn on **Input enabled** in the header. Adjust **L0**, then click **Send once**. **Send continuously** follows slider changes. For a vibrator using the default V0 source, open **More motion axes**, enable **V0** under **Motion axes** and adjust its slider instead.

To play a script:

1. Choose **Script** and click **Choose script** to load a `.funscript` or compatible `.json` file.
2. Click **Apply input mode** if shown. Keep **Script target axis** on L0 for the main stroke.
3. For a vibration-only Intiface device, set its **Vibration source** to **L0 · Depth to vibration**. Turn on **Input enabled**, then press **Play**.

The player offers speed, loop, A–B, seeking and keyframe stepping. Pause/Stop request output stop; a completed non-looping script holds its final target. Saving settings, applying a different mode or loading a script turns input off. Enable it again when ready. **Emergency stop** stops all outputs; clearing it leaves input off.

## Browser connections

Use desktop Chrome or Edge for the widest serial, Bluetooth and MIDI support. WebSocket and HTTP outputs are also available; endpoints must meet the browser's HTTPS, local-network and CORS requirements.

Available output types appear in the menu. Unavailable entries explain the missing capability. For Bluetooth, choose the profile that matches your device. [Device profiles, JSON formats and bridge tools](protocol-inputs.en.md#bluetooth-and-virtual-serial-wiring)

## Calculations, recordings and explorer input

Once one output works, **Flow** can combine inputs, smooth values or send a result to several outputs. A **Signal recording** output saves funscript tracks, CSV or JSON Lines. [Calculations and recordings](signal-pipeline.en.md)

The [parameter explorer](https://sealoong.github.io/Sensa/parameter-geometry.html) can send simulated readings to WebSensa: select **Send to WebSensa**, then **Connect parameter explorer** in the workbench. Check the preview and enable input when ready.

## Choosing a host

Use WebSensa for browser connections, manual control and scripts. Choose [Desktop or CLI](features.en.md#choose-an-edition) for VRChat/OSC, native UDP/TCP listeners, application routing and filesystem recordings. All use the same **Control**, **OSC**, **Flow** and **Settings** workbench; connections depend on the host.

Browser settings and guide progress are stored locally. Reloading starts with input off and does not reconnect outputs. **Download completed browser recordings before closing or reloading.**

[All guides](start.en.md) · [First run](quick-start.en.md) · [Workbench map](guide.en.md) · [Connection reference](protocol-inputs.en.md)
