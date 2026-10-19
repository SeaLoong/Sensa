# Development and verification

[简体中文](development.md) | **English**

Use Node.js 24, Python 3.12+ and the SDK in [global.json](https://github.com/SeaLoong/Sensa/blob/main/global.json). See [architecture contracts](architecture.en.md) and the [feature reference](features.en.md).

## Verify by impact

Prepare dependencies once, then use the shared local entry point:

```shell
npm ci
python -X utf8 scripts/verify.py --plan
python -X utf8 scripts/verify.py
```

The default compares HEAD with staged, unstaged and untracked working files. Use `--base <ref>` for committed changes, `--all` to select every local lane, and `--force` only when a rerun is justified. `--dotnet <absolute-path>` overrides SDK selection; otherwise the project-isolated `artifacts/toolchain/dotnet/` precedes PATH.

Successful receipts live in `artifacts/verification/`, keyed by relevant sources, commands and toolchain. Unchanged inputs reuse success. Relevant changes, source mutation during verification and failed checks do not produce reusable success. Do not repeat a check merely to update progress.

The CI scope below assumes **no outstanding product verification**. Ordinary main pushes also automatically continue unfinished product verification, as described in the next section.

| Change | Necessary local checks | GitHub Actions |
| --- | --- | --- |
| Static documentation | Bilingual/link/path-privacy/resource contracts | Documentation checks; no E2E or release |
| Interactive parameter guide (HTML/CSS/JS) | Web contracts/build and documentation checks | Full E2E/screenshot comparison; guide-only changes do not publish |
| Web unit tests | Web lint, interface contracts, build | Web checks; no release |
| Backend unit tests | Backend contracts | Backend checks; no release |
| E2E/baselines | Relevant static/unit checks | Necessary full screenshot comparison; no product release |
| Product/packaging/protocol | Affected interfaces | Candidate comparison and necessary six-platform builds/smoke |
| Unknown paths/unavailable diff | Conservative full local checks | Conservative full verification |

[ci-plan.py](https://github.com/SeaLoong/Sensa/blob/main/scripts/ci-plan.py) provides the same path-classification interface to local checks and CI; its implementation/contracts define the exact scope. Local `verify.py` uses only working-tree differences and content receipts, without reading GitHub state. CI additionally checks the actual run responsible for product verification to decide whether work must continue. Python's complete suite includes documentation, so it is not repeated. Backend contracts use `SkipWebBuild=true`, without Node or a generated bundle; normal publication still builds and packages Web assets.

The local runner only reports required E2E, native smoke and publication work. Browser E2E, full-process smoke, automatic screenshots and World PlayMode suites have CI-only guards. Do not spoof the Actions environment to bypass them.

## CI and prereleases

CI keeps three workflows. Ordinary checks and native builds are inline jobs in `ci.yml`, without separate reusable entry points.

| Workflow | Trigger and scope | Work and boundaries |
| --- | --- | --- |
| `ci.yml` | PR/main pushes; manual full verification; reusable tag verification | Owns planning, affected interface checks, E2E, required native builds and automatic main previews. PR/manual runs do not publish. Reusable `release_target=app/unity` accepts only the matching `v*/unity-v*` tag push and does not publish tagged releases itself. |
| `e2e.yml` | Called by CI; manual browser comparison or proposed baselines | Owns full browser scenarios against the real application, screenshot comparison and reports. Only manual `update_snapshots=true` generates baselines for human review; it returns no successful comparison SHA. No publication or six-platform matrix. |
| `release.yml` | Explicit `v*`/`unity-v*` tag pushes | Reuses CI for the same commit and publishes the corresponding desktop/Unity packages. Desktop tags require six-platform builds; Unity tags build only the Unity package, without six desktop builds. Only a successfully published stable Unity package updates VPM Pages. No PR, main or manual entry point. |

PR/main pushes compute impact first. With no outstanding product verification, they execute only checks affected by the current diff. Main automatically continues unfinished product verification without special commit messages or manual overrides. Dependencies and publication gates are:

| Job/stage | Dependencies and required work |
| --- | --- |
| `plan` | Selects paths and main owner continuation; manual runs select full verification, while tag calls select the matching release target. |
| `validate` | Waits for plan, then centrally runs affected Web, backend, Python, documentation, dependency-audit and Unity metadata checks; ordinary product candidates also package Unity assets. |
| `e2e` | Waits for plan and runs alongside validate; performs full screenshot comparison for the current commit when required. |
| `platforms` | Waits for plan and validate, then builds, isolates smoke peers and archives the six Windows/Linux/macOS x64/ARM64 targets when selected. It does not wait for E2E or repeat ordinary interface tests. |
| Main `prerelease` | Requires a main push selected for publication, successful validate/E2E/platforms, and an E2E comparison SHA equal to the candidate SHA. |
| Tag `release`/`pages` | Release requires successful reusable CI, an E2E comparison SHA equal to the tag SHA and successful target packaging. Pages additionally requires successful stable Unity publication. |

Interface checks and browser comparison run in parallel; native builds can start once interface checks pass. Publication joins every required result. Proposed-baseline generation provides no comparison proof. Screenshot comparison/review happens in CI; see [E2E](e2e.en.md). Native runners exercise the self-contained application through isolated HTTP/WebSocket/OSC peers. Windows uses ZIP; Linux/macOS tar.gz preserves executable permissions.

Main product verification has a responsible run (owner). Workflow consolidation preserves recognition of the existing validate/platforms/browser evidence names. When a later documentation-only push finds the owner still running, it inherits the outstanding record without canceling or duplicating necessary product CI. The successor documentation run's own success cannot clear that record: every required owner job must actually succeed. The record artifact expresses verification intent, not successful execution. Missing artifacts, unknown states and skipped required jobs are conservatively treated as unfinished.

After product verification fails, an ordinary main push fixing tests or Playwright automatically completes the necessary product chain for the **current commit**: affected checks, full E2E, native builds/isolated smoke and prerelease publication once its gates pass. A test-only fix must not lose the outstanding product verification. No commit-message convention or manual product marker is required. Documentation/test-only changes do not publish when no product verification remains outstanding; ordinary manual verification does not publish either.

PRs cancel stale runs for the same ref, while necessary main product verification is preserved. Main previews and desktop/Unity tag publication and pruning share the `sensa-preview-publication` queue. `queue: max` preserves pending jobs. A published identical commit or newer automatic candidate suppresses obsolete packaging/publication. Existing necessary CI retains responsibility instead of being duplicated. [GitHub concurrency rules](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency). See [ci-plan.py](https://github.com/SeaLoong/Sensa/blob/main/scripts/ci-plan.py) for continuation rules and actual-result decisions.

Dispatch `ci.yml` for justified full verification, including manual Unity verification. Use `e2e.yml` for browser-only checks or proposed baselines for human review. Do not dispatch a duplicate while necessary CI for that commit is already running:

```shell
gh workflow run ci.yml --ref main
gh workflow run e2e.yml --ref main -f update_snapshots=false
```

Previews begin as drafts. Six desktop archives, a Unity ZIP and combined checksums are uploaded and remotely verified by name/state/size/SHA-256/target commit before publication. Individual uploads get at most three attempts; failure leaves an unpublished draft.

After publication, enumerate all release pages and retain the **10 newest published prereleases**, including manually tagged prereleases. Immediately recheck numeric ID, tag, target, publication time and state before deletion. Stable releases, drafts and Git tags remain. `publish-preview.py --prune-only` performs real deletion and is used only for authorized retention work.

Stable publication still requires explicitly requested `v*`/`unity-v*` tags. This work changes no base or internal protocol versions. Previews stay out of the stable VPM index. React/React DOM updates remain grouped; dependency updates are not automatically merged.

## WebUI visual quality

Use the [visual assessment framework](ui-quality.en.md) to guide typography, spacing, color and hierarchy, recording reasons against reviewed CI images. Automated accessibility/keyboard checks provide a floor and run alongside functional regressions in `e2e.yml`; their evidence is retained with `e2e-report`. No additional workflow or user telemetry is introduced. Keep visual inspection, questionnaire research and automated findings distinct.

## Local development and Unity

Manually run the development UI with `dotnet run --project src/Sensa.csproj`; select an isolated configuration or confirm your own outputs before device control. Use `dotnet publish` for build-only work. `build-platform.py` includes full-process smoke and is a CI-only entry point.

Unity compilation/EditMode units may run manually in independent projects. Public CI metadata checks do not replace NDMF, Udon, ClientSim or client validation. Keep the separate world repository local.

Installers preflight every owned source and manifest before writing, preserving user scenes, generated assets and local edits. Do not resolve conflicts by blindly overwriting:

```shell
python scripts/install-world-lab.py "<World project>"
python scripts/install-avatar-lab.py "<Avatar project>" --tests
```

`validate-labs.py` offers six suites. `world-editor`, `world-functional`, `world-geometry` and `world-offset` involve graphics/PlayMode/screenshots and require an Actions runner with Unity/licensed resources. `avatar-tests` is EditMode; `avatar-build` inspects a local SDK bundle without uploading. Unchanged authoring-scene hashes, fresh reports, zero exit codes and explicit success are required; XML must contain executed passing tests without skips. Each suite defaults to 900 seconds and output directories cannot be reused.

Device tests use temporary configurations and mock transports only. Real VRChat OSC, VR grabbing, HMD visibility, live GPU capture and hardware require separate validation. Never report unexecuted checks as passed. Diagnose failures using their actual reports/last observed state rather than resending input or rerunning an entire scenario to hide failure. Use the Actions reports for the corresponding commit as evidence.
