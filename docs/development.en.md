# Development, verification and releases

[简体中文](development.md) | **English**

Use Node.js 24, Python 3.12+ and the .NET SDK in [global.json](https://github.com/SeaLoong/Sensa/blob/main/global.json). Understand [architectural seams](architecture.en.md), then verify actual impact rather than repeatedly running everything.

## Local checks and receipts

```shell
npm ci
python -X utf8 scripts/verify.py --plan
python -X utf8 scripts/verify.py
```

The default compares HEAD with staged/unstaged/untracked changes. Use `--base <ref>` for committed changes, `--all` for all local checks and `--force` only for a justified rerun. SDK discovery prefers `artifacts/toolchain/dotnet/`, then PATH; override with `--dotnet <path>`.

Successful receipts in `artifacts/verification/` fingerprint relevant contents, command and toolchain. Identical inputs reuse them; failures, relevant edits or source changes during verification do not create reusable success. Python's full suite includes docs checks without duplication. Backend units use SkipWebBuild=true to isolate Web building.

After changing Three.js source/dependencies, run `npm run build:web` and commit reproducible `docs/assets/parameter-geometry-3d.js` plus its complete `3d.LICENSE.txt`. The runtime is a classic offline/file-compatible IIFE; ESM source is not another runtime asset. Ordinary Markdown needs no bundle rebuild. `npm run build:pages` creates `artifacts/pages/` without starting Sensa.

## Where verification runs

Measure catalog ranking independently:

```shell
node scripts/benchmark-osc-preview.mjs --output artifacts/performance/osc-ranking.json
```

Add `--base <Git-ref>` to compare with a version before the change. The script uses 4,096/10,000 parameters and 120 mappings, reporting median cold ranking and value-only update times without starting a server, browser or device. These timings exclude JSON parsing, React rendering and browser layout, so they are not frame-rate measurements. Local static rendering tests check that the actual table mounts at most 100 rows; Actions runs `catalog-performance.spec.js` to check live updates, pagination, full-catalog search, freezing and path suggestions.

| Change | Local | Actions |
| --- | --- | --- |
| Markdown/site | Docs/link/site-build contracts | Docs checks; separate Pages verification/deployment |
| Interactive HTML/CSS/JS | Web lint/model/build/docs contracts | Full browser comparison, offline and actual rendering checks |
| Web/backend tests | Affected lint/units/build | Corresponding checks; no publication without outstanding product work |
| E2E/baselines | Static/units | Required full comparison; never automatic baseline updates |
| Product/protocol/package | Affected interfaces | Same-SHA comparison and necessary platform builds/mock smoke |
| Unknown diff | Conservative local all | Conservative product verification |

Docs/test-only skips apply **only with no unfinished product verification**. [ci-plan.py](https://github.com/SeaLoong/Sensa/blob/main/scripts/ci-plan.py) and contracts own classification. Local planning does not read GitHub status; CI separately checks the product owner's actual results.

Browsers, screenshots, full-process smoke and World PlayMode run **only in Actions**. Local planning reports them without executing. Never forge CI environment to bypass guards. Isolated units/static/Unity EditMode may run locally; device tests use temporary config and mock transports. [E2E](e2e.en.md)

## Four workflows

| Workflow | Responsibility/publication boundary |
| --- | --- |
| `ci.yml` | PR/main/manual all/tag reuse; planning, interfaces, needed E2E/six platforms; eligible main previews only |
| `e2e.yml` | Reused/manual normal comparison; manual update_snapshots=true creates review candidates, not release comparison evidence |
| `release.yml` | Explicit v*/unity-v* tags; corresponding product release after same-SHA verification |
| `pages.yml` | Main docs/site changes and manual docs builds, plus stable Unity refresh; independently verified static deployment, no product release |

[ADR 0004](adr/0004-standalone-bilingual-documentation.md) replaces the old requirement to wait for stable Unity publication before updating docs. Pages renders both languages, retains the six-asset explorer, runs site-only navigation/language browser checks, then deploys **that same artifact**. Stable refreshes use current main docs so an old tag cannot overwrite newer guidance.

VPM contains stable Unity packages only and preserves verified historical indexes/same-origin archives. Current GitHub stable-release count does not determine historical VPM availability. Network/hash failures must fail instead of masquerading as an empty index. Only genuinely absent verified packages allow an unavailable state. Previews/current development do not become stable VPM packages.

## Product ownership and gates

Plan determines impact/main recovery. Validate and required E2E can run in parallel. Six platforms wait for plan/validate, not E2E, but publication joins all required successes and a **normal full comparison of the candidate SHA**. Candidate generation is not comparison evidence; manual full CI does not publish.

A later docs push inherits a running owner's unfinished intent without cancelling/duplicating the product chain. Its success or an intent artifact cannot clear that work: inspect actual required owner-job success. Missing/unknown/required-skipped results remain incomplete.

Test/config fixes after product failure recover the required chain at the current commit even when only tests changed. Without outstanding work, ordinary docs/tests do not publish. PR cancels superseded refs; main product work remains. Publication/pruning share `sensa-preview-publication`; candidates older than an already published one skip. Do not duplicate a still-running same-commit workflow.

Only when needed:

```shell
gh workflow run ci.yml --ref main
gh workflow run e2e.yml --ref main -f update_snapshots=false
```

## Artifacts and retention

Desktop builds cover Windows/Linux/macOS × x64/ARM64. Windows uses ZIP; Linux/macOS tar.gz retain executable bits. Audit Unity ZIP/checksums too. Previews start as drafts and verify remote names, states, sizes, SHA-256 and commit before publication. Upload retries are bounded; failure retains an unpublished draft.

After publication, paginate releases and retain the newest **ten published prereleases** by publication time. Recheck numeric ID, tag, target, time and state before each deletion. Preserve stable releases, drafts and Git tags. `publish-preview.py --prune-only` really deletes and belongs only to an authorized retention task. Stable tags need explicit authorization; previews do not justify version bumps/internal compatibility branches.

## Unity and lab projects

Compile/EditMode in an isolated Unity project. Metadata checks do not establish NDMF, Udon, ClientSim or uploaded-client behavior. The World repo stays local without a remote. Installers preflight managed files/manifests; conflicts must not overwrite user assets:

```shell
python scripts/install-world-lab.py "<World project>"
python scripts/install-avatar-lab.py "<Avatar project>" --tests
```

world-editor/functional/geometry/offset in `validate-labs.py` involve graphics, PlayMode or screenshots and require an authorized Actions runner. avatar-tests is EditMode; avatar-build checks an SDK bundle without uploading. Each suite needs a fresh output directory, original-scene hashes, exit code and explicit success; empty XML, failures or skips do not count.

Review images using [V1–V6](ui-quality.en.md); axe/keyboard checks are separate baselines. Real OSC, VR grabs, HMD/GPU capture, accuracy and mechanisms need acceptance. Link actual commit reports instead of hard-coding changing totals in generic guidance.
