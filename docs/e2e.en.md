# E2E and screenshot review

[简体中文](e2e.md) | **English**

Browser E2E, automatic screenshots and full-process smoke run only in GitHub Actions. Do not run them locally or fabricate CI environment variables. Local work uses the affected checks and receipts from `scripts/verify.py`.

## Coverage

E2E starts the real Sensa backend and WebUI with an independent temporary configuration per scenario. External services/devices are loopback mocks: OSC UDP, TCode UDP/TCP, Linux PTY serial, Buttplug WebSocket and OSCQuery. Sensa HTTP/WS control is not mocked.

Regression areas include Control/OSC/Settings navigation, manual control/recording, QuickStart steps/gates, FT prefixes, presets/mappings, script pause/seeking, profiles/conflicts, permission after mode/script changes, default experimental blocking/explicit activation/expiry, language persistence and draft retention. Assertions check both UI state and mock wire commands; screenshots alone cannot prove stopping.

Desktop 1280×900 and narrow 390×844 use a fixed Playwright Linux container, fonts, locale and timezone. Narrow layout is not a physical phone test; PTY is not a Windows driver. Unity, uploaded VRChat avatars, HMDs and real hardware remain outside browser coverage. [Tests](https://github.com/SeaLoong/Sensa/tree/main/tests/e2e), [fixed environment](https://github.com/SeaLoong/Sensa/blob/main/playwright.config.js)

## Normal changes

1. Run affected local static/unit checks, commit and push.
2. Inspect the required browser comparison in main CI. With no unfinished product verification, documentation/unit-test-only changes do not duplicate product work.
3. On failure, download `e2e-report`; inspect expected/actual/diff, traces, service logs and `mock-wire.json`.
4. Fix incorrect behavior. Update baselines only for reviewed, intentional visual changes; do not hide failures with retries.

Normal comparison cannot update snapshots, and missing baselines fail. Prereleases require a normal full comparison at the candidate SHA; baseline-generation jobs provide no publication proof.

## Proposed baselines

For intentional layout/component changes, manually run **WebUI E2E and screenshots** in GitHub Actions with `update_snapshots=true`:

```shell
gh workflow run e2e.yml --ref <branch> -f update_snapshots=true
```

This requests remote generation. Wait for functional assertions to pass, then download `e2e-baselines` and inspect every image for layout, readability, overflow, expandable details, dialogs and error states. Downloading an artifact is not approval; partial images from failed runs cannot be accepted automatically.

After review, place the appropriate desktop/mobile PNGs in `tests/e2e/__screenshots__/` and commit them with the implementation. Normal full comparison must then pass. Candidate generation publishes no release and never writes back to Git automatically.

Screenshots mask unstable timestamps/runtime addresses, not targets, gates or errors. Tall regions are captured in segments using actual scrolling. Playwright/container upgrades require renewed review. Use Actions reports for the actual commit's results and image conclusions.

## Visual and accessibility evidence

Review substantial visual changes against the [visual assessment framework](ui-quality.en.md): hierarchy, typography, spacing, grouping, color and finish, then inspect proposed PNGs. Baseline comparisons detect unexpected visual changes; aesthetic judgments need screenshots, explicit criteria and reasons.

`quality.spec.js` adds axe-related rules, keyboard, dialog and narrow-layout checks in both languages to the existing browser job. JSON/Markdown evidence lives in `artifacts/e2e/ui-quality/` inside `e2e-report`, retaining violations, incomplete results, missing checks and engine versions. Zero detected violations is neither an aesthetics score nor complete WCAG conformance.

[Development](development.en.md) · [Architecture](architecture.en.md)
