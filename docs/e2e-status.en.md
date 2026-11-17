# Verification record

[简体中文](e2e-status.md) | **English**

The current change removes the separate Scene presets modal, opens Diagnostics logs on entry, and expands setup to seven steps with simultaneous navigation and control highlights. Mapping, calculation and axis-profile templates remain on their respective pages.

| Check | Current evidence |
| --- | --- |
| Full browser candidate | [Run 44107180755](https://github.com/SeaLoong/Sensa/actions/runs/44107180755), source `bf35742613299174758666392fcbb2e09888abf5`, attempt 1: **314/314 passed**, zero failures, skips, flaky, unrun or interrupted cases |
| Chromium / Firefox / WebKit compatibility | **8/8 passed** in the same candidate run |
| Visual review | 21 changed baselines, 16 bilingual desktop/mobile tour attachments and eight site originals opened individually; six unrelated 1–18 pixel differences retain existing baselines |
| Catalog provenance | All 38 mirrors match current passing-case captures and selected baselines byte for byte |
| Ordinary full comparison | **Pending on final PR source.** Candidate has `selectionComplete=true`, `snapshotsCompared=false`; it is not comparison acceptance |

The first diagnostic candidate [44105819069](https://github.com/SeaLoong/Sensa/actions/runs/44105819069) passed 309/314. Its failures exposed mobile guide overlap and keyboard navigation timing. The successful second candidate includes placement fixes; the subsequent large-target readability fallback and focus-preservation changes still require the ordinary full CI run. Tests assert target and navigation hit-testing, readable guide space, keyboard focus, editor suspension, draft-only templates, expanded logs on re-entry and unchanged runtime activation.

[Image receipt](https://github.com/SeaLoong/Sensa/blob/main/tests/e2e/baseline-review.json) · [Visual review](ui-visual-review.en.md) · [Previous verification](https://github.com/SeaLoong/Sensa/blob/579074a2fed50bef2901f81abdaa522c49d2d50d/docs/e2e-status.en.md)

CI retains source/unit checks → full browser comparison on the same pinned commit → six native builds and isolated smoke. Candidate site captures predate the gallery-mirror refresh; final CI must verify the rebuilt site. Mock transports and build success do not establish real hardware, Unity/VRChat, HMD or mechanical-stop acceptance. No stable publication is requested.
