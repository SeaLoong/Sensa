# Verification records

[简体中文](e2e-status.md) | **English**

Each result identifies its source, run and attempt. [Current CI](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml) · [Pages](https://github.com/SeaLoong/Sensa/actions/workflows/pages.yml) · [CodeQL](https://github.com/SeaLoong/Sensa/actions/workflows/codeql.yml) · [Development and checks](development.en.md)

## SPS3 Beta compatibility update: c6a1ed14

Source [`c6a1ed14`](https://github.com/SeaLoong/Sensa/commit/c6a1ed14aef7e7024cf2f9c4672e8ae2333bfb8b), [candidate run 41927196979](https://github.com/SeaLoong/Sensa/actions/runs/41927196979/attempts/1), attempt 1:

| Check | Observed result |
| --- | --- |
| Local Web / Node / Python unit tests | **440 / 1607 / 455 passed** |
| Complete browser candidate | **254/254 passed**, one attempt each, retry zero and all other outcomes zero |
| Image review | **25 application images and six site originals accepted**; seven raster-only candidates and two incomplete guide captures retained |
| Documentation gallery | All **38 mirrors** stay byte-identical to their selected baselines and retain their original 4b1 / 41905870856 capture provenance |

The 22 new runtime unit cases and 12 browser cases cover public OGB geometry, source/instance/Self/Others isolation, length learning and expiry stops, plus 1 mm/0 mm Socket-root selection, narrow bilingual layouts, language redraw, recording and script export. [SPS3 usage](sps3.en.md)

The candidate uses `snapshotsCompared=false`. After image selection, [ordinary CI](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml) checks all **254 cases** for the pinned image commit, requiring complete selection, actual comparison, command success and zero other outcomes. Its report separately records six-platform native checks and preview publication. [Per-image evidence](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/baseline-review.json)

This update adds 37 Unity Editor source cases (20 root compatibility and 17 GPU data/configuration cases), which have not run in Unity. With genuine Unity 2022.3.22f1 headers and 14 pinned upstream dependencies, DXC v1.9.2609 compiled both probe entry points, `vert` and `frag`, as SM6 using the `sampler2D=sampler` compatibility macro. This is standalone HLSL static validation; Unity ShaderLab import and GPU/VRChat execution have separate measured results.

## Layout update and image review: 4b1d9816

Source [`4b1d9816`](https://github.com/SeaLoong/Sensa/commit/4b1d98167809214772a17ab02393a35311451c1f), [candidate run 41905870856](https://github.com/SeaLoong/Sensa/actions/runs/41905870856/attempts/1), attempt 1:

| Check | Observed result |
| --- | --- |
| Web / Node / Python | **431 / 1585 / 454 passed** |
| Complete browser candidate | **242/242 passed**, one attempt each, zero failed, skipped, retried or unexecuted cases |
| Pages | [34/34 passed and deployed](https://github.com/SeaLoong/Sensa/actions/runs/41905627911), all 167 assets matched |
| CodeQL | [Four languages processed successfully](https://github.com/SeaLoong/Sensa/actions/runs/41905628046), 35 results and 69 flows semantically unchanged from the preceding source; scanning remains enabled |
| Per-image selection | **116 application images and seven site originals accepted**; existing bytes kept for nine raster-only geometry candidates and one site candidate with a clipped capture edge |
| Documentation gallery | **38 mirrors** match the selected application baseline bytes, with capture provenance for this pinned source and run |

New layout regressions cover bilingual axis navigation, independent drafts, saved modes and limits, stable dialog frames, body scrolling, address/short-port alignment, long-form save/cancel and keyboard focus. The complete suite also checks 390 and 320 CSS px widths.

This execution used candidate mode with `snapshotsCompared=false`. After image selection, ordinary CI runs **all 242 comparisons** for the selected-image commit with updates disabled, `selectionComplete=true`, `snapshotsCompared=true`, command success and zero other outcomes. That exact commit's complete comparison, six-platform native checks and preview results appear in its [CI](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml) report; the updated gallery's deployment appears in its [Pages](https://github.com/SeaLoong/Sensa/actions/workflows/pages.yml) run.

## Image evidence for that layout update

[Per-image records](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/baseline-review.json) cover the selected and candidate hashes, specific observations, selection reasons and history for 164 application baselines and eight site originals. Of the newly selected images, 104 reuse opened originals from source 956 by complete SHA256 equality, preserving their real [cancelled observation run](https://github.com/SeaLoong/Sensa/actions/runs/41899721755/attempts/1) and observation provenance. Current successful capture/execution is recorded separately. The other newly selected originals were opened directly. Site originals retain the gallery present at capture time; later deployment checks cover the updated documentation images. [Image review notes](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/__screenshots__/README.md) · [Review procedure](e2e.en.md)

## Accepted snapshot before this layout update: 665753a6

Source [`665753a6`](https://github.com/SeaLoong/Sensa/commit/665753a6403d534de9a227844e8eb0d99ebbe6a2), [CI #257](https://github.com/SeaLoong/Sensa/actions/runs/41884479633), attempt 1, all 12 jobs successful:

| Check | Observed result |
| --- | --- |
| Web / Node / Python | **427 / 1585 / 454 passed** |
| Complete ordinary browser comparison | **226/226 passed**, one attempt each, zero other outcomes |
| Independent Firefox / WebKit compatibility | **8/8 passed** |
| Pages | [34/34 passed and deployed](https://github.com/SeaLoong/Sensa/actions/runs/41884479336) |
| Native packages | Windows, Linux and macOS x64 / ARM64 builds and isolated CLI / Electron checks passed |
| Publication | [Development preview #257](https://github.com/SeaLoong/Sensa/releases/tag/preview-257-1-665753a6), 18 public assets |

## Verification scope

Automated coverage includes loopback HTTP / WebSocket, isolated PTY, simulated serial / BLE / WinRT, protocol negotiation and task lifecycles, stop ordering, scripts / recording, computed mappings, shared tabs, bilingual layouts, downloads and offline resources. Native checks run actual packaged programs with temporary configuration and simulated transports.

Physical devices, vendor clouds, Unity clients and VRChat / HMD operation have separate acceptance. The recorded Unity Editor 2022.3.22f1 attempt stopped at license validation and executed zero tests; 17 Tracking Frame source cases did not run and produced no NUnit XML.

GitHub alert dispositions and scan execution are checked separately; inaccessible panel state remains unknown. [Historical migration candidate](https://github.com/SeaLoong/Sensa/actions/runs/40996282389/attempts/1) · [Earlier complete comparison](https://github.com/SeaLoong/Sensa/actions/runs/40783839713)
