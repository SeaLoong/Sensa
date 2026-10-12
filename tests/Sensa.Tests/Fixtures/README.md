# Unity SDK fixture

`unity-point.json` was captured on 2026-10-13 (Asia/Shanghai) from the local Sensa Worlds laboratory running Unity 2022.3.22f1 / SDK 3.10.5 in ClientSim. It contains actual `VRCContactReceiver.CalculateProximity` results for four tetrahedral anchors (cube indices 0, 3, 5, 6 at ±0.06 m), receiver radius 0.35 m, sender radius 0.001 m, and the observed target Transform position. It validates desktop decoding against SDK measurements; it is not a capture of avatar OSC or a real player's grab interaction.

`unity-point-cases.json` records eleven world SDK cases from `LabPointCases.Run`: front/back, lateral, out-of-contact, saturation, wrong radius, uniform scale, rotated frame, injected missing lane, fit-volume rejection and origin. Case 09 explicitly substitutes -1 for the missing lane; that value is fault injection, not an SDK measurement. Valid cases are compared with the captured local Transform coordinates.
