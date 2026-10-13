# Project workflow

- After each completed, validated change, create a Git commit and push the main Sensa repository. This is the user's standing preference.
- Keep unrelated changes out of commits. Record test results and any unverified Unity/hardware behavior in the final response.
- Branch pushes are authorized. Do not create/push release tags or publish releases unless explicitly requested. The separate Unity test-world repository remains local-only with no remote or pushes.
- Device tests must use isolated configurations and mock transports; never activate the user's hardware during automated checks.
- The project has not had its first release. Update internal Sensa protocols in place; do not bump package/protocol versions or add compatibility branches solely for development changes. This does not remove required interoperability with external SPS/OSC formats.
