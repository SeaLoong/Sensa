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
| Documentation | Bilingual/link/resource contracts | Documentation checks; no E2E or release |
| Web unit tests | Web lint, interface contracts, build | Web checks; no release |
| Backend unit tests | Backend contracts | Backend checks; no release |
| E2E/baselines | Relevant static/unit checks | Necessary full screenshot comparison; no product release |
| Product/packaging/protocol | Affected interfaces | Candidate comparison and necessary six-platform builds/smoke |
| Unknown paths/unavailable diff | Conservative full local checks | Conservative full verification |

[ci-plan.py](https://github.com/SeaLoong/Sensa/blob/main/scripts/ci-plan.py) provides the same path-classification interface to local checks and CI; its implementation/contracts define the exact scope. Local `verify.py` uses only working-tree differences and content receipts, without reading GitHub state. CI additionally checks the actual run responsible for product verification to decide whether work must continue. Python's complete suite includes documentation, so it is not repeated. Backend contracts use `SkipWebBuild=true`, without Node or a generated bundle; normal publication still builds and packages Web assets.

The local runner only reports required E2E, native smoke and publication work. Browser E2E, full-process smoke, automatic screenshots and World PlayMode suites have CI-only guards. Do not spoof the Actions environment to bypass them.

## CI and prereleases

PR/main pushes compute impact first. With no outstanding product verification, they execute only checks affected by the current diff. Main automatically continues unfinished product verification without special commit messages or manual overrides. Ordinary interface tests run once rather than repeating npm/backend units in every native build. Native runners exercise the self-contained application through isolated HTTP/WebSocket/OSC peers. Windows uses ZIP; Linux/macOS tar.gz preserves executable permissions.

Product candidates require full E2E screenshot comparison for their commit, followed by necessary x64/ARM64 builds on Windows/Linux/macOS. Publication verifies that E2E's comparison SHA matches the candidate SHA; proposed-baseline runs provide no such proof. Screenshot comparison/review happens in CI; see [E2E](e2e.en.md).

Main product verification has a responsible run (owner). When a later documentation-only push finds it still running, it inherits the outstanding record without canceling or duplicating necessary product CI. The documentation workflow's own success cannot clear that record: every required owner job must actually succeed. The record artifact expresses verification intent, not successful execution. Missing artifacts, unknown states and skipped required jobs are conservatively treated as unfinished.

After product verification fails, an ordinary main push fixing tests or Playwright automatically completes the necessary product chain for the **current commit**: affected checks, full E2E, native builds/isolated smoke and prerelease publication once its gates pass. A test-only fix must not lose the outstanding product verification. No commit-message convention or manual product marker is required. Documentation/test-only changes do not publish when no product verification remains outstanding; ordinary manual verification does not publish either.

PRs cancel stale runs for the same ref, while necessary main product verification is preserved. Automatic publication/retention is serialized. Existing necessary CI retains responsibility instead of being duplicated. See [ci-plan.py](https://github.com/SeaLoong/Sensa/blob/main/scripts/ci-plan.py) for continuation rules and actual-result decisions.

Dispatch `ci.yml` for justified full verification or `e2e.yml` for browser-only checks. Do not dispatch a duplicate while necessary CI for that commit is already running:

```shell
gh workflow run ci.yml --ref main
gh workflow run e2e.yml --ref main -f update_snapshots=false
```

Previews begin as drafts. Six desktop archives, a Unity ZIP and combined checksums are uploaded and remotely verified by name/state/size/SHA-256/target commit before publication. Individual uploads get at most three attempts; failure leaves an unpublished draft.

After publication, enumerate all release pages and retain the **10 newest published prereleases**, including manually tagged prereleases. Immediately recheck numeric ID, tag, target, publication time and state before deletion. Stable releases, drafts and Git tags remain. `publish-preview.py --prune-only` performs real deletion and is used only for authorized retention work.

Stable publication still requires explicitly requested `v*`/`unity-v*` tags. This work changes no base or internal protocol versions. Previews stay out of the stable VPM index. React/React DOM updates remain grouped; dependency updates are not automatically merged.

## Local development and Unity

Manually run the development UI with `dotnet run --project src/Sensa.csproj`; select an isolated configuration or confirm your own outputs before device control. Use `dotnet publish` for build-only work. `build-platform.py` includes full-process smoke and is a CI-only entry point.

Unity compilation/EditMode units may run manually in independent projects. Public CI metadata checks do not replace NDMF, Udon, ClientSim or client validation. Keep the separate world repository local.

Installers preflight every owned source and manifest before writing, preserving user scenes, generated assets and local edits. Do not resolve conflicts by blindly overwriting:

```shell
python scripts/install-world-lab.py "<World project>"
python scripts/install-avatar-lab.py "<Avatar project>" --tests
```

`validate-labs.py` offers six suites. `world-editor`, `world-functional`, `world-geometry` and `world-offset` involve graphics/PlayMode/screenshots and require an Actions runner with Unity/licensed resources. `avatar-tests` is EditMode; `avatar-build` inspects a local SDK bundle without uploading. Unchanged authoring-scene hashes, fresh reports, zero exit codes and explicit success are required; XML must contain executed passing tests without skips. Each suite defaults to 900 seconds and output directories cannot be reused.

Device tests use temporary configurations and mock transports only. Real VRChat OSC, VR grabbing, HMD visibility, live GPU capture and hardware require separate validation. Never report unexecuted checks as passed. Diagnose failures using their actual reports/last observed state rather than resending input or rerunning an entire scenario to hide failure. See [historical CI findings](ci-failure-audit.en.md).
