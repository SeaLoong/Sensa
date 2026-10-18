# Sensa test world

[简体中文](README.md) | **English**

Start with **`Assets/SensaLab/Functional/FunctionalLab.unity`**, then **00 START HERE** beside spawn. Follow [First OSR setup](https://github.com/SeaLoong/Sensa/blob/main/docs/quick-start.en.md) to add the receiver to your avatar and select the preset. No image bridge is needed.

Five steps, TOUCH, STOP and RESET stimulate your avatar receiver. A test ends after 60 seconds, leaving 3 m or changing avatar. Boards show Expected; inspect actual receipt and output in Sensa. ClientSim is not avatar OSC.

The physical rack, QuickStart ball and native SPS props support **LEFT / RIGHT / PLACE / HOME**. Directly grabbing a pickup exits hand-follow mode. **08 MY AVATAR SPS** has an amber world Plug for your Socket and a blue world Socket for your Plug.

Both scenes use neutral gray-white floors. Existing projects can use **Tools → Sensa Lab → Use neutral grey-white floors** without changing collisions/layout. **Upgrade interactive targets and probe labels** adds controls/markers without resetting existing target positions. **Add first-run avatar bench** adds the bench only once after source installation.

## Geometry scene

`Assets/SensaLab/Generated/SensaLab.unity` contains separate geometry boundary tests. Use `<World project>` for your local world project directory.

Walk, run and jump using current client bindings. In ClientSim, close its menu and focus Game view; defaults are WASD, Shift and Space. The 20/40 cm steps near spawn let you try jumping.

Each station has a white grabbable ball, blue RESET, white PAUSE and orange MISSING P4. Buttons are around waist height. The visible pickup size is not the measurement Sender radius.

| Reading | Meaning |
| --- | --- |
| Truth | Reference-local Transform coordinate available to the world |
| Decoded | Position reconstructed from four distances |
| P1–P4 bars | Proximity samples, with fixed probe colors; validity is separate |
| RMS | Fit consistency, not a real accuracy guarantee; n/a if unsolved |
| Green/red line | Valid/invalid position |
| EXPLORING | Initial conditions changed; reset before comparing the baseline |

| Case | Expected baseline |
| --- | --- |
| 01 Front | Valid |
| 02 Behind / negative Z | Valid, no mirror flip |
| 03 Lateral offset | Valid |
| 04 Outside Contact range | Invalid |
| 05 Receiver saturation | Invalid |
| 06 Wrong Sender radius | Invalid |
| 07 Uniform scale ×2 | Local coordinates unchanged |
| 08 Rotated reference | Local coordinates unchanged |
| 09 Missing P4 | Invalid; toggle to recover |
| 10 Beyond solve volume | Invalid even with four nonzero values |
| 11 Reference origin | Valid, near zero |

P1–P4 are tetrahedron inputs; C1–C8 are cube inputs. First four colors are red/blue/green/yellow, then purple/cyan/orange/light gray. Both use raw A0-based fields but different spatial layouts. They are unrelated to TCode auxiliary outputs A0/A1/A2. Marker spheres show receiver centers, not full radii.

## Capabilities and limits

See the [capability matrix](CAPABILITIES.en.md) for Contact-only, PB-only, combined, native SPS and shader cases. PB handles are grabbable with collisions disabled. The shader and camera experiments default off; do not enable both desktop output experiments together.

Historical reports in Validation cover layout, locomotion, controls and ClientSim/Udon. They are not physical VR input or uploaded-world tests. Automated E2E/screenshots are CI-only under the current workflow; manual exploration remains available. World objects are local, without multiplayer synchronization, and never automatically send motion to hardware.

[Implementation and reports](DEVELOPMENT.en.md) · [Camera prototype](CAMERA-PROTOTYPE.en.md)
