# Project workflow

- After each completed, validated change, create a Git commit and push the main Sensa repository. This is the user's standing preference.
- Keep unrelated changes out of commits. Record test results and any unverified Unity/hardware behavior in the final response.
- Branch pushes and automatic prereleases after successful main CI are authorized. Stable release tags and stable publishing still require an explicit request. The separate Unity test-world repository remains local-only with no remote or pushes.
- Device tests must use isolated configurations and mock transports; never activate the user's hardware during automated checks.
- Run automated end-to-end tests (browser and full-process smoke) and screenshot generation only in GitHub Actions, never on the local machine. Local static checks and unit tests are allowed. After changes, inspect the CI E2E results and image diffs. Update screenshot baselines only for reviewed, intentional UI changes; never automatically bless failing screenshots. Prereleases must depend on a passing E2E comparison run.
- During initial development, update internal Sensa protocols in place; do not bump package/protocol versions or add compatibility branches solely for development changes. This does not remove required interoperability with external SPS/OSC formats.
