#!/usr/bin/env bash
set -euo pipefail

readonly script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly addon="${1:?usage: run-fresh-smoke-series.sh /absolute/path/addon.node /absolute/path/model.gguf}"
readonly model="${2:?usage: run-fresh-smoke-series.sh /absolute/path/addon.node /absolute/path/model.gguf}"
readonly runs="${ISPO_SMOKE_RUNS:-5}"
readonly cycles="${ISPO_SMOKE_CYCLES:-6}"

if [[ "$addon" != /* || "$model" != /* ]]; then
    echo "addon and model paths must be absolute" >&2
    exit 64
fi
if ! [[ "$runs" =~ ^[1-9][0-9]*$ ]] || ! [[ "$cycles" =~ ^[1-9][0-9]*$ ]]; then
    echo "ISPO_SMOKE_RUNS and ISPO_SMOKE_CYCLES must be positive integers" >&2
    exit 64
fi
if (( runs < 5 || cycles < 6 )); then
    echo "the lifecycle gate requires at least five fresh processes and six cycles each" >&2
    exit 64
fi

for ((run = 1; run <= runs; ++run)); do
    printf 'fresh smoke %d/%d\n' "$run" "$runs" >&2
    ISPO_SMOKE_CYCLES="$cycles" node "$script_dir/run-smoke.js" "$addon" "$model"
done
