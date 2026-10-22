#!/usr/bin/env bash
# Keep the Noble font package and its fontconfig rules used by screenshot baselines.
set -euo pipefail

source_file=${SENSA_E2E_UBUNTU_SOURCE_FILE:-/etc/apt/sources.list.d/ubuntu.sources}
if [[ $source_file != /* || ! -f $source_file || ! -r $source_file ]]; then
    printf '%s\n' '::error::The Ubuntu APT source file must be readable and use an absolute path.' >&2
    exit 1
fi

if [[ $# -gt 1 || ( $# -eq 1 && $1 != --attempt ) ]]; then
    printf '%s\n' 'Usage: bash scripts/install-e2e-dependencies.sh' >&2
    exit 2
fi

# The image also includes NodeSource. These packages only need Ubuntu indexes.
# Keep the source file's suites, components and signature verification unchanged.
apt_options=(
    -o "Dir::Etc::sourcelist=$source_file"
    -o 'Dir::Etc::sourceparts=-'
    -o 'Acquire::Retries=1'
    -o 'Acquire::http::Timeout=15'
    -o 'Acquire::https::Timeout=15'
    -o 'APT::Update::Error-Mode=any'
)
export DEBIAN_FRONTEND=noninteractive

# A fresh Bash process lets timeout bound update and install as one attempt.
if [[ ${1:-} == --attempt ]]; then
    printf '%s\n' '::notice::E2E dependencies: refreshing Ubuntu package indexes.'
    apt-get "${apt_options[@]}" update
    printf '%s\n' '::notice::E2E dependencies: installing Chinese fonts and the PTY runtime.'
    apt-get "${apt_options[@]}" install -y --no-install-recommends fonts-noto-cjk python3
    exit 0
fi

script_path=${BASH_SOURCE[0]}
status=1
for attempt in 1 2; do
    printf '::notice::E2E dependencies: attempt %s of 2 (130-second budget).\n' "$attempt"
    if timeout --kill-after=5s 130s bash "$script_path" --attempt; then
        printf '%s\n' '::notice::E2E dependencies: installation complete.'
        exit 0
    else
        status=$?
    fi
    printf '::warning::E2E dependencies: attempt %s of 2 failed (exit %s).\n' "$attempt" "$status" >&2
done

printf '%s\n' '::error::E2E dependency installation failed after two bounded attempts.' >&2
exit "$status"
