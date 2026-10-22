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

Both release channels include Windows/Linux/macOS for x64 and ARM64 plus a Unity ZIP. Cleanup retains the newest **10 published pre-releases**, preserving stable releases, unpublished drafts and Git tags. VPM contains Unity packages from stable releases only.

## How do I publish a stable release?

1. Open [Actions → the stable release workflow](https://github.com/SeaLoong/Sensa/actions/workflows/release.yml).
2. Click **Run workflow** and use `main`.
3. Leave `version` empty for automatic selection, or enter a version such as `0.5.0`.
4. Run the workflow, wait for checks/build/publication to finish, and download from [Releases](https://github.com/SeaLoong/Sensa/releases).

The workflow creates the tag and builds every platform automatically. It resolves latest `main` to one full commit at its start. All checks, platform artifacts, the Unity package and Release use that commit. Changes arriving during execution belong to the next release.

Automatic selection considers the repository version and existing stable tags. A repository version above every stable tag is used as written; otherwise the highest stable patch version increases by one. For example, after `v0.4.0`, the next automatic release is `v0.4.1`. An explicit version must exceed existing stable versions. Version changes apply inside the build workspace; repository version files retain their original values.

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

Each run checks its selected commit. Publication uses the check results and artifacts produced by that run.

## Which secrets do workflows use?

The repository Actions secret `SENSA_PAT` publishes Releases, pushes E2E candidate branches and creates review PRs. Creating the PR automatically triggers normal CI.

Default `screenshots` mode runs E2E and generates candidate images directly. Optional `agent` mode additionally uses `OPENAI_API_KEY` to maintain test cases.

## How are release notes generated?

The notes combine GitHub change information with fixed bilingual usage details:

- Changes, Pull Requests and contributors between the previous stable release and the selected commit.
- Version, full commit, check/build run links and download guidance for operating system/processor choices.
- First-start instructions, documentation/explorer links and the `SHA256SUMS.txt` checksum file.
- The actual verification scope.

Use change titles that describe an observable user benefit. Generated notes use recorded commit or PR information.

## Where should I look after a failure?

Open the Actions run, then inspect failing steps and the Job summary. Font/mock-runtime installation in browser and candidate workflows has a five-minute step budget, a 30-second APT network timeout and two retries. Installation failures stop downstream tests; retry that run when needed. E2E `summary.json`/`summary.md` separately record passed, failed, skipped, unrun, interrupted and flaky cases. See the [verification record](e2e-status.en.md) for recorded outcomes. Cases suppressed by the failure limit are recorded as unrun. After screenshot failures, inspect expected/actual/diff, review intentional changes, update the baselines and run a full normal comparison.

Native builds run the generated program with isolated smoke configuration; Windows also runs shader-bridge mock replay. The publisher creates a draft, uploads files and verifies names, sizes and SHA-256 hashes. Failed uploads retain a draft for investigation. To publish newer code, start the stable workflow again so it resolves latest `main` and selects a new version.

## Documentation site and VPM

The [documentation site](https://sealoong.github.io/Sensa/) builds automatically after document/site changes on `main`, then deploys after site E2E succeeds. A successful stable release refreshes VPM automatically. Deployment uses the same checked static artifact; stable-package refreshes use current `main` documentation.

VPM preserves verified stable packages and historical downloads. Network or hash failures stop deployment; an unavailable state is shown when no stable package exists.

## Local development and checks

Use Node.js 24, Python 3.12+ and the .NET SDK in [global.json](https://github.com/SeaLoong/Sensa/blob/main/global.json). Plan affected checks before running them; unchanged source/toolchains can reuse successful local records.

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

[Architecture](architecture.en.md) · [Current CI decision](adr/0005-simplified-ci-and-releases.md) · [Browser verification](e2e.en.md)
