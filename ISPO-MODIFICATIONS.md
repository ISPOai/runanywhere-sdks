# ISPO modifications and provenance

This repository is an ISPO-maintained downstream fork of
`RunanywhereAI/runanywhere-sdks`. It retains the complete upstream `LICENSE`,
all upstream copyright notices, and the upstream licensing conditions. This
document is the required modification notice under the upstream license; it is
not a replacement license and does not grant any RunAnywhere trademark rights.

## Adoption record

| Field | Value |
| --- | --- |
| Upstream repository | `https://github.com/RunanywhereAI/runanywhere-sdks.git` |
| Adopted source commit | `00e879fa818111054c02c8ad1f1a0398a4738f92` |
| Upstream source label | `v0.20.31` |
| ISPO adoption tag | `ispo/upstream-00e879fa818111054c02c8ad1f1a0398a4738f92` |
| Downstream integration branch | `ispo/main` |
| Fork owner | `ISPOai` |
| Eligibility attestation | ISPO confirmed current gross annual revenue of `$0` when adopting this source. Reconfirm the upstream RunAnywhere License eligibility before each release or revenue/funding threshold transition. |

The adoption tag is an annotated provenance tag. ISPO policy treats an adoption
tag as immutable: do not move, replace, or delete it. Correct an error with a
new tag and an explicit supersession record.

## Phase 0 source boundary

The intended public source slice is only the C++ commons, the llama.cpp engine,
the CPU runtime, and the Electron/Node N-API addon on Darwin ARM64. The source
may be inspected and built as a public-source proof in Phase 0, but no runtime
artifact is shipped by this phase.

The following components are excluded from ISPO's Phase 0/1 artifact and must
not be fetched, bundled, or treated as build prerequisites:

- private NeuRT/Apple Neural Engine packages and overlays;
- QHexRT, QAIRT, Hexagon DSP assets, and private engine packs;
- vendor-only runners, release assets, control-plane services, LAN Connect,
  telemetry/auth transports, cloud services, and automatic download paths;
- ONNX, Sherpa, CoreML/MLX, image generation, and every non-Electron SDK
  surface.

This is a prerequisite and shipment boundary, not a claim about every source
file compiled by the inherited upstream target. The Phase 0 proof still
compiles dormant public download/Hugging Face-cache code, cloud-STT code, and
HF-token setter APIs from the selected upstream core. They neither fetched nor
required a token, control-plane URL, private engine pack, or vendor-only
runner in the clean build. They are not shipped by Phase 0; source reduction
and runtime sealing are explicitly Phase 1 work.

## Downstream patch ledger

| Patch / commit | Purpose and reviewed delta | Reviewer / evidence | Status |
| --- | --- | --- |
| `98a0ca76a2c0d5219ce5ca11cf3eea65442d4cc0` | Changes only `bindings/electron/native/package.json` and `package-lock.json`: makes the selected private N-API source package `@ispo/runanywhere-local-inference-native@0.20.31-ispo.0`. | Phase 0 repair-owner review: `git show --stat`, manifest/lock identity check, and clean `npm ci --ignore-scripts`; no associated GitHub pull request exists. | Reviewed direct downstream commit |
| `5b98189417b0b0ed6c84b6c5233a50976489918f` | Adds this record, the upstream-update policy, and third-party notice; does not change upstream runtime source. | Phase 0 repair-owner review: exact diff audit, license comparison, and public-build record; no associated GitHub pull request exists. | Reviewed direct downstream commit |
| `37ee854ab6b0c73b9cc6f85ddaf0d5c03a3c663e` | Resolves the Phase 0 llama.cpp tag to its source commit in this record. | Phase 0 repair-owner review: `git ls-remote`/fresh configure resolved the recorded commit; no associated GitHub pull request exists. | Reviewed direct downstream commit |
| `d2fdbfb85c41d6e0f5f8f254aee58a91ff0a3075` | Synchronizes the native package-lock header and adds the complete reproducibility, license, and repair-input record, including the checked Python lock. | Phase 0 repair-owner review: clean-checkout verification commands and outputs recorded below. | Reviewed direct downstream commit |
| `3205279cb974c33dc66cb226f8387ce3f34823a4` | Corrects the resolved Abseil tag and records the first clean public build evidence. | Phase 0 repair-owner review: fresh public-clone configure/build, dependency revision audit, and no-credential check. | Reviewed direct downstream commit |
| Phase 1 runtime patch set | Inference-only CMake preset, source reduction, sealing, packaging. | Not yet produced. | Phase 1 owns it |

No upstream source logic has been modified in Phase 0. This ledger must name
each downstream commit, its purpose, and the reviewed upstream delta before it
is merged to `ispo/main`.

## Package identity

The only package identity established in Phase 0 is the private Electron/Node
N-API source package:

| Path | ISPO package name | Version | Publication state |
| --- | --- | --- | --- |
| `bindings/electron/native` | `@ispo/runanywhere-local-inference-native` | `0.20.31-ispo.0` | private; never publish from Phase 0 |

The future host-private runtime artifact is reserved as
`@ispo/runanywhere-local-inference` with an ISPO prerelease or release version
derived from this adopted source. It must not use an `@runanywhere/*` package
name, peer dependency, registry range, or unpinned upstream tarball. The
broader Electron facade is intentionally not renamed in Phase 0 because it is
not part of the selected shipped slice; Phase 1 must complete that migration
before producing any package or artifact.

## Pinned inputs and build flags

The git object IDs below are immutable source-content identities. Release and
package assets additionally record their delivery URL and SHA-256/SRI. This
ledger covers the dependencies actually fetched or selected by the Darwin
ARM64 Phase 0 configure; it is not a shipping bill of materials.

| Input | Immutable origin and resolved identity | License / integrity |
| --- | --- | --- |
| RunAnywhere source | `https://github.com/RunanywhereAI/runanywhere-sdks.git` commit `00e879fa818111054c02c8ad1f1a0398a4738f92` | Root `LICENSE` SHA-256 `45506e9fbd89370dae9ad4b132cf6d2cc8e26322fa4d9856e26474ff7a3c5acd` |
| llama.cpp + ggml | `https://github.com/RunanywhereAI/llama.cpp.git`, mutable compatibility tag `runanywhere-b10453.4` resolved to commit `79e2eb5eef131799ca6a2e2e342056a37a148df8` | MIT; preserve its license/notices |
| Abseil | `https://github.com/abseil/abseil-cpp.git` tag `20260107.1` resolved to commit `255c84dadd029fd8ad25c5efb5933e47beaa00c7` | Apache-2.0 |
| protobuf C++ | `https://github.com/protocolbuffers/protobuf.git` tag `v35.1` resolved to commit `35cd01f9fe9afbeea38cc7b979a3b6bfcde82c03` | BSD-3-Clause |
| nlohmann/json | `https://github.com/nlohmann/json.git` tag `v3.12.0` resolved to commit `55f93686c01528224f448c19128836e7df245f72` | MIT |
| libarchive | `https://github.com/libarchive/libarchive.git` tag `v3.8.7` resolved to commit `ded82291ab41d5e355831b96b0e1ff49e24d8939` | BSD-2-Clause |
| protoc codegen archive | `https://github.com/protocolbuffers/protobuf/releases/download/v35.1/protoc-35.1-osx-aarch_64.zip` | SHA-256 `193289af0470c6a1aada357d4fba0bbf8d78bfaac8b5e42ca30af2ef75583de2`; BSD-3-Clause |
| Python codegen lock | `docs/phase0-pyproto-requirements-darwin-arm64-py314.txt`: `protobuf==6.33.0` and `PyYAML==6.0.3`, installed only with `--require-hashes` | protobuf BSD-3-Clause wheel SHA-256 `905b07a65f1a4b72412314082c7dbfae91a9e8b68a0cc1577515f8df58ecf455`; PyYAML MIT wheel SHA-256 `34d5fcd24b8445fadc33f9cf348c1047101756fd760b4dacb5c3e99755703310` |
| Node N-API source dependencies | npm registry assets in `bindings/electron/native/package-lock.json`: `node-addon-api@8.9.0`, `node-api-headers@1.9.0` | MIT; npm SRI is committed in that lockfile |
| Electron source dependency lock | Electron `43.1.1`; TypeScript `5.9.3` from `bindings/electron/package-lock.json` | Lockfile SRI is the source of integrity; neither is built or shipped in this slice |
| System libraries | Apple SDK from Xcode `26.2 (17C52)` supplied system zlib and BZip2; no zlib/BZip2 source archive was fetched | Apple SDK/Xcode terms apply |

The exact proof toolchain was Python `3.14.2`, pip `25.3`, Node `v22.23.1`,
npm `10.9.8`, CMake `4.4.3`, Ninja `1.13.2`, and Xcode `26.2 (17C52)` on
Darwin ARM64. The source tree's `core/VERSIONS` also pins `PROTOC_VERSION=35.1`
and `PYTHON_PROTOBUF_VERSION=6.33`; the Phase 0 lock makes the otherwise
range-based bootstrap deterministic for this proof.

The complete effective CMake cache settings are:

```text
CMAKE_BUILD_TYPE=Release
CMAKE_OSX_ARCHITECTURES=arm64
RAC_BUILD_BACKENDS=ON RAC_BACKEND_LLAMACPP=ON
RAC_BACKEND_ONNX=OFF RAC_BACKEND_SHERPA=OFF RAC_BACKEND_CLOUD=OFF
RAC_BACKEND_MLX=OFF RAC_BACKEND_NEURT=OFF RAC_BACKEND_QHEXRT=OFF
RAC_RUNTIME_COREML=OFF RAC_RUNTIME_ONNXRT=OFF
RAC_BUILD_ELECTRON_ADDON=ON RAC_ELECTRON_THIN_ADDON=OFF
RAC_DESKTOP_ADAPTER=OFF RAC_BUILD_SERVER=OFF RAC_BUILD_PLATFORM=OFF
RAC_BACKEND_RAG=OFF RAC_STATIC_PLUGINS=ON GGML_METAL=OFF
RAC_GPU_VULKAN=OFF RAC_BUILD_TESTS=OFF RAC_BUILD_SHARED=OFF
RAC_BUILD_JNI=OFF RAC_BUILD_PLUGIN_SMOKE=OFF
RAC_BUILD_ELECTRON_HARNESS=OFF RAC_BUILD_PYTHON_MODULE=OFF
```

These proof flags are not the Phase 1 hardened CMake preset. Phase 1 owns the
shipping preset, Metal enablement, resource packaging, and sealed-runtime
settings.

## Phase 0 public build evidence

Fresh public checkout evidence for
`3205279cb974c33dc66cb226f8387ce3f34823a4` is recorded below. This head
contains the package-lock repair and checked Python lock; the follow-up
documentation record does not alter CMake, source, or package-lock inputs. The
commands were:

```sh
env -i HOME="$scratch/home" PATH="$tool_path" LANG=C.UTF-8 \
  python3 -m venv "$scratch/phase0-python"
env -i HOME="$scratch/home" PATH="$tool_path" LANG=C.UTF-8 \
  "$scratch/phase0-python/bin/python" -m pip install --require-hashes \
  --only-binary=:all: -r docs/phase0-pyproto-requirements-darwin-arm64-py314.txt
env -i HOME="$scratch/home" PATH="$tool_path" LANG=C.UTF-8 \
  RAC_PYTHON="$scratch/phase0-python/bin/python" RAC_PY_NO_INSTALL=1 \
  cmake -S . -B build/phase0-public-selected -G Ninja \
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_OSX_ARCHITECTURES=arm64 \
  -DRAC_BUILD_BACKENDS=ON -DRAC_BACKEND_LLAMACPP=ON \
  -DRAC_BACKEND_ONNX=OFF -DRAC_BACKEND_SHERPA=OFF \
  -DRAC_BACKEND_CLOUD=OFF -DRAC_BACKEND_MLX=OFF \
  -DRAC_BACKEND_NEURT=OFF -DRAC_BACKEND_QHEXRT=OFF \
  -DRAC_RUNTIME_COREML=OFF -DRAC_RUNTIME_ONNXRT=OFF \
  -DRAC_BUILD_ELECTRON_ADDON=ON -DRAC_ELECTRON_THIN_ADDON=OFF \
  -DRAC_DESKTOP_ADAPTER=OFF -DRAC_BUILD_SERVER=OFF \
  -DRAC_BUILD_PLATFORM=OFF -DRAC_BACKEND_RAG=OFF \
  -DRAC_STATIC_PLUGINS=ON -DGGML_METAL=OFF -DRAC_GPU_VULKAN=OFF \
  -DRAC_BUILD_TESTS=OFF -DRAC_BUILD_SHARED=OFF -DRAC_BUILD_JNI=OFF \
  -DRAC_BUILD_PLUGIN_SMOKE=OFF -DRAC_BUILD_ELECTRON_HARNESS=OFF \
  -DRAC_BUILD_PYTHON_MODULE=OFF
env -i HOME="$scratch/home" PATH="$tool_path" LANG=C.UTF-8 \
  cmake --build build/phase0-public-selected --target runanywhere_native --parallel 4
```

`runanywhere_native.node` is non-shipped verification output. Its hash is a
per-run evidence value, not a Phase 1 artifact hash; binary identity is **not
expected to reproduce across checkout/build paths** because the inherited
upstream build embeds path-dependent metadata. The exact fresh-run hash and
the path-dependence observation are: Mach-O arm64 SHA-256
`08e19562ae3347de0354dce23469bec1df7140903a1b9c4c279c715adc3d9f22`, with
`/private/tmp/runanywhere-phase0-final.Gy2GDp` paths present in the binary.
The bounded `--parallel 4` build passed.
The only reported warnings were upstream third-party compiler/deprecation
warnings and the final duplicate-library linker warning; there were no build
errors. `compile_commands.json` contained no NeuRT, QHexRT, QAIRT, ONNX,
Sherpa, MLX, CoreML, or ONNX-runtime source paths, but did contain the dormant
download/HF-cache/cloud paths described above.

## Shipped artifacts

| Artifact | SHA-256 | Status |
| --- | --- | --- |
| Darwin ARM64 native addon | Pending — not yet produced; Phase 1 owns the artifact | Not shipped |
| Darwin ARM64 runtime libraries | Pending — not yet produced; Phase 1 owns the artifact | Not shipped |
| Embedded Metal resources | Pending — not yet produced; Phase 1 owns the artifact | Not shipped |
| Artifact manifest | Pending — not yet produced; Phase 1 owns the artifact | Not shipped |

Before any artifact is released, replace each pending entry with the exact
input pin, output filename, SHA-256, build command, and verification result.
