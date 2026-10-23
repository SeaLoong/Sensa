#!/usr/bin/env bash
# Keep the host runner's GitHub CLI while bounding browser-library/font setup.
set -euo pipefail

if [[ ${1:-} == --attempt && $# -eq 3 ]]; then
    printf '%s\n' '::notice::Pages dependencies: installing Chromium system libraries.'
    "$2" "$3" install-deps chromium
    printf '%s\n' '::notice::Pages dependencies: installing Chinese fonts.'
    apt-get install -y --no-install-recommends fonts-noto-cjk
    exit 0
fi
if [[ $# -ne 0 ]]; then
    printf '%s\n' 'Usage: bash scripts/install-pages-dependencies.sh' >&2
    exit 2
fi

source_file=${SENSA_E2E_UBUNTU_SOURCE_FILE:-/etc/apt/sources.list.d/ubuntu.sources}
if [[ $source_file != /* || ! -f $source_file || ! -r $source_file || $source_file == *$'\n'* || $source_file == *$'\r'* ]]; then
    printf '%s\n' '::error::The Ubuntu APT source file must be readable and use an absolute path.' >&2
    exit 1
fi
node_path=$(command -v node)
script_directory=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
cli_path="$script_directory/../node_modules/playwright/cli.js"
if [[ $node_path != /* || ! -x $node_path || ! -f $cli_path ]]; then
    printf '%s\n' '::error::Install the pinned Node/Playwright dependencies before Pages browser setup.' >&2
    exit 1
fi

temporary=$(mktemp -d)
trap 'rm -rf -- "$temporary"' EXIT
apt_config="$temporary/apt.conf"
escaped_source=${source_file//\\/\\\\}
escaped_source=${escaped_source//\"/\\\"}
cat > "$apt_config" <<EOF
Dir::Etc::sourcelist "$escaped_source";
Dir::Etc::sourceparts "-";
Acquire::Retries "1";
Acquire::http::Timeout "15";
Acquire::https::Timeout "15";
APT::Update::Error-Mode "any";
EOF

status=1
for attempt in 1 2; do
    printf '::notice::Pages dependencies: attempt %s of 2 (130-second budget).\n' "$attempt"
    # Playwright runs apt-get internally. Set APT_CONFIG after sudo so it survives
    # privilege elevation, and keep the original runner Node executable explicit.
    if sudo env APT_CONFIG="$apt_config" DEBIAN_FRONTEND=noninteractive \
        timeout --kill-after=5s 130s bash "$script_directory/install-pages-dependencies.sh" \
        --attempt "$node_path" "$cli_path"; then
        printf '%s\n' '::notice::Pages dependencies: installation complete.'
        exit 0
    else
        status=$?
    fi
    printf '::warning::Pages dependencies: attempt %s of 2 failed (exit %s).\n' "$attempt" "$status" >&2
done
printf '%s\n' '::error::Pages dependency installation failed after two bounded attempts.' >&2
exit "$status"
