#!/usr/bin/env bash
set -euo pipefail

readonly fixture_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/fixtures"
readonly manifest="$fixture_dir/tinyllama-15m-stories-q2-k.json"
readonly output="${1:?usage: fetch-smoke-fixture.sh /absolute/path/tinyllama-15M-stories-Q2_K.gguf}"
readonly expected_sha="f7e39dc9f26f3d39bf59e885349c6eec65880f685322d591f53e6cdb46ceb2e9"
readonly source_url="https://huggingface.co/tensorblock/tinyllama-15M-stories-GGUF/resolve/227c5a5ad3c1a830901543cf9959c53572014a68/tinyllama-15M-stories-Q2_K.gguf"
readonly license_url="https://huggingface.co/tensorblock/tinyllama-15M-stories-GGUF/raw/227c5a5ad3c1a830901543cf9959c53572014a68/README.md"
readonly expected_license_sha="904844774ca757e910ac26d8bbf550e574946ee4a72ba99b17f986a4ea75e315"
readonly license_record="$(mktemp)"

cleanup() {
    rm -f "$license_record"
}
trap cleanup EXIT

if [[ "$output" != /* ]]; then
    echo "fixture destination must be absolute" >&2
    exit 64
fi
curl --fail --location --proto '=https' --tlsv1.2 --output "$license_record" "$license_url"
actual_license_sha="$(shasum -a 256 "$license_record" | awk '{print $1}')"
if [[ "$actual_license_sha" != "$expected_license_sha" ]] ||
   ! grep -Fx 'license: mit' "$license_record" >/dev/null; then
    echo "fixture license record did not match the pinned MIT model card" >&2
    exit 65
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
