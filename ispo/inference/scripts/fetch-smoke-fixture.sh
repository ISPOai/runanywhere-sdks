#!/usr/bin/env bash
set -euo pipefail

readonly fixture_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/fixtures"
readonly manifest="$fixture_dir/stories15m-q4_0.json"
readonly output="${1:?usage: fetch-smoke-fixture.sh /absolute/path/stories15M-q4_0.gguf}"
readonly expected_sha="66967fbece6dbe97886593fdbb73589584927e29119ec31f08090732d1861739"
readonly source_url="https://huggingface.co/ggml-org/models-moved/resolve/499bc8821c6b12b4e53c5bffcb21ec206f212d81/tinyllamas/stories15M-q4_0.gguf"

if [[ "$output" != /* ]]; then
    echo "fixture destination must be absolute" >&2
    exit 64
fi
mkdir -p "$(dirname "$output")"
curl --fail --location --proto '=https' --tlsv1.2 --output "$output" "$source_url"
actual_sha="$(shasum -a 256 "$output" | awk '{print $1}')"
if [[ "$actual_sha" != "$expected_sha" ]]; then
    rm -f "$output"
    echo "fixture hash mismatch: expected $expected_sha, got $actual_sha" >&2
    exit 65
fi
printf 'verified %s using %s\n' "$output" "$manifest"
