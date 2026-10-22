# Browser verification record

[简体中文](e2e-status.md) | **English**

This page retains inspected runs; read each commit's [Actions](https://github.com/SeaLoong/Sensa/actions) for current progress. See [development and releases](development.en.md) and [E2E maintenance](e2e.en.md) for the workflow.

## Current review

Last checked: 2026-10-22 at 08:24 China Standard Time (UTC+8).

| Commit | Scope | Run | Inspected outcome |
| --- | --- | --- | --- |
| `c698c70` | Manual E2E candidate capture | [39696164927](https://github.com/SeaLoong/Sensa/actions/runs/39696164927) | All 74 cases passed, every other outcome zero; export succeeded and automatically created [draft PR #15](https://github.com/SeaLoong/Sensa/pull/15) |
| `6df338e` (PR merge commit) | Full normal E2E, builds and smoke checks | [39697659875](https://github.com/SeaLoong/Sensa/actions/runs/39697659875) | All 74 cases passed, every other outcome zero; full selection and image comparison confirmed, image updates disabled; units, all six native builds/isolated smoke checks and Unity packaging passed |
| `c966216` | Documentation site E2E and automatic deployment | [39699172306](https://github.com/SeaLoong/Sensa/actions/runs/39699172306) | All 8 cases passed, every other outcome zero; deployment succeeded |
| `c966216` | Full CI | [39699172451](https://github.com/SeaLoong/Sensa/actions/runs/39699172451) | Web/backend units passed; the offline archive documentation check found that the review link below targeted an unpackaged test directory, stopping E2E/build/publication. The link now uses a fixed online revision, pending the next CI run |

The candidate run updates images; normal comparison keeps image updates disabled and independently checks all cases. PR merge commit `6df338e` has exactly the same Git tree as image commit `2b850c4`. `SENSA_PAT` successfully pushed the candidate branch and created its PR, whose event automatically started normal CI.

## Image review

Coding assistants individually inspected all **55 changed images** in PR #15: 27 desktop and 28 narrow-layout PNGs. They include 40 bilingual parameter diagrams and 15 application images covering help, mappings, recording and root explanations. The full baseline retains 110 PNGs; the other 55 remain byte-identical.

Review covered full parameter names, alphabetical order with shorter prefixes first, parameter meanings, wrapping, controls and geometry labels. SPS1/SPS2 titles and explanations, Sensa SPS shared sphere coverage, and Shader edge markers/payload were readable. No new visual issues were found in the changed images. Images were accepted after individual inspection and the full normal comparison. See the [screenshot review record](https://github.com/SeaLoong/Sensa/blob/c9662166cf115d5e123ef3b47dcd8bb317be1cc5/tests/e2e/__screenshots__/README.md) for provenance and scope.

Earlier normal comparisons first reported help, mapping and recording differences against older baselines; these intentional wording changes are included in this candidate. Successful export and PR creation also confirmed the container Git and optional-job dependency fixes. Earlier run records remain at a [fixed historical revision](https://github.com/SeaLoong/Sensa/blob/c698c70177cc9b746567e12c59860d9217bf49c4/docs/e2e-status.en.md); earlier image reviews remain in the [visual review archive](ui-visual-review.en.md).

## Maintaining this record

After a run completes, verify its commit, link, suite and screenshot mode, then record passed, failed, skipped, unrun, flaky and interrupted counts from `summary.json`/`summary.md` or the `Browser result` annotation. Image acceptance records both actual inspection scope and a normal comparison result.

This review covers simulated browser behavior, layout and documentation navigation. Unity/VRChat, real GPU capture, physical touchscreens and hardware interactions receive separate acceptance checks. Accessibility details remain in each run's report.
