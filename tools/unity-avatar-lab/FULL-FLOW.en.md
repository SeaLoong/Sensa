# One avatar for the complete test flow

[简体中文](FULL-FLOW.md) | **English**

Open **`Assets/SensaAvatarLab/Generated/FullFlow.unity`**. It combines the Chocolat base, SPS lollipop, hand Sockets, Sensa tracking, grabbable PB, QuickStart receiver and optional shader rig. Upload **Private**. This is an acceptance avatar with extra components, not a minimal-cost daily template.

Follow the shared [avatar/world/Sensa route](https://github.com/SeaLoong/Sensa/blob/main/docs/lab-workflow.en.md). On every test change: input off → replace whole draft → save → inspect values → enable input. Saving turns input off.

## Place props first

In **Sensa Test Props**, Palm Socket, Forearm Socket, PB handle and Shader rig offer **Home / reset**, **Left hand**, **Right hand** and **Place in world**. Move a prop with a hand, place it, then walk away. Placement state is unsaved and resets on avatar reload. **Visible labels / probes** only changes helpers.

The lollipop retains **SPS_Lollipop → LeftHand / RightHand / Fixed / Off**. **SPS OSC** enables native OGB parameters, **Measure plug** selects Plug measurement, and each Socket has **Measure this socket**. The Shader submenu provides synthetic code and CRC fault toggles. Original Sensa Lab/Sensa Shader menus address the same parameters.

A useful self-test is a world-placed Palm Socket with the lollipop in the right hand. Place the PB reference in front, then grab the white ball; moving its reference alone is not PB stretch.

White centers/gold +Z indicate Socket opening and inward direction. ROOT/TIP/SIDE mark paired points. P1–P4 is tetrahedral local/PB sampling; C1–C8 is cube sampling. Colors are red, blue, green, yellow, then purple, cyan, orange, light gray. Balls mark centers, not receiver radii. These independent Point/Pose layouts use A0-based paths; they are not TCode auxiliary axes or the Sensa SPS P0–P3 protocol.

Measure plug changes Palm helpers to P probes; Socket measurement restores C probes. Root/Tip/Side arrays share cube positions but different paths. Independent PB always uses P. QuickStart remains bound to the right wrist, matching the world bench.

## Test in order

Start Sensa with no outputs, enable VRChat OSC, enable Sensa receiving and apply OSC mode. Enter **FunctionalLab** in VRChat with your newly uploaded avatar.

| Step | Avatar/world action | Inspect in Sensa |
| --- | --- | --- |
| QuickStart | START HERE five levels, then STOP; SPS unnecessary | QuickStart Depth≈0/.25/.5/.75/1 and Active gate |
| Independent PB | Place PB handle reference, grab/stretch/release | Map actual Handle_Stretch to Depth and Handle_IsGrabbed to GateEnable; native scalars need no XYZ |
| Native SPS | Enable SPS OSC; approach enabled Socket with own/world Plug | Copy the radial template and use actual PenSelfNewRoot for self interaction; paired NewTip is read automatically |
| Local Plug | Measure plug and move relative to Socket | OSC → Experimental diagnostics: candidate ReferenceLocal estimates, blocked from motion by default |
| Fixed SPS root | Measure your selected Socket/Plug | P0–P3 plus changing Sample; five Float fields and Avatar-root coordinates, not direct stroke |
| Paired pose | Matching LabPair Root/Tip/Side | Experimental fit only; matching tags/low residual prove neither one Sender nor a shared frame |
| Synthetic shader | Enable code, corrupt CRC, freeze/disable | Image bridge Frame/Valid, not SPS geometry |

The **08 MY AVATAR SPS** zone contains an amber 20 cm WORLD PLUG and blue WORLD SOCKET, both with hand/place/home controls and pickups. World Contacts can affect Self/Others; pin the actual instance rather than guessing from suffix. Engineering board values do not prove avatar OSC receipt.

## Shader is optional

Synthetic code encodes (.25,−.5,.75). In the 0–.2 m Z template, .75 saturates at 100%; it is not a 60% SPS test. Real SPS GPU editor captures use Offset approximately (.06,0,.12), giving 60% Z displacement, while axial SPS insertion is 40%.

The uploadable rig contains native cameras/materials only and starts off. Actual SPS→PNG remains an editor GPU Probe workflow; it is not an uploadable arbitrary C# reader. Follow [image bridge](../unity-world-lab/CAPABILITIES.en.md#image-bridge). Inspect CRC, increasing frames, freeze and recovery. Headset invisibility and capture synchronization are not guaranteed.

## Then add hardware

After the first three stages pass, assign **OSR first test · small L0 stroke**, check real hardware calibration and repeat the world steps. Sent targets should be about 400/450/500/550/600. Output cards are commands, not measured mechanical positions. STOP, then disable input.

Missing values: check new avatar worn, OSC/Contacts/self-interaction permissions, native OGB_ENABLED, the independent measurement selector, source and saved mappings. PB should be grabbable without physical collisions. Shader experiments must be off before returning to normal tests.

Reports in Validation record SDK/preprocess/controller/bundle checks, not uploaded client or hardware certification. Do not duplicate components already on FullFlow or commit proprietary model assets to Sensa.
