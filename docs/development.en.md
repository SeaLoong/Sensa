# Development, verification and releases

[简体中文](development.md) | **English**

CI runs unit tests and a full browser E2E comparison before building, packaging and publishing. Automatic pre-releases and manually started stable releases have the same check requirements. Any failed required step stops publication.

## What happens when I commit code?

| Action | Automatic result |
| --- | --- |
| Open or update a Pull Request | Unit tests, full E2E and all platform builds; retain downloadable artifacts without publishing a Release |
| Push to `main` | Publish a pre-release after that commit's checks pass and every artifact is built |
| Change documents or site files on `main` | Build the site, run site-specific E2E and deploy automatically without a manual Pages run |
| Run `release.yml` manually | Resolve latest `main`, check/build/publish a stable Release, then refresh the site and VPM automatically |

Both release channels include Windows installers, Windows standalone executables, six portable desktop archives and a Unity ZIP. Cleanup retains the newest **10 published pre-releases**, preserving stable releases, unpublished drafts and Git tags. VPM contains Unity packages from stable releases only.

| Download format | Platforms | Use |
| --- | --- | --- |
| `Sensa-<version>-win-<architecture>-Setup.exe` | Windows x64/ARM64 | Recommended. Installs for the current user under `%LOCALAPPDATA%\Programs\Sensa`, opens the browser from the Start menu and includes offline guides and Shader bridge tools; no administrator access needed |
| `Sensa-<version>-win-<architecture>-SingleFile.exe` | Windows x64/ARM64 | Run one EXE directly with its built-in Web UI and interactive explorer; no adjacent application files required. Get the Python Shader bridge and full Markdown guides from the installer or portable archive |
| `Sensa-<version>-<platform>-<architecture>.zip`/`.tar.gz` | Windows/Linux/macOS, each for x64/ARM64 | Folder-based portable distribution with offline guides and tools; extract the complete archive before running. Windows uses ZIP; other systems use tar.gz |

All desktop formats are self-contained and require no separately installed .NET runtime. For standalone Windows EXEs, .NET extracts native libraries to its cache while the application reads Web content from its assembly. Configuration `config.json` and recording-output `recordings` default to the executable directory, with environment-variable overrides available. Workbench funscript exports use `Sensa/recordings` under your Documents folder. Installer updates and uninstall retain user-created data. Keep standalone EXEs in a writable folder. The installer and application are not code-signed; Windows may show a publisher or reputation prompt.

Automatic pre-release filenames append `-preview.<run number>.<attempt>.<first eight commit characters>` after the version; stable filenames do not. Preview bodies still contain exactly one **Source** line linking to the build commit. Download pages prioritize Windows installers.

## How do I publish a stable release?

1. Open [Actions → Release](https://github.com/SeaLoong/Sensa/actions/workflows/release.yml).
2. Click **Run workflow** and use `main`.
3. Leave `version` empty for automatic selection, or enter a version such as `0.5.0`.
4. Run the workflow, wait for checks/build/publication to finish, and download from [Releases](https://github.com/SeaLoong/Sensa/releases).

The workflow creates the tag and builds every platform automatically. It resolves latest `main` to one full commit at its start. All checks, platform artifacts, the Unity package and Release use that commit. Changes arriving during execution belong to the next release.

Automatic selection considers the repository version and existing stable tags. A repository version above every stable tag is used as written; otherwise the highest stable patch version increases by one. For example, after `v0.4.0`, the next automatic release is `v0.4.1`. An explicit version must exceed existing stable versions. Version changes apply inside the build workspace; repository version files retain their original values.

## What does each workflow do?

| File | Actions name | Responsibility |
| --- | --- | --- |
| `ci.yml` | CI | Automatic PR/main checks and builds; automatic main pre-releases |
| `checks.yml` | Checks | Shared Web/.NET/Python units, Unity metadata and E2E checks |
| `e2e.yml` | E2E | Browser behavior and normal screenshot comparison; manual baseline candidates |
| `update-e2e.yml` | Update E2E | Manual test/candidate maintenance through a review PR; no AI key in default mode |
| `build.yml` | Build | Shared six-platform portable archives, Windows installers/standalone EXEs, isolated native smoke and Unity packaging |
| `release.yml` | Release | Manually started stable publication from latest `main` |
| `pages.yml` | Pages | Automatic site build, site E2E, page deployment and VPM |

Each run checks its selected commit. Publication uses the check results and artifacts produced by that run.

## Which secrets do workflows use?

The repository Actions secret `SENSA_PAT` publishes Releases, pushes E2E candidate branches and creates review PRs. Creating the PR automatically triggers normal CI.

Default `screenshots` mode runs the full E2E suite and generates application baseline candidates plus eight site review captures. Optional `agent` mode additionally uses `OPENAI_API_KEY` to maintain test cases. [Image review workflow](e2e.en.md#how-do-i-update-e2e-manually)

## How are release notes generated?

Each automatic pre-release shows one **Source** line linking to the exact commit used for that build.

Stable release notes combine GitHub changes, direct commit history and bilingual download guidance:

- Changes, Pull Requests and contributors between the previous stable release and the selected commit.
- Version, full commit, check/build run links and download guidance for operating system/processor choices.
- First-start instructions, documentation/explorer links and the `SHA256SUMS.txt` checksum file.
- The actual verification scope.

Use change titles that describe an observable user benefit. Generated notes use recorded commit or PR information.

## Where should I look after a failure?

Open the Actions run, then inspect failing steps and the Job summary. E2E `summary.json`/`summary.md` separately record passed, failed, skipped, unrun, interrupted and flaky cases. Cases suppressed by the failure limit are recorded as unrun. See the [verification record](e2e-status.en.md) for recorded outcomes. After screenshot failures, inspect expected/actual/diff, review intentional changes, update the baselines and run a full normal comparison.

Application E2E, candidate capture and Pages site checks use the same Playwright container version, which provides the browser and its system dependencies. A shared installer adds Chinese fonts and the mock runtime while preserving fontconfig rules. The full application browser job has a 35-minute budget for both viewports, both languages and multi-tab connection cases.

Dependency installation reads fixed Ubuntu package sources and makes up to two attempts, each limited to 130 seconds with five more seconds to terminate processes. APT uses a 15-second network timeout and one retry per download; the step budget is five minutes. The second attempt first completes pending package configuration with `dpkg --configure --pending`, within the same budget. Verification continues after installation succeeds; investigate network or installation failures and retry the run when needed.

Native builds run all six portable programs with isolated smoke configuration; Windows also runs Shader bridge mock replay. Standalone Windows programs repeat smoke from a publish directory containing only one EXE, checking APIs, the Web UI and the local explorer. Installer checks silently install into a temporary directory, verify the installed binary and offline tools, run isolated application smoke, then uninstall and check that user configuration and recordings survive. Installation, startup and uninstall run only on native Windows Actions runners without real hardware.

Installers use pinned Inno Setup 6.7.3. The bootstrap downloads its compiler installer from the official GitHub Release, checks the repository-pinned SHA-256 and a valid Authenticode signature from official publisher `Pyrsys B.V.`, then executes it. This verifies the build tool's source; it does not imply that Sensa downloads are code-signed.

Packaging and publication accept ordinary files with portable archive paths. Publication requires all six portable archives, four additional Windows downloads and the Unity package, and verifies their platform checksums before creating a draft. After upload, it verifies names, sizes and SHA-256 hashes, then rechecks the actual Git tag target immediately before publication. Failed uploads retain a draft for investigation. Rerunning a published preview verifies its existing assets and completes any remaining cleanup. To publish newer code, start the stable workflow again so it resolves latest `main` and selects a new version.

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

## Local development and checks

Use Node.js 24, Python 3.12+ and the .NET SDK in [global.json](https://github.com/SeaLoong/Sensa/blob/main/global.json). Plan affected checks before running them; unchanged source/toolchains can reuse successful local records.

The .NET SDK is pinned to `10.0.401` with `rollForward: disable`. Actions and local commands run from the repository directory use this exact version. Update package lockfiles together with SDK upgrades, and check portable and single-file builds. Dependency restore stays in locked mode.

```shell
npm ci
python -X utf8 scripts/verify.py --plan
python -X utf8 scripts/verify.py
```

Browser E2E, screenshots and full-process smoke run in Actions. Isolated units and static checks may run locally. Device-related checks use temporary configuration and mock transports. Real hardware, Unity/VRChat and actual World interactions receive separate acceptance checks.

After changing Three.js source or dependencies, run `npm run build:web` and commit reproducible `docs/assets/parameter-geometry-3d.js` plus its complete `3d.LICENSE.txt`. After ordinary Markdown edits, build the site directly with `npm run build:pages`; artifacts are written to `artifacts/pages/`.

Measure large-catalog pure ranking independently:

```shell
node scripts/benchmark-osc-preview.mjs --output artifacts/performance/osc-ranking.json
```

This measures pure ranking time. E2E checks browser live updates, paging, frozen samples and path suggestions.

## Verify outputs and shared sessions

Protocol and transport changes use isolated codecs, mock transports and clocks to check value types, ranges, cancellation, stopping and reconnection. DG-LAB tests inspect pairing, device reports and RPC/task lifetime. Temporal computations check initial samples, changed provenance, invalidity and backward time. Recording checks bounded storage, escaping and sample timestamps.

Shared-session tests distinguish same-page reference counting, SharedWorker sharing, Web Locks ownership handoff, BroadcastChannel request correlation and the per-tab fallback. Actions browser cases open several pages and check partial closure, ownership handoff and reopening after all pages close. Isolated lifecycle unit tests check page-cache suspension and restoration. HTTP connection pools and server WebSocket budgets are observed separately. New output forms receive normal screenshot comparison and individual baseline inspection. [Architecture decision](adr/0008-signal-pipeline-and-shared-session.md) · [User guide](signal-pipeline.en.md)

[Architecture](architecture.en.md) · [Current CI decision](adr/0005-simplified-ci-and-releases.md) · [Browser verification](e2e.en.md)
