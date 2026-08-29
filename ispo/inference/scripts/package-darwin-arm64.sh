#!/usr/bin/env bash
set -euo pipefail

readonly repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
readonly preset="ispo-darwin-arm64-inference-release"
readonly version="0.20.31-ispo.1"
readonly output_dir="${ISPO_ARTIFACT_OUTPUT:-$repo_root/dist/ispo-local-inference}"
readonly stage_dir="$output_dir/ispo-local-inference-darwin-arm64-$version"
readonly archive="$output_dir/ispo-local-inference-darwin-arm64-$version.zip"
readonly addon="$repo_root/build/$preset/ispo/inference/ispo_local_inference_native.node"

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
    echo "Darwin arm64 host required" >&2
    exit 64
fi
if [[ "${ISPO_RELEASE_SIGNING:-0}" == "1" && -z "${ISPO_CODESIGN_IDENTITY:-}" ]]; then
    echo "ISPO_CODESIGN_IDENTITY is required for release packaging" >&2
    exit 65
fi

cmake --preset "$preset"
cmake --build --preset "$preset" --parallel "${ISPO_BUILD_JOBS:-4}"
rm -rf "$stage_dir"
mkdir -p "$stage_dir/native" "$stage_dir/notices" "$stage_dir/metadata"
cp "$addon" "$stage_dir/native/"
cp "$repo_root/LICENSE" "$stage_dir/notices/RUNANYWHERE-LICENSE.txt"
cp "$repo_root/docs/ISPO-THIRD-PARTY-NOTICES.md" "$stage_dir/notices/THIRD-PARTY-NOTICES.md"
cp "$repo_root/ISPO-MODIFICATIONS.md" "$stage_dir/metadata/ISPO-MODIFICATIONS.md"
cp "$repo_root/ispo/inference/fixtures/stories15m-q4_0.json" "$stage_dir/metadata/smoke-fixture.json"
cat > "$stage_dir/metadata/input-manifest.json" <<EOF
{"artifact":"@ispo/runanywhere-local-inference","version":"$version","source":"00e879fa818111054c02c8ad1f1a0398a4738f92","llamaCpp":"79e2eb5eef131799ca6a2e2e342056a37a148df8","architecture":"darwin-arm64","metalShaders":"embedded","requiredDylibs":[]}
EOF
cat > "$stage_dir/metadata/sbom.json" <<EOF
{"bomFormat":"CycloneDX","specVersion":"1.5","components":[{"type":"application","name":"@ispo/runanywhere-local-inference","version":"$version"},{"type":"library","name":"llama.cpp","version":"79e2eb5eef131799ca6a2e2e342056a37a148df8","licenses":[{"license":{"id":"MIT"}}]},{"type":"library","name":"RunAnywhere SDK source","version":"00e879fa818111054c02c8ad1f1a0398a4738f92"}]}
EOF

if [[ "${ISPO_RELEASE_SIGNING:-0}" == "1" ]]; then
    codesign --force --sign "$ISPO_CODESIGN_IDENTITY" --timestamp --options runtime "$stage_dir/native/ispo_local_inference_native.node"
    codesign --verify --strict --verbose=2 "$stage_dir/native/ispo_local_inference_native.node"
else
    codesign --force --sign - "$stage_dir/native/ispo_local_inference_native.node"
    codesign --verify --strict --verbose=2 "$stage_dir/native/ispo_local_inference_native.node"
fi

find "$stage_dir" -type f -exec touch -t 202601010000 {} +
(cd "$stage_dir" && find . -type f ! -path './metadata/artifact-manifest.sha256' -print | LC_ALL=C sort | while read -r file; do shasum -a 256 "$file"; done) > "$stage_dir/metadata/artifact-manifest.sha256"
touch -t 202601010000 "$stage_dir/metadata/artifact-manifest.sha256"
(cd "$stage_dir" && find . -type f -print | LC_ALL=C sort | zip -X -q "$archive" -@)
shasum -a 256 "$archive" > "$archive.sha256"
printf 'packaged %s\n' "$archive"
