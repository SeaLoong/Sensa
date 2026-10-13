# Project workflow

- After each completed, validated change, create a Git commit and push the main Sensa repository. This is the user's standing preference.
- Keep unrelated changes out of commits. Record test results and any unverified Unity/hardware behavior in the final response.
- Branch pushes and automatic prereleases after successful main CI are authorized. Stable release tags and stable publishing still require an explicit request. The separate Unity test-world repository remains local-only with no remote or pushes.
- Device tests must use isolated configurations and mock transports; never activate the user's hardware during automated checks.
- During initial development, update internal Sensa protocols in place; do not bump package/protocol versions or add compatibility branches solely for development changes. This does not remove required interoperability with external SPS/OSC formats.
