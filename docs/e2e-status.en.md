# Verification record

[简体中文](e2e-status.md) | **English**

This page records observed checks for the current changes. The full history remains in a [pinned record](https://github.com/SeaLoong/Sensa/blob/b23451a7e67627c2ea4ac4c8fdb5cc436e8ab640/docs/e2e-status.en.md). See [development and publication](development.en.md) and [E2E maintenance](e2e.en.md) for workflow instructions.

## Current scope

On 2026-10-24 (Beijing time), this update adds moving reference planes within one Avatar, seven spatial calculations, Unity Tracking Frame, Shader offsets and multiple-tile capture, plus Windows installers and single-file releases. Documentation and diagrams clarify SPS defaults, coordinate units, the current SDK beta and paired poses between Avatars. WebUI, the documentation site and actual application screenshots are updated together.

## Isolated checks

| Scope | Observed result |
| --- | --- |
| .NET units | **758 passed**, including geometry, sources/age, routing and launch behavior |
| Web units | **217 passed**, including spatial presets and installer selection |
| Python/scripts | **306 passed**, including QR recovery, publication and dependency installation |
| Documentation | **92 routes** built; the build checks links and screenshot provenance |
| Unity static checks | Package metadata, syntax for 57 C# files and isolated API type checks against actual Unity/SDK assemblies passed |
| Windows single-file static publish | The x64 publish directory contains only `Sensa.exe`; embedded resources checked. Runtime/installation checks belong to native CI |

API type checks use some generator-boundary substitutes. Tracking Frame adds 17 parameterized EditMode cases, awaiting execution inside the Editor.

## Browser and site

| Pinned source | Run | Observed result |
| --- | --- | --- |
| `71f63460` | [Pages 40032441894](https://github.com/SeaLoong/Sensa/actions/runs/40032441894/attempts/1) | **14/14 passed and deployed**; all 38 public documentation originals match their catalog digests |
| `b23451a7` | [Pages 40028882502](https://github.com/SeaLoong/Sensa/actions/runs/40028882502/attempts/1) | **14/14 passed and deployed**, all other outcomes zero |
| `b23451a7` | [CI before baseline update 40028882526](https://github.com/SeaLoong/Sensa/actions/runs/40028882526/attempts/1) | **1 passed, 3 failed, 112 not run**; two previous editor images differ and a new spatial image has no baseline. Build/publication skipped |
| `b23451a7` | [Full candidate 40028896056](https://github.com/SeaLoong/Sensa/actions/runs/40028896056/attempts/1) | **116/116 passed**, all other outcomes zero; 164 application images and eight site originals exported to [PR #25](https://github.com/SeaLoong/Sensa/pull/25) |

Pages reports `suite=site`, `mode=comparison`, `runner=passed`, `selectionComplete=false`, `snapshotsCompared=true`, command successful. All eight original site images were reviewed; previous individual observations were reused only for matching SHA-256. The public homepage, English/Chinese quick starts, a deep Unity guide and CSS/JS match the build manifest: all six resources returned 200 with matching digests. Tests cover rendered styles, responsive pictures, language switching, stale-asset recovery and installer discovery.

The application comparison before baseline update reports `suite=all`, `mode=comparison`, `runner=failed`, `selectionComplete=true`, `snapshotsCompared=true`; all outcomes other than those listed are zero. The full suite now contains **116 cases**, covering both languages and viewports, spatial calculations, following-plane presets, shared sessions and the site. Candidate images require individual review followed by a complete normal comparison with updates disabled.

The candidate pins `b23451a7e67627c2ea4ac4c8fdb5cc436e8ab640`, with raw image commit `d59f94453d38e93a113ef10fcedecd30d51492ac`; runner passed, command successful, full selection true and snapshot comparison false. All 172 images were reviewed: 109 reused matching SHA-256 observations and 63 fresh originals were individually opened. Twelve SPS four-anchor/Contact diagrams need clearer radius units and illustrated-scale wording and are being recaptured after correction. Layout and QR appearance show no blockers. Documentation now publishes **38 individually reviewed originals**, including English/Chinese manual controls and spatial input groups. Application baseline acceptance awaits the corrected candidate and full comparison.

[Image review and provenance](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__screenshots__/README.md) · [Application screenshots](screenshots.en.md)

## Issues found and resolved

[Candidate 40032454295](https://github.com/SeaLoong/Sensa/actions/runs/40032454295), on `71f6346`, recorded **757 passed and one failed** in backend units; browsers were skipped. A test started two concurrent receives on one `UdpClient`, racing its shared buffer. It now receives sequentially while retaining the one-second deadline, address-independent assertions and virtual-clock cleanup. The corrected full backend suite passed **758/758**, and the case passed **10/10** repeated runs of the same build.

- Source `0c1ad2c` passed Web checks in [CI 40025345270](https://github.com/SeaLoong/Sensa/actions/runs/40025345270) and [candidate 40025349090](https://github.com/SeaLoong/Sensa/actions/runs/40025349090), then locked restore failed with `NU1004` after automatically choosing SDK 10.0.402. Backend tests and browsers did not run. SDK 10.0.401 is now pinned, and subsequent unit checks passed.
- [Pages 40025344984](https://github.com/SeaLoong/Sensa/actions/runs/40025344984), on that source, recorded **12 passed and 2 failed**: repeat navigation to the same installer page did not reload. Explicit reload fixed it; [Pages 40026115999](https://github.com/SeaLoong/Sensa/actions/runs/40026115999) passed **14/14 and deployed**, with eight originals individually reviewed. Its [CI 40026116151](https://github.com/SeaLoong/Sensa/actions/runs/40026116151) still encountered previous baseline differences: **1 passed, 3 failed, 112 not run**.
- Attempts 1 and 2 of [candidate 40026140751](https://github.com/SeaLoong/Sensa/actions/runs/40026140751) timed out downloading fonts from the Azure Ubuntu mirror. Browsers did not start; all outcomes were zero, `runner=not-run`, command skipped, selection/comparison flags false. The installer now uses the official HTTPS mirror on retry while checking the same font version and SHA-256. [CI 40028882526](https://github.com/SeaLoong/Sensa/actions/runs/40028882526) recovered from its first timeout in practice: the 61.2 MB font downloaded in 4 seconds and browser checks continued.
- Source `8d92eff` passed CI unit checks; its CI, Pages and candidate were intentionally cancelled to continue on the installer-test correction.

## Unity and physical-device scope

Unity Editor **2022.3.22f1** successfully ran its version command. Windows Mono support and independent Avatar/World projects are installed. Avatar uses SDK **3.10.6-beta.3**, MA **1.18.7**, NDMF **1.14.8** and VRCFury **1.1434.0**; World uses SDK **3.10.5**. This update synchronized 185 managed Avatar files and 51 World files. Two offline VPM installations per project retained matching package contents; tool versions, locks, source digests and local-project remote configuration were checked.

An actual batch import connected to licensing and exited with **“No valid Unity Editor license found.”** Editor compilation, NDMF builds, EditMode, Shader GPU capture, VRChat/HMD and physical devices await their respective environments. Browser images show the running WebUI with isolated simulated connections and measurements. Unity packaging checks the distribution structure.
