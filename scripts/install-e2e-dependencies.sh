#!/usr/bin/env bash
# Keep the Noble font package and its fontconfig rules used by screenshot baselines.
set -euo pipefail

source_file=${SENSA_E2E_UBUNTU_SOURCE_FILE:-/etc/apt/sources.list.d/ubuntu.sources}
if [[ $source_file != /* || ! -f $source_file || ! -r $source_file || $source_file == *$'\n'* || $source_file == *$'\r'* ]]; then
    printf '%s\n' '::error::The Ubuntu APT source file must be readable and use an absolute path.' >&2
    exit 1
fi

if [[ $# -gt 1 || ( $# -eq 1 && $1 != --attempt ) ]]; then
    printf '%s\n' 'Usage: bash scripts/install-e2e-dependencies.sh' >&2
    exit 2
fi

if ! command -v python3 >/dev/null; then
    printf '%s\n' '::error::The pinned Playwright image must provide Python 3 for dependency setup.' >&2
    exit 1
fi
if [[ ${1:-} == --attempt ]]; then
    state_dir=${SENSA_E2E_APT_STATE:-}
    if [[ $state_dir != /* || ! -d $state_dir || ! -w $state_dir || $state_dir == *$'\n'* || $state_dir == *$'\r'* ]]; then
        printf '%s\n' '::error::Internal dependency attempts require their temporary state directory.' >&2
        exit 2
    fi
fi

if [[ ${1:-} == --attempt && ${SENSA_APT_RECOVERY:-0} == 1 ]]; then
    # Retry the same Ubuntu archive through its official public mirror. Keep
    # deb822 parsing (.sources), suites, components and the original trust root.
    fallback_source="$SENSA_E2E_APT_STATE/ubuntu-fallback.sources"
    python3 - "$source_file" "$fallback_source" <<'PY'
from pathlib import Path
import re
import sys

source = Path(sys.argv[1]).read_bytes()
result, in_uris = [], False
for line in source.splitlines(keepends=True):
    if line[:1] not in (b' ', b'\t'):
        in_uris = bool(re.match(rb'(?i)^URIs:', line))
    if in_uris:
        prefix, separator, value = line.partition(b':') if not line[:1].isspace() else (b'', b'', line)
        value = re.sub(rb'(?<!\S)https?://azure\.archive\.ubuntu\.com(?=/ubuntu(?:/|\s|$))',
                       b'https://archive.ubuntu.com', value)
        line = prefix + separator + value
    result.append(line)
rewritten = b''.join(result)
if rewritten != source:
    Path(sys.argv[2]).write_bytes(rewritten)
PY
    if [[ -f $fallback_source ]]; then
        source_file=$fallback_source
        printf '%s\n' '::notice::E2E dependencies: retrying the same Ubuntu packages through archive.ubuntu.com.'
    fi
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
    if [[ ${SENSA_APT_RECOVERY:-0} == 1 ]]; then
        printf '%s\n' '::notice::E2E dependencies: completing interrupted package configuration.'
        dpkg --configure --pending
    fi
    printf '%s\n' '::notice::E2E dependencies: refreshing Ubuntu package indexes.'
    apt-get "${apt_options[@]}" update
    # A mirror retry must deliver the same font bytes selected by the first
    # successful signed-index update, not a different screenshot font version.
    apt-cache "${apt_options[@]}" show --no-all-versions fonts-noto-cjk > "$SENSA_E2E_APT_STATE/font-metadata"
    font_request=$(python3 - "$SENSA_E2E_APT_STATE" <<'PY'
import json
from pathlib import Path
import re
import sys

state = Path(sys.argv[1])
fields = dict(line.split(': ', 1) for line in (state / 'font-metadata').read_text().split('\n\n', 1)[0].splitlines() if ': ' in line)
identity = {key: fields.get(key, '') for key in ('Package', 'Version', 'SHA256')}
if (identity['Package'] != 'fonts-noto-cjk' or not re.fullmatch(r'[0-9A-Za-z.+:~_-]+', identity['Version'])
        or not re.fullmatch(r'[0-9a-f]{64}', identity['SHA256'])):
    raise SystemExit('::error::The signed Ubuntu font package metadata is incomplete.')
saved = state / 'font-identity.json'
if saved.exists() and json.loads(saved.read_text()) != identity:
    raise SystemExit('::error::The Ubuntu mirror selected a different font package version or SHA256.')
temporary = state / 'font-identity.tmp'
temporary.write_text(json.dumps(identity))
temporary.replace(saved)
print('fonts-noto-cjk=' + identity['Version'])
PY
)
    printf '%s\n' '::notice::E2E dependencies: installing Chinese fonts and the PTY runtime.'
    apt-get "${apt_options[@]}" install -y --no-install-recommends "$font_request" python3
    exit 0
fi

script_path=${BASH_SOURCE[0]}
state_dir=$(mktemp -d)
trap 'rm -rf -- "$state_dir"' EXIT
status=1
for attempt in 1 2; do
    printf '::notice::E2E dependencies: attempt %s of 2 (130-second budget).\n' "$attempt"
    if SENSA_E2E_APT_STATE="$state_dir" SENSA_APT_RECOVERY=$((attempt - 1)) timeout --kill-after=5s 130s bash "$script_path" --attempt; then
        printf '%s\n' '::notice::E2E dependencies: installation complete.'
        exit 0
    else
        status=$?
    fi
    printf '::warning::E2E dependencies: attempt %s of 2 failed (exit %s).\n' "$attempt" "$status" >&2
done

printf '%s\n' '::error::E2E dependency installation failed after two bounded attempts.' >&2
exit "$status"
