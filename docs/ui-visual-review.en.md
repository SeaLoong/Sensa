# Workbench visual review

[简体中文](ui-visual-review.md) | **English**

This review covers the separate Input, Mapping & transforms, Axis profiles and Outputs workspaces, including bilingual narrow layouts. The complete earlier geometry review remains in the [fixed history](https://github.com/SeaLoong/Sensa/blob/8eff42a03462566a61e37c97737fede0e973c59b/docs/ui-visual-review.en.md).

## Verified captures

[Full candidate run 43929566450](https://github.com/SeaLoong/Sensa/actions/runs/43929566450) executed 310 tests against `27f569770c2eb13b6555a158f4f6e8d8302cf846`, all passing on the first attempt with no failures, skips or unexecuted cases. This run generated candidates, not an ordinary baseline comparison.

- Of 164 application baselines, 78 changed images exactly match the SHA-256 values of prior individual visual observations and are selected with those observations; 80 unchanged images are retained.
- Six geometry images differ by only 6–18 raster pixels. Their existing baselines are retained without changing comparison tolerances.
- The 40 documentation screenshot references represent 38 unique files. Current capture attachments, source identity and SHA-256 were checked before refreshing the mirrors.
- This continuation additionally opened the desktop Input, desktop axis-mapping and Chinese narrow computation-editor originals. Outputs are separate from Input, mappings retain a shared save area, and narrow computation fields stack vertically. Content beyond the captured viewport requires scrolling.

Per-image observations, selection provenance and digests are in [baseline-review.json](../tests/e2e/baseline-review.json); documentation capture proof is in [catalog-capture-review.json](../tests/e2e/catalog-capture-review.json). Retained site originals are historical evidence, not acceptance of the current site.

## Guide follow-up

Source `0419e4f1f855acd920adbb9ad747bf827c85d832` fixes scene-specific targeting and reverse focus entry: OSC selects axis-mapping presets, while manual/script/protocol select common transforms. Shift+Tab from the guide container reaches the last control. Both quick starts and browser assertions were updated.

The [follow-up full candidate](https://github.com/SeaLoong/Sensa/actions/runs/43934966519) checks the updated spotlight captures and keyboard behavior. Earlier guide images do not prove these changes. Acceptance requires an ordinary full comparison of the current PR commit; see [verification status](e2e-status.en.md).

## Scope

Images establish only the shown state and viewport, not collapsed content, all forms, screen-reader behavior, high contrast or actual 400% zoom. Candidate generation, static checks and mock transports do not establish real-device, Unity/VRChat, HMD or mechanical-stop acceptance.
