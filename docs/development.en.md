# Development, verification and releases

[简体中文](development.md) | **English**

CI runs unit tests and a full browser E2E comparison before building, packaging and publishing. Automatic pre-releases and manually started stable releases have the same check requirements. A failed check or build stops publication; passing tests do not establish real-client or hardware acceptance.

## What happens when I commit code?

| Action | Automatic result |
| --- | --- |
| Open or update a Pull Request | Unit tests, full E2E and all platform builds; retain downloadable artifacts without publishing a Release |
| Push to `main` | Publish a pre-release after that commit's checks pass and every artifact is built |
| Change documents or site files on `main` | Build the site, run site-specific E2E and deploy automatically without a manual Pages run |
| Run `release.yml` manually | Resolve latest `main`, check/build/publish a stable Release, then refresh the site and VPM automatically |

Both release channels include Windows/Linux/macOS for x64 and ARM64 plus a Unity ZIP. Cleanup retains the newest **10 published pre-releases**, preserving stable releases, unpublished drafts and Git tags. VPM contains Unity packages from stable releases only.

## How do I publish a stable release?

1. Open [Actions → the stable release workflow](https://github.com/SeaLoong/Sensa/actions/workflows/release.yml).
2. Click **Run workflow** and use `main`.
3. Leave `version` empty for automatic selection, or enter a version such as `0.5.0`.
4. Run the workflow, wait for checks/build/publication to finish, and download from [Releases](https://github.com/SeaLoong/Sensa/releases).

There is no need to create a tag first or operate each platform separately. The workflow resolves latest `main` to one full commit at its start. All checks, platform artifacts, the Unity package and Release use that commit. Changes arriving during execution belong to the next release.

Automatic selection considers the repository version and existing stable tags. A repository version above every stable tag is used as written; otherwise the highest stable patch version increases by one. For example, after `v0.4.0`, the next automatic release is `v0.4.1`. An explicit version must exceed existing stable versions and cannot overwrite a published version. The selected version is applied only inside build workspaces; the workflow does not edit or commit version files back to `main`.

## What does each workflow do?

| File | Responsibility |
| --- | --- |
| `ci.yml` | Automatic PR/main checks and builds; automatic main pre-releases |
| `checks.yml` | Shared Web/.NET/Python units, Unity metadata and E2E checks |
| `e2e.yml` | Browser behavior and normal screenshot comparison; manual baseline candidates |
| `update-e2e.yml` | Manual test/candidate maintenance through a review PR; no AI key in default mode |
| `build.yml` | Shared six-platform desktop builds, isolated native smoke and Unity packaging |
| `release.yml` | Manually started stable publication from latest `main` |
| `pages.yml` | Automatic site build, site E2E, page deployment and VPM |

Each run depends on the required checks and builds for its own commit. It does not substitute earlier task successes or maintain verification-continuation records across commits.

## How are release notes generated?

The notes combine GitHub change information with fixed bilingual usage details:

- Changes, Pull Requests and contributors between the previous stable release and the selected commit. A pre-release never becomes the stable comparison base.
- Version, full commit, check/build run links and download guidance for operating system/processor choices.
- First-start instructions, documentation/explorer links and the `SHA256SUMS.txt` checksum file.
- The actual verification scope, without describing mock transports or browser checks as real-device acceptance.

Use change titles that describe an observable user benefit. Generated notes quote recorded commit or PR information and do not infer undocumented features or performance results.

## Where should I look after a failure?

Open the Actions run, then inspect failing steps and the Job summary. E2E `summary.json`/`summary.md` distinguish passed, failed, skipped, unrun, interrupted and flaky cases. See the [verification record](e2e-status.en.md) for recorded outcomes. Cases suppressed by the failure limit are not passes. Inspect expected/actual/diff after screenshot failures. Update baselines only for reviewed intentional changes; candidate images do not replace a passing normal comparison.

Publication requires successful units, full normal E2E, native checks and all download artifacts. Native builds run the generated program with isolated smoke configuration; Windows also runs shader-bridge mock replay, without user hardware. The publisher creates a draft, uploads files and verifies names, sizes and SHA-256 hashes. Failed uploads retain an unpublished draft. A published stable version is never overwritten. To publish newer code, start the stable workflow again so it resolves latest `main`.

## Documentation site and VPM

The [documentation site](https://sealoong.github.io/Sensa/) builds automatically after document/site changes on `main`, then deploys after site E2E succeeds. A successful stable release refreshes VPM automatically, so a separate manual Pages run is unnecessary. Deployment uses the same checked static artifact; stable-package refreshes use current `main` documentation.

VPM preserves verified stable packages and historical downloads. Network or hash failures stop deployment; an unavailable state is shown only when no stable package exists. Pre-releases do not enter the stable VPM index.

## Local development and checks

Use Node.js 24, Python 3.12+ and the .NET SDK in [global.json](https://github.com/SeaLoong/Sensa/blob/main/global.json). Plan affected checks before running them; unchanged source/toolchains can reuse successful local records.

```shell
npm ci
python -X utf8 scripts/verify.py --plan
python -X utf8 scripts/verify.py
```

Browser E2E, screenshots and full-process smoke run in Actions; never forge CI environment locally. Isolated units and static checks may run locally. Device-related checks use temporary configuration and mock transports, never the user's hardware. Unity/VRChat and actual World interactions require separate work.

After changing Three.js source or dependencies, run `npm run build:web` and commit reproducible `docs/assets/parameter-geometry-3d.js` plus its complete `3d.LICENSE.txt`. Ordinary Markdown needs no bundle rebuild. `npm run build:pages` writes site artifacts to `artifacts/pages/`.

Measure large-catalog pure ranking independently:

```shell
node scripts/benchmark-osc-preview.mjs --output artifacts/performance/osc-ranking.json
```

This excludes browser rendering/layout and is not a frame-rate measurement. E2E checks live updates, paging, frozen samples and path suggestions.

[Architecture](architecture.en.md) · [Current CI decision](adr/0005-simplified-ci-and-releases.md) · [Browser verification](e2e.en.md)
