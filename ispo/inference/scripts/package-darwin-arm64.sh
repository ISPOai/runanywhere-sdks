#!/usr/bin/env bash
set -euo pipefail

readonly repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
readonly preset="ispo-darwin-arm64-inference-release"
readonly version="0.20.31-ispo.2"
readonly output_dir="${ISPO_ARTIFACT_OUTPUT:-$repo_root/dist/ispo-local-inference}"
readonly stage_dir="$output_dir/ispo-local-inference-darwin-arm64-$version"
readonly archive="$output_dir/ispo-local-inference-darwin-arm64-$version.zip"
readonly mode="${1:-release}"
readonly artifact_timestamp="202601010000"

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
if [[ -n "${FETCHCONTENT_SOURCE_DIR_ISPO_LLAMACPP:-}" ]]; then
    echo "local llama.cpp source overrides are not permitted" >&2
    exit 65
fi

if [[ "$mode" == "--development-adhoc" ]]; then
    readonly artifact_suffix="-development"
else
    readonly artifact_suffix=""
fi
readonly package_stage_dir="$stage_dir$artifact_suffix"
readonly package_archive="${archive%.zip}$artifact_suffix.zip"
readonly build_dir="$(mktemp -d "${TMPDIR:-/private/tmp}/ispo-inference-build.XXXXXX")"
readonly addon="$build_dir/ispo/inference/ispo_local_inference_native.node"

cleanup() {
    rm -rf "$build_dir"
}
trap cleanup EXIT

mkdir -p "$output_dir"
if [[ -e "$package_stage_dir" || -e "$package_archive" || -e "$package_archive.sha256" ]]; then
    echo "artifact destination already exists; choose an empty ISPO_ARTIFACT_OUTPUT" >&2
    exit 73
fi

cmake --preset "$preset" -B "$build_dir" --fresh
cmake --build "$build_dir" --parallel "${ISPO_BUILD_JOBS:-4}"

readonly llama_source="$build_dir/_deps/ispo_llamacpp-src"
if [[ ! -f "$llama_source/LICENSE" || ! -f "$addon" ]]; then
    echo "the pinned source or native addon did not populate" >&2
    exit 65
fi

if [[ "$mode" == "release" ]]; then
    codesign --force --sign "$ISPO_CODESIGN_IDENTITY" --timestamp --options runtime "$addon"
    codesign --verify --strict --verbose=4 "$addon"
    readonly signature_details="$(codesign -dvv "$addon" 2>&1)"
    if ! grep -F "TeamIdentifier=" <<<"$signature_details" >/dev/null; then
        echo "Developer ID signature did not carry a TeamIdentifier" >&2
        exit 65
    fi
    if ! grep -F "flags=0x10000(runtime)" <<<"$signature_details" >/dev/null; then
        echo "Developer ID signature did not enable hardened runtime" >&2
        exit 65
    fi
    if ! grep -E '^Timestamp=' <<<"$signature_details" >/dev/null; then
        echo "Developer ID signature lacks a secure timestamp" >&2
        exit 65
    fi
else
    codesign --force --sign - "$addon"
    codesign --verify --strict --verbose=4 "$addon"
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
cp "$repo_root/ispo/inference/fixtures/TINYLLAMA-15M-STORIES-MIT.txt" \
    "$package_stage_dir/notices/TINYLLAMA-15M-STORIES-MIT.txt"
cp "$repo_root/docs/ISPO-THIRD-PARTY-NOTICES.md" "$package_stage_dir/notices/THIRD-PARTY-NOTICES.md"
cp "$repo_root/ISPO-MODIFICATIONS.md" "$package_stage_dir/metadata/ISPO-MODIFICATIONS.md"
cp "$repo_root/ispo/inference/fixtures/tinyllama-15m-stories-q2-k.json" \
    "$package_stage_dir/metadata/smoke-fixture.json"

node - "$package_stage_dir/metadata" "$repo_root" "$llama_source" "$version" <<'NODE'
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const [metadataDirectory, repositoryRoot, llamaSource, artifactVersion] = process.argv.slice(2);
const sha256 = (filename) => crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
const output = (command, commandArguments) => execFileSync(command, commandArguments, { encoding: 'utf8' }).trim();
const sourceFile = (relativePath) => {
  const filename = path.join(repositoryRoot, relativePath);
  return { path: relativePath, sha256: sha256(filename) };
};
const lockPath = path.join(repositoryRoot, 'bindings/electron/native/package-lock.json');
const nativeLock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const nativeModules = path.join(repositoryRoot, 'bindings/electron/native/node_modules');
const runtimePackageNames = new Set(Object.keys(nativeLock.packages[''].dependencies || {}));
const sriAlgorithm = {
  sha1: 'SHA-1',
  sha256: 'SHA-256',
  sha384: 'SHA-384',
  sha512: 'SHA-512',
};
const sriToHashes = (integrity) => integrity.split(/\s+/).filter(Boolean).map((entry) => {
  const separator = entry.indexOf('-');
  const algorithm = sriAlgorithm[entry.slice(0, separator)];
  if (!algorithm || separator === -1) {
    throw new Error(`unsupported npm integrity value: ${entry}`);
  }
  return { alg: algorithm, content: Buffer.from(entry.slice(separator + 1), 'base64').toString('hex') };
});
const packageLicense = (lockEntryPath) => {
  const packageDirectory = path.join(repositoryRoot, 'bindings/electron/native', lockEntryPath);
  const packageMetadata = JSON.parse(fs.readFileSync(path.join(packageDirectory, 'package.json'), 'utf8'));
  const licenseFilename = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'license.md']
    .map((name) => path.join(packageDirectory, name))
    .find((filename) => fs.existsSync(filename));
  if (!licenseFilename) {
    throw new Error(`missing distributed license text for ${packageMetadata.name}`);
  }
  return {
    name: packageMetadata.name,
    version: packageMetadata.version,
    integrity: nativeLock.packages[lockEntryPath].integrity,
    hashes: sriToHashes(nativeLock.packages[lockEntryPath].integrity),
    role: runtimePackageNames.has(packageMetadata.name) ? 'runtime' : 'test-validation',
    license: {
      declared: packageMetadata.license || 'NOASSERTION',
      path: path.relative(repositoryRoot, licenseFilename),
      sha256: sha256(licenseFilename),
    },
  };
};
const nativePackages = Object.keys(nativeLock.packages)
  .filter((entry) => entry.startsWith('node_modules/') && nativeLock.packages[entry].integrity)
  .sort()
  .map(packageLicense);
const fixturePath = path.join(repositoryRoot, 'ispo/inference/fixtures/tinyllama-15m-stories-q2-k.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const fixtureLicensePath = path.join(repositoryRoot, 'ispo/inference/fixtures/TINYLLAMA-15M-STORIES-MIT.txt');
const sourceInputs = [
  'CMakePresets.json',
  'bindings/electron/native/package.json',
  'bindings/electron/native/package-lock.json',
  'ispo/inference/CMakeLists.txt',
  'ispo/inference/core/inference_core.h',
  'ispo/inference/core/inference_core.cpp',
  'ispo/inference/native/addon.cpp',
  'ispo/inference/native/exported-symbols.txt',
  'ispo/inference/patches/llama-static-backend-registry.patch',
  'ispo/inference/scripts/audit-artifact.sh',
  'ispo/inference/scripts/fetch-cyclonedx-1.5-schema.sh',
  'ispo/inference/scripts/fetch-smoke-fixture.sh',
  'ispo/inference/scripts/package-darwin-arm64.sh',
  'ispo/inference/scripts/run-smoke.js',
  'ispo/inference/scripts/validate-cyclonedx-sbom.js',
  'ispo/inference/fixtures/tinyllama-15m-stories-q2-k.json',
  'ispo/inference/fixtures/TINYLLAMA-15M-STORIES-MIT.txt',
].map(sourceFile);
const licenseHashes = [
  { name: 'RunAnywhere SDK source', path: 'LICENSE', sha256: sha256(path.join(repositoryRoot, 'LICENSE')) },
  { name: 'llama.cpp and ggml', path: 'LICENSE', sha256: sha256(path.join(llamaSource, 'LICENSE')) },
  ...nativePackages.map((component) => ({
    name: component.name,
    path: component.license.path,
    sha256: component.license.sha256,
  })),
  {
    name: 'TinyLlama 15M Stories fixture record',
    path: 'ispo/inference/fixtures/TINYLLAMA-15M-STORIES-MIT.txt',
    sha256: sha256(fixtureLicensePath),
  },
  {
    name: 'CycloneDX specification schema',
    source: 'https://raw.githubusercontent.com/CycloneDX/specification/c320fc0f0b46873864927d9d5684eea7ba439728/LICENSE',
    sha256: '6c29f22a4a7385285c6f579ec9f33c5e989f00739d6b257243a0b082ec9447ae',
    license: 'Apache-2.0',
  },
];
const inputManifest = {
  schemaVersion: 1,
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
    licenseSha256: sha256(path.join(llamaSource, 'LICENSE')),
  },
  cyclonedxSchema: {
    source: 'https://raw.githubusercontent.com/CycloneDX/specification/c320fc0f0b46873864927d9d5684eea7ba439728/schema/bom-1.5.schema.json',
    revision: 'c320fc0f0b46873864927d9d5684eea7ba439728',
    sha256: '067f7824b08653839ea050ae9e09ca48375eadc2652b0e2a299476e7db90335b',
    license: 'Apache-2.0',
    licenseSha256: '6c29f22a4a7385285c6f579ec9f33c5e989f00739d6b257243a0b082ec9447ae',
    spdxCompanion: {
      source: 'https://raw.githubusercontent.com/CycloneDX/specification/c320fc0f0b46873864927d9d5684eea7ba439728/schema/spdx.schema.json',
      sha256: '4f6e2b05c05d26a4f2dc5879fbc2fca94b0a28db46289d0c51345621b71cfbfc',
    },
    jsonSignatureCompanion: {
      source: 'https://raw.githubusercontent.com/CycloneDX/specification/c320fc0f0b46873864927d9d5684eea7ba439728/schema/jsf-0.82.schema.json',
      sha256: '8bae002c25e723db7ee1f26afde680ae1a2b1a8f6b4b4b0fd65dc3becb090aae',
    },
  },
  npm: nativePackages,
  testFixture: {
    ...fixture,
    licenseFile: {
      path: 'ispo/inference/fixtures/TINYLLAMA-15M-STORIES-MIT.txt',
      sha256: sha256(fixtureLicensePath),
    },
  },
  sourceInputs,
  licenseHashes,
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
    sourceLayout: 'clean-preset-root',
    sources: ['direct N-API adapter', 'static llama.cpp Llama family', 'static ggml CPU/Accelerate', 'static ggml Metal'],
    disabled: ['dynamic backend discovery', 'HTTP', 'RPC', 'curl', 'server', 'examples', 'tests'],
    metalShaders: 'embedded',
  },
};
const sbom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  serialNumber: 'urn:uuid:cf6d8cf5-f71a-5ee9-8cfc-2bc90bd2f65f',
  version: 1,
  metadata: {
    timestamp: '2026-01-01T00:00:00Z',
    component: {
      type: 'application',
      name: '@ispo/runanywhere-local-inference',
      version: artifactVersion,
      supplier: { name: 'ISPOai' },
      properties: [{ name: 'org.ispo.artifact.architecture', value: 'darwin-arm64' }],
    },
  },
  components: [
    {
      type: 'library',
      name: 'RunAnywhere SDK source',
      version: inputManifest.adoptedUpstream,
      licenses: [{ license: { name: 'RunAnywhere License' } }],
      properties: [{ name: 'org.ispo.role', value: 'fork-source' }],
    },
    {
      type: 'library',
      name: 'llama.cpp',
      version: inputManifest.llamaCpp.revision,
      hashes: [{ alg: 'SHA-256', content: inputManifest.llamaCpp.archiveSha256 }],
      licenses: [{ license: { id: 'MIT' } }],
      properties: [{ name: 'org.ispo.role', value: 'compiled-static-source' }],
    },
    ...nativePackages.map((component) => ({
      type: 'library',
      name: component.name,
      version: component.version,
      hashes: component.hashes,
      licenses: [{ license: { id: component.license.declared === 'MIT' ? 'MIT' : component.license.declared } }],
      properties: [{ name: 'org.ispo.role', value: component.role }],
    })),
    {
      type: 'file',
      name: fixture.name,
      version: fixture.sourceRevision,
      hashes: [{ alg: 'SHA-256', content: fixture.sha256 }],
      licenses: [{ license: { id: 'MIT' } }],
      properties: [{ name: 'org.ispo.role', value: 'test-only-fixture-not-runtime-downloadable' }],
    },
    {
      type: 'file',
      name: 'CycloneDX 1.5 schema',
      version: '1.5',
      hashes: [{ alg: 'SHA-256', content: inputManifest.cyclonedxSchema.sha256 }],
      licenses: [{ license: { id: 'Apache-2.0' } }],
      properties: [{ name: 'org.ispo.role', value: 'package-metadata-validation' }],
    },
    {
      type: 'file',
      name: 'CycloneDX SPDX companion schema',
      version: '1.5',
      hashes: [{ alg: 'SHA-256', content: inputManifest.cyclonedxSchema.spdxCompanion.sha256 }],
      licenses: [{ license: { id: 'Apache-2.0' } }],
      properties: [{ name: 'org.ispo.role', value: 'package-metadata-validation' }],
    },
    {
      type: 'file',
      name: 'CycloneDX JSON-signature companion schema',
      version: '0.82',
      hashes: [{ alg: 'SHA-256', content: inputManifest.cyclonedxSchema.jsonSignatureCompanion.sha256 }],
      licenses: [{ license: { id: 'Apache-2.0' } }],
      properties: [{ name: 'org.ispo.role', value: 'package-metadata-validation' }],
    },
  ],
};
fs.writeFileSync(path.join(metadataDirectory, 'input-manifest.json'), `${JSON.stringify(inputManifest, null, 2)}\n`);
fs.writeFileSync(path.join(metadataDirectory, 'sbom.json'), `${JSON.stringify(sbom, null, 2)}\n`);
NODE

readonly schema_path="$build_dir/bom-1.5.schema.json"
"$repo_root/ispo/inference/scripts/fetch-cyclonedx-1.5-schema.sh" "$schema_path"
node "$repo_root/ispo/inference/scripts/validate-cyclonedx-sbom.js" \
    "$schema_path" "$package_stage_dir/metadata/sbom.json" > "$package_stage_dir/metadata/sbom-validation.json"

find "$package_stage_dir" -type f -exec touch -t "$artifact_timestamp" {} +
(
    cd "$package_stage_dir"
    find . -type f ! -path './metadata/artifact-manifest.sha256' -print |
        LC_ALL=C sort |
        while IFS= read -r file; do
            shasum -a 256 "$file"
        done
) > "$package_stage_dir/metadata/artifact-manifest.sha256"
touch -t "$artifact_timestamp" "$package_stage_dir/metadata/artifact-manifest.sha256"
(
    cd "$output_dir"
    COPYFILE_DISABLE=1 LC_ALL=C TZ=UTC find "$(basename "$package_stage_dir")" -type f -print |
        LC_ALL=C sort |
        zip -X -q "$package_archive" -@
)
(
    cd "$output_dir"
    shasum -a 256 "$(basename "$package_archive")"
) > "$package_archive.sha256"
printf 'packaged %s\n' "$package_archive"
