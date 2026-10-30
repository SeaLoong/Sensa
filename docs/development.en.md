# Development, verification and releases

[简体中文](development.md) | **English**

Develop against one source commit, run the affected unit checks, then let CI verify the full browser workflows and native packages. Successful main builds publish a preview; the Release workflow applies the same gates to stable publication. Pages verifies its static artifact before deploying it.

## What happens when I commit code?

| Action | Automatic result |
| --- | --- |
| Open or update a Pull Request | Unit tests, full E2E and all platform builds; retain downloadable artifacts without publishing a Release |
| Push to `main` | Publish a pre-release after that commit's checks pass and every artifact is built |
| Change documents or site files on `main` | Build the site, run site-specific E2E and deploy automatically without a manual Pages run |
| Run `release.yml` manually | Resolve latest `main`, check/build/publish a stable Release, then refresh the site and VPM automatically |

Both release channels use one asset matrix: six Node CLI archives, six Electron Desktop archives, CLI installers and single EXEs for both Windows architectures, a Unity ZIP and `SHA256SUMS.txt`: **18 published assets**. Cleanup retains the newest **10 published pre-releases**, preserving stable releases, unpublished drafts and Git tags. VPM contains Unity packages from stable releases only.

| System and format | Architecture | Example filename | Start |
| --- | --- | --- | --- |
| Electron Desktop portable | Windows/Linux/macOS × x64/ARM64 | `Sensa-<version>-<platform>-<architecture>-Desktop.zip`/`.tar.gz` | Extract the complete archive and open `Sensa.exe`, `./Sensa` or `Sensa.app`. Windows/macOS use ZIP; Linux uses tar.gz. The workbench opens in its embedded window |
| Windows CLI installer | x64/ARM64 | `Sensa-<version>-win-<architecture>-Setup.exe` | Installs for the current user under `%LOCALAPPDATA%\Programs\Sensa`, opens the browser from the Start menu and includes offline guides, Shader and serial/BLE bridge tools; no administrator access needed |
| Windows CLI single file | x64/ARM64 | `Sensa-<version>-win-<architecture>-SingleFile.exe` | Run one EXE directly with its built-in Web UI and interactive explorer; no adjacent application files required. Get Python bridge tools and full Markdown guides from the installer or portable archive |
| Windows/Linux/macOS CLI portable | x64/ARM64 | `Sensa-<version>-<platform>-<architecture>.zip`/`.tar.gz` | Folder-based portable distribution with offline guides and tools; extract the complete archive before running. Windows uses ZIP; other systems use tar.gz |

[Downloads](https://github.com/SeaLoong/Sensa/releases/latest) links directly to GitHub's latest stable release entry. When no stable release exists, GitHub redirects this address to release history. Development previews and older builds are listed separately in [release history](https://github.com/SeaLoong/Sensa/releases). Download desktop packages, the Unity ZIP and `SHA256SUMS.txt` checksums from the chosen release's assets.

Native SEA distributions use exactly **Node 24.22.2**, tied to the verified official license hash; bundle-only and source development accept the 24.22.2+ range in `engines`. Portable directories include `THIRD-PARTY-NOTICES.txt`; the CLI serves the same content at `/THIRD-PARTY-NOTICES.txt`, including single-file builds. esbuild LEGAL files cover their bundled-code notices rather than the complete dependency license inventory.

Current application builds include their Node runtime and web assets. Electron includes that same CLI service; Windows installers and single EXEs remain CLI formats. Serial/MIDI native dependencies are embedded in the SEA and verified before extraction to a private temporary directory. CLI configuration defaults beside its executable; Electron uses `Sensa/config.json` under user application data. `SENSA_CONFIG_PATH` or `--config` selects a shared profile. Recording outputs default to `recordings` beside that profile, overridden by `SENSA_RECORDINGS_PATH`; workbench exports are browser downloads. Updates and uninstall retain user data. Keep a single EXE in a writable directory. Downloads have no publisher code signature.

Automatic pre-release filenames append `-preview.<run number>.<attempt>.<first eight commit characters>` after the version; stable filenames do not. Release notes lead with x64/ARM64 Electron Desktop links for each system, then list CLI formats and checksums. Preview notes follow with a **Source** link to the full build commit and omit the changelog.

## How do I publish a stable release?

1. Open [Actions → Release](https://github.com/SeaLoong/Sensa/actions/workflows/release.yml).
2. Click **Run workflow** and use `main`.
3. Leave `version` empty for automatic selection, or enter a version such as `0.5.0`.
4. Run the workflow, wait for checks/build/publication to finish, then use its release link for that version; [Downloads](https://github.com/SeaLoong/Sensa/releases/latest) opens the latest stable release directly.

The workflow creates the tag and builds every platform automatically. It resolves latest `main` to one full commit at its start. All checks, platform artifacts, the Unity package and Release use that commit. Changes arriving during execution belong to the next release.

Automatic selection considers the repository version and existing stable tags. A repository version above every stable tag is used as written; otherwise the highest stable patch version increases by one. For example, after `v0.4.0`, the next automatic release is `v0.4.1`. An explicit version must exceed existing stable versions. Version changes apply inside the build workspace; repository version files retain their original values.

## What does each workflow do?

| File | Actions name | Responsibility |
| --- | --- | --- |
| `ci.yml` | CI | Automatic PR/main checks and builds; automatic main pre-releases |
| `checks.yml` | Checks | Shared Web/Node/Python units, four strict TypeScript projects, Unity metadata and E2E checks |
| `codeql.yml` | CodeQL Advanced | Four-language analysis, traced C# builds, measured quality and complete source coverage |
| `e2e.yml` | E2E | Browser behavior and normal screenshot comparison; manual baseline candidates |
| `update-e2e.yml` | Update E2E | Manual test/candidate maintenance through a review PR; no AI key in default mode |
| `build.yml` | Build | Six-platform CLI and Electron archives, Windows CLI installers/single EXEs, isolated native smoke and Unity packaging |
| `release.yml` | Release | Manually started stable publication from latest `main` |
| `pages.yml` | Pages | Automatic site build, site E2E, page deployment and VPM |

Each run checks its selected commit. Publication uses the check results and artifacts produced by that run.

## Which secrets do workflows use?

The repository Actions secret `SENSA_PAT` publishes Releases, pushes E2E candidate branches and creates review PRs. Creating the PR automatically triggers normal CI.

Default `screenshots` mode runs the full E2E suite and generates application baseline candidates plus eight site review captures. Optional `agent` mode additionally uses `OPENAI_API_KEY` to maintain test cases. [Image review workflow](e2e.en.md#how-do-i-update-e2e-manually)

## How are release notes generated?

Automatic pre-releases start with Electron Desktop links for that build, followed by exact CLI, Unity and checksum links, then a **Source** link to the full commit. They do not generate a changelog.

Stable release notes also lead with Desktop download links, then combine GitHub changes, direct commit history and bilingual download guidance:

- Changes, Pull Requests and contributors between the previous stable release and the selected commit.
- Version, full commit, check/build run links and download guidance for operating system/processor choices.
- First-start instructions, documentation/explorer links and the `SHA256SUMS.txt` checksum file.
- The actual verification scope.

Use change titles that describe an observable user benefit. Generated notes use recorded commit or PR information.

## Maintaining scanners and workflow dependencies

Dependabot checks root npm dependencies, pip manifests under `scripts` and `tools/protocol-bridge`, and GitHub Actions weekly, retaining React security-update groups. The migrated application removes the old host NuGet entries; real Unity C# references and complete scanning remain. Version updates and security alerts are separate; verify individual alert status after dependency changes. Normal application builds always generate `npm run build:web` assets first.

Browser jobs pin both the Playwright image version tag and the official registry OCI digest. When upgrading, update npm Playwright and all three browser jobs, checking the official manifest SHA-256 against `Docker-Content-Digest`; format tests do not authenticate the digest. All artifact downloads explicitly fail on digest mismatch, preserving the pinned Action's existing default protection.

Read-only checks and builds do not retain checkout Git credentials. Only E2E proposal publication retains its dedicated PAT for authenticated Git operations. Keep candidate test execution outside that publication job. Do not reduce noise by disabling scanners, adding global directory exclusions or weakening audit gates.

The Update E2E agent and candidates jobs execute generated code before review, so both use GitHub's server-enforced `cache-mode: none`. Even possession of the job runtime token cannot grant Actions cache access; clearing environment variables or disabling a cache step does not provide that boundary. The retained `setup-node` cache configuration is skipped by the pinned toolkit according to the server's effective mode. Verify `effective cache-mode 'none'` in the execution logs rather than treating configuration text as runtime evidence. Other trusted checks retain caching, candidate artifact upload, and the separate PAT publication path.

All six native Desktop matrix jobs also use `cache-mode: none`, preventing dependency installation and source builds from reading or writing Actions caches. Verify each job's effective mode in its logs. Unit checks, CodeQL, Pages and other jobs retain their respective cache policies, and artifact uploads remain available. CI pins its event commit, while stable releases select source only from main; manual callers cannot supply an arbitrary `source_ref`.

CodeQL's cache-poisoning model may classify expressions named `ref` or `commit` as untrusted checkouts or may not yet recognize server-enforced cache restrictions. Check the actual call chain, reference provenance, and effective cache access, then record false-positive or mitigated reasons only for the confirmed individual alerts. Do not add query or directory exclusions.

### C# analysis quality and advanced setup

The advanced workflow preserves Actions, C#, JavaScript/TypeScript and Python and their existing `/language:<language>` categories. It uses the same default query suite and remote threat model as the original default setup, without additional query filters. Manual C# extraction uses the pinned SDK and real Unity/VRChat references to compile the retained Unity package and both lab tools. JavaScript/TypeScript analysis covers the Node host. External references are built before CodeQL initialization; repository sources are rebuilt afterward.

`scripts/codeql-unity.py` prepares real compiler references using the official sources, versions, archive hashes and individual file hashes in `.github/codeql/unity-sources.json`. It extracts only locked SDK references, never launches the Unity Editor and uses no stub types. Static compilation does not establish Unity test, PlayMode, client or hardware acceptance. New source files or assembly definitions must enter the real compilation plan; directory exclusions must not reduce coverage.

`scripts/verify-codeql-csharp.py` reads measured values from the already executed `Telemetry/ExtractorInformation.bqrs`. Calls with call targets and expressions with known types must each meet the original **85%** threshold, and the none-mode metric must be zero. It also checks every Git-tracked C# file against the current commit's contents in the CodeQL source archive. Build success, a file list or a green analysis cannot replace these checks. Actions artifacts retain `csharp-quality.json`.

Initial deployment retains default setup. Analysis itself always uses `upload: never`; the separate official upload step publishes verified results only after all preceding steps succeed and the non-secret repository variable `SENSA_CODEQL_ADVANCED` is `true`. This allows validation before switching and avoids rejected duplicate uploads while default setup is enabled.

Administrator activation:

The repository already contains a validated `codeql.yml`; no new workflow file is needed. GitHub's **Switch to advanced** first disables default setup, then opens the new-file editor. Exit that editor without committing another file. Keep the existing workflow; do not delete, rename or replace it with the generated template.

1. Confirm the same `main` commit's four **CodeQL Advanced** jobs succeed, including measured C# quality and complete source coverage.
2. Under **Settings → Secrets and variables → Actions → Variables**, set repository variable `SENSA_CODEQL_ADVANCED` to `true`. It is not a secret; changing the variable does not trigger a workflow.
3. Under repository **Settings → Code security → CodeQL analysis → …**, check default setup. If **Switch to advanced** is still offered, use **Disable CodeQL** in that menu to disable default setup and allow uploads from the existing workflow, as documented by GitHub. If the wizard already disabled it, proceed without disabling it again. Keep the existing Actions workflow enabled.
4. Manually run **CodeQL Advanced** on `main`. Confirm all four **Upload verified CodeQL results** steps succeed and finish processing, then review the new configuration and individual alerts. A successful job with a skipped upload has not published results; check that the variable is `true`. A default-setup-enabled upload error means default setup is still enabled. Without configuration-administration access, an administrator must perform the settings operations in the website.

Official guidance: [Disable default setup to unblock SARIF upload](https://docs.github.com/en/code-security/reference/code-scanning/sarif-files/troubleshoot-sarif-uploads/default-setup-enabled#disabling-default-setup-to-unblock-sarif-upload).

Node Intiface output uses a shared connection pool and Buttplug wire v4 codecs; browser output uses wire v3, and virtual-device inputs provide v2/v3/v4. Node transport assembles complete WebSocket messages, limits each to 1 MiB and checks UTF-8/JSON with maximum depth 64. Invalid messages or failed initialization close that connection and clear pending requests. Isolated contracts cover fragmentation, multibyte names, feature mappings, leases and failure cleanup.

React 19 production builds and component SSR tests use the automatic JSX transform. Test loaders share both `react` and `react/*` runtimes to avoid bundling a second JSX/Hooks instance.

## Where should I look after a failure?

Open the Actions run, then inspect failing steps and the Job summary. E2E `summary.json`/`summary.md` separately record passed, failed, skipped, unrun, interrupted and flaky cases. The full suite continues after individual failures; cases not reached before a workflow timeout or interruption are recorded as unrun. See the [verification record](e2e-status.en.md) for recorded outcomes. After screenshot failures, inspect expected/actual/diff, review intentional changes, update the baselines and run a full normal comparison.

Application E2E, candidate capture and Pages site checks use the same Playwright container version, which provides the browser and its system dependencies. A shared installer adds Chinese fonts and the mock runtime while preserving fontconfig rules. The full application browser job has a 35-minute budget for both viewports, both languages and multi-tab connection cases.

Dependency installation uses official Ubuntu sources and makes up to two attempts, each limited to 130 seconds with five more seconds to terminate processes. APT uses a 15-second network timeout and one retry per download; the step budget is five minutes. The second attempt completes pending package configuration with `dpkg --configure --pending` and uses a temporary source file to switch the Azure Ubuntu mirror to official `https://archive.ubuntu.com/ubuntu`. The original source file, suites, components and signature settings stay intact. Fonts use the version and SHA-256 selected by the first successful index update. Recovery, index verification and installation share the same budget; verification continues after installation succeeds.

Native builds smoke all six CLI and Electron portable programs with isolated configuration, checking embedded CLI commit/byte identity, actual service URLs, renderer isolation, native dependency loading and shutdown cleanup. Windows also runs Shader bridge mock replay. Standalone Windows programs repeat smoke from a publish directory containing only one EXE, checking APIs, the Web UI and the local explorer. Installer checks silently install into a temporary directory, verify the installed binary and offline tools, run isolated application smoke, then uninstall and check that user configuration and recordings survive. Installation, startup and uninstall run only on native Windows Actions runners without real hardware.

Windows x64/ARM64 builds also install the pinned BLE input/output dependencies and verify actual WinRT/Bleak APIs and a native buffer byte round-trip, without enumerating adapters, creating GATT services or starting advertising. Each platform uploads `protocol-bridge-dependencies.json` with its native test artifacts. This dependency check does not establish real Bluetooth hardware acceptance.

Installers use pinned Inno Setup 6.7.3. The bootstrap downloads its compiler installer from the official GitHub Release, checks the repository-pinned SHA-256 and a valid Authenticode signature from official publisher `Pyrsys B.V.`, then executes it. This verifies the build tool's source; it does not imply that Sensa downloads are code-signed.

Packaging and publication accept ordinary files with portable archive paths. Publication requires six CLI archives, six Desktop archives, four additional Windows CLI downloads and the Unity package, verifying platform checksums before creating a draft. The final shared `SHA256SUMS.txt` brings the release to 18 assets. After upload, it verifies names, sizes and SHA-256 hashes, then rechecks the actual Git tag target immediately before publication. Failed uploads retain a draft for investigation. Rerunning a published preview verifies its existing assets and completes any remaining cleanup. To publish newer code, start the stable workflow again so it resolves latest `main` and selects a new version.

If **Update E2E** pushes its candidate branch but PR creation fails, use **Re-run failed jobs** after resolving the reported error. The publisher reuses the successful candidate attempt's branch after checking its parent commit and full file tree, and returns an existing draft PR when its repository, source SHA and review state match. A changed branch or closed review requires inspection. A full candidate rerun creates a new attempt for separate review. Test patches execute in a separate job; the publishing job reapplies checked files without running candidate code. Candidate images and assertion changes still receive review and a full normal comparison.

## Documentation site and VPM

The [documentation site](https://sealoong.github.io/Sensa/) builds automatically after document/site changes on `main`, then deploys after site E2E succeeds. A successful stable release refreshes VPM automatically. Deployment uses the same checked static artifact; stable-package refreshes use current `main` documentation.

Pages has three jobs:

1. **Build** pins latest `main` on a native runner, collects stable VPM packages with the GitHub CLI, builds the documentation and uploads that build's Pages archive.
2. **Verify** checks out the same commit in the fixed Playwright container, downloads the archive by artifact ID, validates its integrity, extraction paths and site-manifest commit, then runs site E2E against those files.
3. **Deploy** waits for build and verification to pass, then deploys the same checked archive.

The three job budgets are 10, 15 and 10 minutes respectively. Archive names include the run ID and build attempt so reruns can identify the same artifact. Pages archives and verification reports are retained for 14 days.

The full candidate run's `site.spec.js` produces the site review captures. The exporter collects fixed attachment names for the homepage and first-run guide in both languages and viewports, verifies their provenance, build manifest and SHA-256 hashes, then writes the eight fixed `__review__/site` paths. The PR provides commit-specific image links for individual inspection on GitHub. These captures support manual review; normal baseline comparison and site behavior checks continue to run.

VPM preserves verified stable packages and historical downloads. Network or hash failures stop deployment; an unavailable state is shown when no stable package exists.

### Documentation diagrams

Describe flowcharts with `flowchart`/`graph` inside a `mermaid` fence. Pages containing diagrams load a pinned Mermaid runtime distributed locally with the site, without a CDN dependency; ordinary fenced examples remain code. Diagrams use strict mode and plain-text labels, without per-diagram initialization, HTML labels or clickable links.

Graphical rendering needs JavaScript. Every diagram retains its complete source in an expandable fallback. Source remains readable when JavaScript is disabled, local scripts fail to load or an individual diagram fails to parse; other diagrams are handled independently. Narrow screens scroll horizontally and keyboard users can focus the diagram region, preserving readable text instead of shrinking it excessively. Rendering/content changes need Actions checks of actual visible SVG, bilingual navigation and narrow access; the presence of `mermaid` text in HTML alone does not prove rendering.

The sidebar includes Protocol inputs and Serial and Bluetooth bridges. The tools' three README files publish as two localized routes without duplicating the English alias. Protocol and complete bridge-installation guides link to one another within the documentation site.

## Local development and checks

Application development uses Node.js 24.22.2+ and Python 3.12+; Actions pins Node 24/Python 3.14. Plan affected checks before running them and reuse successful records for unchanged source/toolchains. Only the real Unity reference compilation for C# CodeQL requires the .NET SDK `10.0.403` pinned by [global.json](https://github.com/SeaLoong/Sensa/blob/main/global.json), with `rollForward: disable`. The Node application and unit tests require no .NET runtime or SDK.

```shell
npm ci
python -X utf8 scripts/verify.py --plan
python -X utf8 scripts/verify.py
```

Browser E2E, screenshots and full-process smoke run in Actions. Isolated units and static checks may run locally. Device-related checks use temporary configuration and mock transports. Real hardware, Unity/VRChat and actual World interactions receive separate acceptance checks.

### TypeScript and runtime compatibility

Use **Node 24.22.2 or later** and the pinned **TypeScript 7.0.2** compiler. `src/core/runtime` implements the shared `RuntimeEngine` and `ApplicationFacade`; `src/core/outputs` coordinates outputs. The Node CLI, Electron and browser-local host use the same application behavior. Unity authoring/build code remains C#.

Typed sources use **Oxlint 1.90.0** and the TypeScript compiler; legacy JavaScript retains ESLint. The checked typescript-eslint 8.72.1 peer range excludes TypeScript 7, so this setup keeps the stable compiler instead of forcing incompatible peer dependencies. Only `jsx-a11y/prefer-tag-over-role` is disabled for `src/websensa/WebSensa.tsx`: its suggestions would replace legitimate inline SVG `role="img"`, status live regions and control groups with semantically different elements. Other configured lint checks remain active, and browser axe/interaction checks exercise the rendered pages.

`npm run typecheck` runs four strict projects without emitting files: `tsconfig.json` (shared/browser), `tsconfig.node.json` (Node host and domain/component tests), `tsconfig.electron.json` (Electron shell) and `tsconfig.e2e-types.json` (real Node/Playwright test contracts). The Node project excludes DOM globals; browser and Electron projects keep their required declarations. Strict checking includes `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, unknown catch values, isolated modules and erasable-only syntax. Network payloads and native events enter typed boundaries through `unknown` and runtime validation. Existing desktop-UI JavaScript remains in the legacy lint lane; new shared-core/browser-adapter work belongs in the strict TypeScript lane.

```sh
npm ci
npm run typecheck
npm test
npm run test:node
npm run build:web
```

`npm test` runs lint, all four type projects and Web units. `npm run test:node` recursively runs the complete Node/domain inventory and writes `artifacts/test-results/backend/node.xml` JUnit plus `node-source.json`, recording the commit, Node version and every test file hash. Shared Checks uploads these as `tests-backend`.

The core's erasable TypeScript can be imported by Node 24; esbuild bundles React TSX and browser adapters. Browser syntax targets remain **Chrome 110, Firefox 115 and Safari 16**; TypeScript uses an ES2023 standard-library baseline, with newer runtime APIs introduced through tested compatibility adapters. Device support uses callable API detection, not browser-version or user-agent guesses: Web Serial, Bluetooth and MIDI also require a secure context and the user's selected-device permission. Their absence keeps those choices unavailable; a usable WebSocket/HTTP endpoint or the desktop bridge provides another route.

`src/websensa/capabilities.ts` reports actual browser APIs and registered factories without opening connections or prompting for permission. Node reports its network, native serial/MIDI and bridge adapters through its capability inventory. Electron uses that same Node service; its renderer calls the HTTP/WebSocket application and never loads native device modules. The explorer retains SVG when 3D rendering is unavailable; desktop tabs retain their SharedWorker → Web Locks/BroadcastChannel → per-tab connection fallback.

CI exercises the same built WebSensa files in the ordinary Chromium suite and a separate Firefox/WebKit compatibility job, with desktop and narrow viewports. The compatibility job checks real mock-endpoint delivery, capability fallback, keyboard use, axe and reflow, and gates publication. Execution results are recorded with their source commit.

Choose maintained stable dependencies, pin the selected versions and preserve the lockfile. Check the current upstream release and platform requirements when upgrading. Syntax targets, API availability and protocol behavior each have their own tests. [Adapter catalog and community package roadmap](adapter-catalog.en.md)

### WebSensa and desktop instances

`npm run build:web` builds the desktop UI, WebSensa and the bundled parameter-explorer resources. `scripts/build-websensa.mjs` builds the standalone React entry point and its CSS/license notices once for use by Pages and desktop publication. The static route is `websensa/`; desktop HTTP serves `/websensa/`, and portable files live under `web/websensa/`.

Start the development CLI with `npm start` or its embedded window with `npm run desktop`. `npm run build:desktop` prepares the development shell; platform builds generate native distributions. Development CLI configuration defaults to `config.json` in the working directory, while Electron uses `Sensa/config.json` under user application data. Both accept `SENSA_CONFIG_PATH`/`--config` for the same existing profile, read PascalCase properties and save canonical camelCase.

WebSensa units inject clocks, WebSocket peers and browser device APIs. Actions opens the built page for complete control/script, shared-connection and mock-GATT flows. The explorer's handoff is an explicit browser connection and uses the same normalized axis values.

Instance tests verify configuration ownership, stale-owner recovery, browser page presence and actual bind-based port fallback. Actions starts separate processes for repeated-launch and named-instance workflows. For manual development, `--config`, `--instance` and `--new-instance` select the desired setup; `--open-browser false` keeps the run headless. [User launch options](quick-start.en.md#run-several-instances)

### Optional serial and BLE bridges

CLI portable archives, Windows CLI installers and the CLI directory embedded in Electron include Python sources, bilingual instructions and dependency pins from `tools/protocol-bridge` through an explicit `scripts/release.py` allowlist. The installer reuses those files, with Actions checking their installed contents. Dependabot also maintains this directory's optional dependencies weekly, grouping BLE backends and native WinRT projections separately while preserving platform markers and security update checks. It does not install Python, virtual serial drivers or Python dependencies. The standalone EXE does not embed an interpreter. Obtain the tools from a portable archive, installer or Electron package and install the requirements in your own Python virtual environment. `SENSA_BRIDGE_PYTHON` and `SENSA_BRIDGE_SCRIPT` select the interpreter/script through the trusted host launch environment; they are not device configuration editable through the WebUI.

```shell
python tools/protocol-bridge/bridge.py --check
python -m pip install -r tools/protocol-bridge/requirements-serial.txt
python -m pip install -r tools/protocol-bridge/requirements-ble-output.txt
python -X utf8 -m unittest discover -s tests/scripts -p 'test_protocol_bridge*.py'
```

Linux/macOS BLE input uses Bless; Windows input uses native PyWinRT. Outputs use Bleak. The tool guide lists platform permissions, advertised-name setup and profiles for LOOB, Thrust Sync, Svakom V1, Lovense single-vibration and Youou VX001. Isolated PTY/mock-GATT/WinRT checks verify software behavior; hardware runs belong to the selected OS/adapter. [Installation and operation](../tools/protocol-bridge/README.md)

After changing Three.js source or dependencies, run `npm run build:web` and commit reproducible `docs/assets/parameter-geometry-3d.js` plus its complete `3d.LICENSE.txt`. After ordinary Markdown edits, build the site directly with `npm run build:pages`; artifacts are written to `artifacts/pages/`.

Measure large-catalog pure ranking independently:

```shell
node scripts/benchmark-osc-preview.mjs --output artifacts/performance/osc-ranking.json
```

This measures pure ranking time. E2E checks browser live updates, paging, frozen samples and path suggestions.

## Verify outputs and shared sessions

Protocol and transport changes use isolated codecs, mock transports and clocks to check value types, ranges, cancellation, stopping and reconnection. Natural script completion retains the final value and input activation; explicit pause/stop, input disable and emergency stop exercise their respective stop paths, while other Combined sources continue. DG-LAB tests inspect pairing, device reports and RPC/task lifetime. Temporal computations check initial samples, changed provenance, invalidity and backward time. Recording checks bounded storage, escaping and sample timestamps.

Shared-session tests distinguish same-page reference counting, SharedWorker sharing, Web Locks ownership handoff, BroadcastChannel request correlation and the per-tab fallback. Actions browser cases open several pages and check partial closure, ownership handoff and reopening after all pages close. Isolated lifecycle unit tests check page-cache suspension and restoration. HTTP connection pools and server WebSocket budgets are observed separately. New output forms receive normal screenshot comparison and individual baseline inspection. [Architecture decision](adr/0008-signal-pipeline-and-shared-session.md) · [User guide](signal-pipeline.en.md)

[Architecture](architecture.en.md) · [Current CI decision](adr/0005-simplified-ci-and-releases.md) · [Browser verification](e2e.en.md)
