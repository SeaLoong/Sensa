# Development and validation

[简体中文](development.md) | **English**

Use Node.js 24, Python 3.12+ and the .NET SDK pinned in `global.json`.

```shell
npm ci
npm test
dotnet restore tests/Sensa.Tests/Sensa.Tests.csproj --locked-mode
dotnet test tests/Sensa.Tests/Sensa.Tests.csproj -c Release
python -m unittest discover -s tests/scripts
python scripts/release.py check-unity
```

For manual development, run `dotnet run --project src/Sensa.csproj`. Build self-contained packages with `scripts/build-platform.py --runtime <RID>`; RIDs combine win/linux/osx with x64/arm64. Run binaries on their matching platform.

## CI and release gates

**Automated browser E2E, full-process smoke tests and screenshot generation run only in GitHub Actions.** Local work uses static checks/unit tests. See [E2E](e2e.en.md) for reviewed baselines and mock transports.

Validation runs before E2E comparison. Passing E2E unlocks six native platform jobs, each with backend tests, self-contained packaging and isolated HTTP/WS/OSC smoke checks. Windows packages are ZIP; Linux/macOS use tar.gz preserving execute bits.

Only a successful main push automatically publishes a prerelease. It contains six desktop archives, the Unity ZIP and checksums. Preview tags include run/attempt/commit identity and never move an existing version. Uploads first go to a draft; names, uploaded states, sizes, SHA-256 and target commit are checked before publishing. Each attachment has at most three upload attempts. Incomplete uploads remain drafts.

PRs cannot publish. Manual **Validate and preview** only validates/builds. Manual **Validate and release Unity package** creates a preview artifact, with no stable release, tag or VPM deployment. Stable v* / unity-v* publication requires an explicit request. Preview labels do not bump protocol/base versions and do not enter the stable VPM index.

React and React DOM updates are grouped to prevent peer-dependency conflicts. This does not auto-merge updates. See [historical CI failures](ci-failure-audit.en.md). Diagnose the failed step: ERESOLVE is dependency resolution, HTTP 408 may be upload timeout, and smoke failures have `service.log`/`result.json` in platform test artifacts. Assertions wait for observed state; they do not resend test inputs or retry entire tests to hide failures.

## Unity projects

The separate Avatar and World projects are local-only repositories; proprietary models/packages never enter Sensa. Install first-party sources with:

```powershell
python scripts/install-world-lab.py "D:/VRChatProjects/Sensa Test World"
python scripts/install-avatar-lab.py "D:/VRChatProjects/Sensa Test Avatar" --tests
```

Use the project's supported Unity version. Save your scene edits before building; do not open a project in two editors. Local compile/EditMode unit checks are allowed. Do not launch automated PlayMode/E2E screenshot suites locally; the current CI does not provision the proprietary full Unity labs.

The existing `validate-labs.py` harness provides world-editor, world-functional, world-geometry, world-offset, avatar-tests and avatar-build suites for an appropriately provisioned runner. Functional/geometry suites are integration tests, not unit checks. GPU suites require a graphics device and must not use `-nographics`.

Reports use a fresh `artifacts/lab-validation/<id>/summary.json`, per-suite Unity/launcher logs and copied reports. Existing output directories are rejected. The harness requires a successful Unity exit, a newly generated explicit pass report and unchanged original world scenes. It stops on failure and kills only processes it launched on timeout. Missing, stale, skipped or zero-test reports are not passes.

Static Unity package checks cannot certify NDMF, Udon, real VRChat OSC, VR grabbing, HMD visibility or hardware. Validate those manually in your private uploads before claiming end-to-end hardware support.

## Localization

[Language support](languages.en.md) documents catalogs, stable protocol identifiers, Unity bilingual labels and translation checks. UI changes need both desktop and narrow-screen CI review. Add English text and tests when introducing user-facing features.

Technical references: [automatic generation and geometry](../unity/top.sealoong.sensa/AUTOMATION.en.md), [GPU experiments](../unity/top.sealoong.sensa/GPU-TRACKING.en.md), [world implementation](../tools/unity-world-lab/DEVELOPMENT.en.md).
