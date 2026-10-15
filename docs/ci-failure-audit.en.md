# Historical GitHub Actions failure audit

[简体中文](ci-failure-audit.md) | **English**

This records the **2026-10-15** audit of seven failed runs, not the current CI status. Old runs remain tied to old commits and do not turn green after fixes. See [latest main CI](https://github.com/SeaLoong/Sensa/actions/workflows/ci.yml?query=branch%3Amain).

| Run | Failure | Resolution |
| --- | --- | --- |
| [38709823100](https://github.com/SeaLoong/Sensa/actions/runs/38709823100) | Prerelease upload HTTP 408 | 75c938b: bounded per-asset retries; remote state/size/SHA-256 verified before publishing |
| [38457867283](https://github.com/SeaLoong/Sensa/actions/runs/38457867283) | React-only ERESOLVE; separate Windows ARM SDK CLR crash | Group React/React DOM; one SDK-install recovery attempt, then mandatory SDK checks/full tests |
| [38457828668](https://github.com/SeaLoong/Sensa/actions/runs/38457828668) | React DOM-only ERESOLVE | Old dependency PRs superseded by grouped PR #12; its seven checks passed at audit time |
| [38453980123](https://github.com/SeaLoong/Sensa/actions/runs/38453980123) | macOS input-mode WebSocket timeout | 769f1ae: correct cancellation/wait during OSC UDP rebinding; subsequent native macOS smoke passed |
| [38452634527](https://github.com/SeaLoong/Sensa/actions/runs/38452634527) | Same macOS timeout | Same code fix, not merely a longer wait |
| [38451096732](https://github.com/SeaLoong/Sensa/actions/runs/38451096732) | Missing release-notes parent directory and macOS timeout | 6abbc4e creates directory; packaging/native smoke coverage |
| [28191293931](https://github.com/SeaLoong/Sensa/actions/runs/28191293931) | Old VPM Pages deployment 404 | Logs expired (410), annotation retained Pages-not-enabled error. Old workflow removed; current deployment checks Pages configuration |

The Windows ARM failure codes 3221225477 / 0x80131506 were consistent with [upstream runtime issue #131636](https://github.com/dotnet/runtime/issues/131636). A single SDK-install retry mitigates an intermittent upstream failure; it does not claim to fix CLR. A second failure still fails the job; compilation/tests are not retried to hide defects.

Manual **Validate and preview** checks current main without publishing. Re-running an old failed run tests its old commit. Manual Unity validation packages a manual-labeled artifact, without stable release/tag/VPM deployment. Preview Unity packages report stable=false; regression tests cover that distinction.

Stable Unity tags still require explicit authorization. Pages is checked, not silently reconfigured, and no empty stable VPM index is deployed. Historical runs are not deleted merely to remove red entries.
