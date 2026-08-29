#!/usr/bin/env bash
set -euo pipefail

readonly repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
readonly preset="ispo-darwin-arm64-inference-release"
readonly version="0.20.31-ispo.1"
readonly output_dir="${ISPO_ARTIFACT_OUTPUT:-$repo_root/dist/ispo-local-inference}"
readonly stage_dir="$output_dir/ispo-local-inference-darwin-arm64-$version"
readonly archive="$output_dir/ispo-local-inference-darwin-arm64-$version.zip"
readonly build_dir="$(mktemp -d "$repo_root/.ispo-inference-build.XXXXXX")"
readonly addon="$build_dir/ispo/inference/ispo_local_inference_native.node"
readonly mode="${1:-release}"

cleanup() {
    rm -rf "$build_dir"
}
trap cleanup EXIT

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
    echo "Darwin arm64 host required" >&2
    exit 64
fi
if [[ "$mode" != "release" && "$mode" != "--development-adhoc" ]]; then
    echo "usage: package-darwin-arm64.sh [--development-adhoc]" >&2
    exit 64
fi
if [[ "$mode" == "release" && -z "${ISPO_CODESIGN_IDENTITY:-}" ]]; then
    echo "ISPO_CODESIGN_IDENTITY is required for release packaging" >&2
    exit 65
fi
if [[ "$mode" == "--development-adhoc" ]]; then
    readonly artifact_suffix="-development"
else
    readonly artifact_suffix=""
fi
readonly package_stage_dir="$stage_dir$artifact_suffix"
readonly package_archive="${archive%.zip}$artifact_suffix.zip"

mkdir -p "$output_dir"
if [[ -e "$package_stage_dir" || -e "$package_archive" || -e "$package_archive.sha256" ]]; then
    echo "artifact destination already exists; choose an empty ISPO_ARTIFACT_OUTPUT" >&2
    exit 73
fi
if [[ -n "${FETCHCONTENT_SOURCE_DIR_ISPO_LLAMACPP:-}" ]]; then
    echo "local llama.cpp source overrides are not permitted" >&2
    exit 65
fi

cmake --preset "$preset" -B "$build_dir" --fresh
cmake --build "$build_dir" --parallel "${ISPO_BUILD_JOBS:-4}"

readonly llama_source="$build_dir/_deps/ispo_llamacpp-src"
if [[ ! -f "$llama_source/LICENSE" ]]; then
    echo "pinned llama.cpp source archive did not populate" >&2
    exit 65
fi

if [[ "$mode" == "release" ]]; then
    codesign --force --sign "$ISPO_CODESIGN_IDENTITY" --timestamp --options runtime "$addon"
    codesign --verify --strict --verbose=2 "$addon"
    codesign -dvv "$addon" 2>&1 | grep -F "TeamIdentifier=" >/dev/null
    codesign -dvv "$addon" 2>&1 | grep -F "flags=0x10000(runtime)" >/dev/null
else
    codesign --force --sign - "$addon"
    codesign --verify --strict --verbose=2 "$addon"
fi
"$repo_root/ispo/inference/scripts/audit-artifact.sh" "$addon"

mkdir "$package_stage_dir"
mkdir "$package_stage_dir/native" "$package_stage_dir/notices" "$package_stage_dir/metadata"
cp "$addon" "$package_stage_dir/native/"
cp "$repo_root/LICENSE" "$package_stage_dir/notices/RUNANYWHERE-LICENSE.txt"
cp "$llama_source/LICENSE" "$package_stage_dir/notices/LLAMA-CPP-MIT.txt"
cp "$repo_root/bindings/electron/native/node_modules/node-addon-api/LICENSE.md" \
    "$package_stage_dir/notices/NODE-ADDON-API-MIT.txt"
cp "$repo_root/bindings/electron/native/node_modules/node-api-headers/LICENSE" \
    "$package_stage_dir/notices/NODE-API-HEADERS-MIT.txt"
cp "$repo_root/docs/ISPO-THIRD-PARTY-NOTICES.md" "$package_stage_dir/notices/THIRD-PARTY-NOTICES.md"
cp "$repo_root/ISPO-MODIFICATIONS.md" "$package_stage_dir/metadata/ISPO-MODIFICATIONS.md"
cp "$repo_root/ispo/inference/fixtures/stories15m-q4_0.json" "$package_stage_dir/metadata/smoke-fixture.json"

node - "$package_stage_dir/metadata" "$repo_root" "$llama_source" "$build_dir" "$version" <<'NODE'
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const [metadataDirectory, repositoryRoot, llamaSource, buildDirectory, artifactVersion] = process.argv.slice(2);
const sha256 = (filename) => crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
const output = (command, arguments) => execFileSync(command, arguments, { encoding: 'utf8' }).trim();
const nativeLock = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'bindings/electron/native/package-lock.json'), 'utf8'));
const nativePackages = ['node-addon-api', 'node-api-headers'].map((name) => {
  const packageEntry = nativeLock.packages[`node_modules/${name}`];
  return { name, version: packageEntry.version, integrity: packageEntry.integrity };
});
const licenses = [
  ['RunAnywhere SDK source', path.join(repositoryRoot, 'LICENSE')],
  ['llama.cpp and ggml', path.join(llamaSource, 'LICENSE')],
  ['node-addon-api', path.join(repositoryRoot, 'bindings/electron/native/node_modules/node-addon-api/LICENSE.md')],
  ['node-api-headers', path.join(repositoryRoot, 'bindings/electron/native/node_modules/node-api-headers/LICENSE')],
].map(([name, filename]) => ({ name, sha256: sha256(filename) }));
const inputManifest = {
  artifact: '@ispo/runanywhere-local-inference',
  version: artifactVersion,
  forkHead: output('git', ['-C', repositoryRoot, 'rev-parse', 'HEAD']),
  adoptedUpstream: '00e879fa818111054c02c8ad1f1a0398a4738f92',
  llamaCpp: {
    repository: 'https://github.com/RunanywhereAI/llama.cpp.git',
    revision: '79e2eb5eef131799ca6a2e2e342056a37a148df8',
    archive: 'https://github.com/RunanywhereAI/llama.cpp/archive/79e2eb5eef131799ca6a2e2e342056a37a148df8.tar.gz',
    archiveSha256: '67d40b994c948d6536c50a1fe613cc0e4710af2567667344011a40f4dcbe72e9',
    patchSha256: sha256(path.join(repositoryRoot, 'ispo/inference/patches/llama-static-backend-registry.patch')),
  },
  npm: nativePackages,
  toolchain: {
    node: process.version,
    cmake: output('cmake', ['--version']).split('\n')[0],
    xcode: output('xcodebuild', ['-version']).replaceAll('\n', '; '),
    sdk: output('xcrun', ['--show-sdk-version']),
    host: `${process.platform}-${process.arch}`,
  },
  build: {
    preset: 'ispo-darwin-arm64-inference-release',
    deploymentTarget: '14.5',
    architecture: 'darwin-arm64',
    sources: ['direct N-API adapter', 'static llama.cpp', 'static ggml CPU/Accelerate', 'static ggml Metal'],
    disabled: ['dynamic backend discovery', 'HTTP', 'RPC', 'curl', 'server', 'examples', 'tests'],
    metalShaders: 'embedded',
    buildDirectory: path.basename(buildDirectory),
  },
  licenseHashes: licenses,
};
const sbom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  version: 1,
  metadata: { component: { type: 'application', name: '@ispo/runanywhere-local-inference', version: artifactVersion } },
  components: [
    { type: 'library', name: 'RunAnywhere SDK source', version: inputManifest.adoptedUpstream },
    { type: 'library', name: 'llama.cpp', version: inputManifest.llamaCpp.revision, licenses: [{ license: { id: 'MIT' } }] },
    ...nativePackages.map((component) => ({ type: 'library', ...component, licenses: [{ license: { id: 'MIT' } }] })),
  ],
};
fs.writeFileSync(path.join(metadataDirectory, 'input-manifest.json'), `${JSON.stringify(inputManifest, null, 2)}\n`);
fs.writeFileSync(path.join(metadataDirectory, 'sbom.json'), `${JSON.stringify(sbom, null, 2)}\n`);
NODE

find "$package_stage_dir" -type f -exec touch -t 202601010000 {} +
(cd "$package_stage_dir" && find . -type f ! -path './metadata/artifact-manifest.sha256' -print | LC_ALL=C sort | while read -r file; do shasum -a 256 "$file"; done) > "$package_stage_dir/metadata/artifact-manifest.sha256"
touch -t 202601010000 "$package_stage_dir/metadata/artifact-manifest.sha256"
(cd "$package_stage_dir" && find . -type f -print | LC_ALL=C sort | zip -X -q "$package_archive" -@)
(cd "$output_dir" && shasum -a 256 "$(basename "$package_archive")") > "$package_archive.sha256"
printf 'packaged %s\n' "$package_archive"
