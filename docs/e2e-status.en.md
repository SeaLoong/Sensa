# Verification record

[简体中文](e2e-status.md) | **English**

This page records observed checks for the current changes. The full history remains in a [pinned record](https://github.com/SeaLoong/Sensa/blob/b23451a7e67627c2ea4ac4c8fdb5cc436e8ab640/docs/e2e-status.en.md). See [development and publication](development.en.md) and [E2E maintenance](e2e.en.md) for workflow instructions.

## Current scope

As of 2026-10-25 (Beijing time), this update adds moving reference planes within one Avatar, seven spatial calculations, Unity Tracking Frame, Shader offsets and multiple-tile capture, plus Windows installers and single-file releases. Documentation and diagrams clarify SPS defaults, coordinate units, the current SDK beta and paired poses between Avatars. WebUI, the documentation site and actual application screenshots are updated together.

## Isolated checks

| Scope | Observed result |
| --- | --- |
| .NET units | **770 passed**, including geometry/quantities, sources/age, routing and launch behavior |
| Web units | **225 passed**, including spatial presets, stable-first downloads, cached results and language recovery |
| Python/scripts | **309 passed**, including QR recovery, exact links for every release file, dependency installation and installer cleanup regressions |
| Documentation | **92 routes** built; the build checks links and screenshot provenance |
| Unity static checks (previous environment) | Package metadata, syntax for 57 C# files and isolated API type checks against actual Unity/SDK assemblies passed |
| Windows single-file static publish (previous environment) | The x64 publish directory contains only `Sensa.exe`; embedded resources checked. Runtime/installation checks belong to native CI |

API type checks use some generator-boundary substitutes. Tracking Frame adds 17 parameterized EditMode cases, awaiting execution inside the Editor.

## Browser and site

| Pinned source | Run | Observed result |
| --- | --- | --- |
| `ba0a9cc8` | [Full ordinary comparison 40193128489](https://github.com/SeaLoong/Sensa/actions/runs/40193128489/attempts/1) | **116/116 passed**, all other outcomes zero; exact main commit, complete selection and snapshot comparison with updates disabled |
| `ba0a9cc8` | [Pages 40193128498](https://github.com/SeaLoong/Sensa/actions/runs/40193128498/attempts/1) | **14/14 passed and deployed**, all other outcomes zero; all 146 public resources match the build, including the 38 refreshed documentation images |
| `d3bcf170` | [Pages 40035927862](https://github.com/SeaLoong/Sensa/actions/runs/40035927862/attempts/1) | **14/14 passed and deployed**, all other outcomes zero; build and verification manifests match, all 146 public resources match their bytes and hashes |
| `b0c08cb0` (main `d3bcf17` + PR #26 merge snapshot) | [Full ordinary comparison 40037674549](https://github.com/SeaLoong/Sensa/actions/runs/40037674549/attempts/1) | **116/116 passed**, all other outcomes zero; snapshot updates disabled |
| `5d60f782` | [Full candidate 40035585736](https://github.com/SeaLoong/Sensa/actions/runs/40035585736/attempts/1) | **116/116 passed**, all other outcomes zero; 164 application PNGs and eight site originals exported to [PR #26](https://github.com/SeaLoong/Sensa/pull/26) |
| `5d60f782` | [Pages 40035211768](https://github.com/SeaLoong/Sensa/actions/runs/40035211768/attempts/1) | **14/14 passed and deployed**; site images and public documentation resources verified |
| `15adf70d` | [Full candidate 40033013628](https://github.com/SeaLoong/Sensa/actions/runs/40033013628/attempts/1) | **114 passed, two failed**, all other outcomes zero; desktop and mobile encountered the offline-language issue below. Candidate not accepted |
| `15adf70d` | [Pages 40032994999](https://github.com/SeaLoong/Sensa/actions/runs/40032994999/attempts/1) | **14/14 passed and deployed**; eight site images reuse reviewed originals with identical digests, and all 38 public documentation images match the catalog |
| `e62d8f23` (PR #25 merge snapshot) | [Full normal comparison 40031563312](https://github.com/SeaLoong/Sensa/actions/runs/40031563312/attempts/1) | **115 passed, one failed**, all other outcomes zero; the mobile offline guide lost its language after reload. Native builds/publication skipped |
| `71f63460` | [Pages 40032441894](https://github.com/SeaLoong/Sensa/actions/runs/40032441894/attempts/1) | **14/14 passed and deployed**; all 38 public documentation originals match their catalog digests |
| `b23451a7` | [Pages 40028882502](https://github.com/SeaLoong/Sensa/actions/runs/40028882502/attempts/1) | **14/14 passed and deployed**, all other outcomes zero |
| `b23451a7` | [CI before baseline update 40028882526](https://github.com/SeaLoong/Sensa/actions/runs/40028882526/attempts/1) | **1 passed, 3 failed, 112 not run**; two previous editor images differ and a new spatial image has no baseline. Build/publication skipped |
| `b23451a7` | [Full candidate 40028896056](https://github.com/SeaLoong/Sensa/actions/runs/40028896056/attempts/1) | **116/116 passed**, all other outcomes zero; 164 application images and eight site originals exported to [PR #25](https://github.com/SeaLoong/Sensa/pull/25) |

The accepted candidate pins `5d60f782313c9d6291bf9a32fa68394b63a1136e`; its image commit is `a53b8e18cf1a3da710f368b3ae5a32c6cd71204d`. The patch, export manifest and all 172 PNG SHA-256 values match. All originals were reopened individually in the recovered environment; missing historical review receipts were not reused. SPS root-local units, Contact metres and the illustrated scale are explicit in the corrected diagrams. [Per-image review evidence](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/baseline-review.json) records the observations and hashes.

The full ordinary comparison tested `b0c08cb02e1352b9ad0cfcc7e279e71cad6f7fdc`, the merge of main `d3bcf1701ee114271cafa285cb382532e851ccaf` and that candidate. It reports `suite=all`, `mode=comparison`, `runner=passed`, `selectionComplete=true`, `snapshotsCompared=true`, with a successful command and all **116 cases passed**. The candidate reports the same complete selection in `mode=candidate`, with `snapshotsCompared=false`. The accepted 164 application baselines and eight site originals therefore have both individual review and a full comparison against the current application code. The subsequent main run `40193128489` also passed the full **116/116** ordinary comparison at `ba0a9cc8b543db003372509457f399e50169ae83`, with the same successful command and complete-selection/comparison flags; its six native jobs then started. Later source changes require checks of their own commit.

Current Pages run `40193128498`, pinned to main `ba0a9cc8`, verified the same manifest as the build: **92 routes and 145 assets**. All **146 public resources**, including the manifest, returned HTTP 200 with matching content and SHA-256. Pages uses `suite=site`, `mode=comparison`, `runner=passed`, `selectionComplete=false`, `snapshotsCompared=true`, with successful commands. All 38 documentation images now have refreshed provenance and individually verified hashes from source `5d60f782`, run `40035585736`, attempt 1: two images changed bytes and 36 remain identical. The 146-resource public check above belongs to the deployed `ba0a9cc8` build and verifies all 38 refreshed documentation images. The earlier `d3bcf17` deployment remains a separate historical result.

[Image review and provenance](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__screenshots__/README.md) · [Application screenshots](screenshots.en.md)

## Issues found and resolved

The website, documentation and release notes now distinguish general downloads from file links: general entries open the newest stable release, or the newest preview when no stable exists. Format links download actual assets from that same release without substituting older files. Failed queries retain a recovery route and clearly identify cached versions. Site E2E assertions cover this behavior; the browser runs recorded here precede this download change, so subsequent browser/deployment results must be checked against the corresponding commit's Actions run.

PR #25's normal comparison recorded `zh-CN` in session storage after switching the offline guide to Chinese, then `null` after reload, returning the page to English. File pages now also keep manual language choices in the current history entry. Reload uses session storage first, then restores and refills a missing choice from history; HTTP pages continue to use session storage. Three new unit tests passed. E2E retains its assertions and adds deliberate file-session removal, reload recovery and denied-storage checks. These now pass in the full candidate and ordinary comparison above.

Spatial input checks now admit the physical quantities supported by position and direction slots, fixing acceleration and angular velocity being mistaken for positions. Twelve new regressions cover actual derivative chains, unknown quantities, valid instance names and velocity directions; the full backend passed **770/770**. Release notes now link directly to that build's installers while previews continue to omit the changelog; the full Python suite passed **306/306**.

[Candidate 40032454295](https://github.com/SeaLoong/Sensa/actions/runs/40032454295), on `71f6346`, recorded **757 passed and one failed** in backend units; browsers were skipped. A test started two concurrent receives on one `UdpClient`, racing its shared buffer. It now receives sequentially while retaining the one-second deadline, address-independent assertions and virtual-clock cleanup. The corrected full backend suite passed **758/758**, and the case passed **10/10** repeated runs of the same build.

- Source `0c1ad2c` passed Web checks in [CI 40025345270](https://github.com/SeaLoong/Sensa/actions/runs/40025345270) and [candidate 40025349090](https://github.com/SeaLoong/Sensa/actions/runs/40025349090), then locked restore failed with `NU1004` after automatically choosing SDK 10.0.402. Backend tests and browsers did not run. SDK 10.0.401 is now pinned, and subsequent unit checks passed.
- [Pages 40025344984](https://github.com/SeaLoong/Sensa/actions/runs/40025344984), on that source, recorded **12 passed and 2 failed**: repeat navigation to the same installer page did not reload. Explicit reload fixed it; [Pages 40026115999](https://github.com/SeaLoong/Sensa/actions/runs/40026115999) passed **14/14 and deployed**, with eight originals individually reviewed. Its [CI 40026116151](https://github.com/SeaLoong/Sensa/actions/runs/40026116151) still encountered previous baseline differences: **1 passed, 3 failed, 112 not run**.
- Attempts 1 and 2 of [candidate 40026140751](https://github.com/SeaLoong/Sensa/actions/runs/40026140751) timed out downloading fonts from the Azure Ubuntu mirror. Browsers did not start; all outcomes were zero, `runner=not-run`, command skipped, selection/comparison flags false. The installer now uses the official HTTPS mirror on retry while checking the same font version and SHA-256. [CI 40028882526](https://github.com/SeaLoong/Sensa/actions/runs/40028882526) recovered from its first timeout in practice: the 61.2 MB font downloaded in 4 seconds and browser checks continued.
- Source `8d92eff` passed CI unit checks; its CI, Pages and candidate were intentionally cancelled to continue on the installer-test correction.

## Native builds and publication

Main CI [40193128489](https://github.com/SeaLoong/Sensa/actions/runs/40193128489/attempts/1), pinned to `ba0a9cc8`, passed the **116/116** browser comparison above, five native jobs and Unity packaging. Windows x64 passed portable, single-file, installed-app, installation/reinstallation/uninstallation and data-retention checks. ARM64 remained in its packaging step for about 15 minutes before the run was interrupted. The final conclusion is **cancelled**; no ARM64 report was uploaded, and the completed job's log endpoint returned `BlobNotFound`. Its stalled substep remains unknown, so this run does not establish complete native validation or successful publication. Subsequent checks use a fresh runner; missing logs did not justify a speculative application change.

[CI 40037674549](https://github.com/SeaLoong/Sensa/actions/runs/40037674549/attempts/1) continued from the passing full comparison into native builds. **Five of six native platform jobs passed**. Portable, single-file and installed-application smoke reports passed on **both Windows x64 and ARM64**. The x64 installer also completed installation, reinstallation, uninstall and configuration/recording retention checks. ARM64 reached those operations but failed with `PermissionError` while removing `unins000.exe` during temporary-directory cleanup; its final installer proof is absent, despite eventual uninstall success in the log. Cleanup now waits up to 10 seconds for the uninstaller to remove its executable, retaining the original deletion and data-preservation assertions. Two new regressions and the existing integration coverage pass: **13/13 packaging tests**, within the **308/308** Python suite. The correction still needs a new native CI result. The preview job was skipped, so this run does not establish a complete published distribution. Linux/macOS smoke results and Windows synthetic Shader replay passed; replay does not establish GPU capture or real-device behavior.

## Unity and physical-device scope

The recovered environment now contains independent Avatar/World projects restored from official templates. Avatar pins SDK/Base **3.10.6-beta.3**, MA **1.18.7**, NDMF **1.14.8** and VRCFury **1.1434.0**. World pins SDK/Base **3.10.5** and VRCFury **1.1434.0**, without the Avatar SDK; its repository remains local with no remote or pushes. vrc-get **1.9.3** matches the upstream digest. Repeated offline resolution preserved every SHA-256 across **4654 Avatar** and **5250 World** package files, and **185/51** managed lab files were synchronized.

Unity Editor **2022.3.22f1** and Windows Mono support were installed after official file-size and MD5 verification. The Editor's `-version` command succeeds and the dynamic-library check found no missing entries. This Debian 13 host is outside the Editor's documented Ubuntu desktop support matrix. The previous environment's syntax/API checks in the table remain historical evidence, not proof that the restored projects import.

The recovered environment actually attempted the isolated Avatar `TrackingFrameContracts` EditMode check. The licensing client connected, but the Editor **exited 1 after 0.52 seconds**, reporting **“No valid Unity Editor license found”** and `License is not active (com.unity.editor.headless)`. **Zero tests executed; all 17 source cases were not run**, and no NUnit XML was generated. This confirms a current licensing blocker, separately from the previous environment's similar failure. Editor import/compilation, NDMF builds, Tracking Frame EditMode, Shader GPU capture, VRChat/HMD and physical devices remain unverified. Browser images show the running WebUI with isolated simulated connections and measurements; Unity package metadata checks validate the distribution structure.
