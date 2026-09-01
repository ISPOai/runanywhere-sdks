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
| `98a0ca76a2c0d5219ce5ca11cf3eea65442d4cc0` | Changes only `bindings/electron/native/package.json` and `package-lock.json`: makes the selected private N-API source package `@ispo/runanywhere-local-inference-native@0.20.31-ispo.0`. | Closure PR review scope: manifest/lock identity and clean native `npm ci --ignore-scripts`; independent review is required before merge. | Awaiting independent PR review |
| `5b98189417b0b0ed6c84b6c5233a50976489918f` | Adds this record, the upstream-update policy, and third-party notice; does not change upstream runtime source. | Closure PR review scope: exact diff, preserved upstream license, and notice coverage; independent review is required before merge. | Awaiting independent PR review |
| `37ee854ab6b0c73b9cc6f85ddaf0d5c03a3c663e` | Resolves the Phase 0 llama.cpp tag to its source commit in this record. | Closure PR review scope: public source revision is checked against the clean configure; independent review is required before merge. | Awaiting independent PR review |
| `d2fdbfb85c41d6e0f5f8f254aee58a91ff0a3075` | Synchronizes the native package-lock header and adds the reproducibility, license, and repair-input record, including the checked Python lock. | Closure PR review scope: hash-locked Python input and public-build recipe; independent review is required before merge. | Awaiting independent PR review |
| `3205279cb974c33dc66cb226f8387ce3f34823a4` | Corrects the resolved Abseil tag and records the first clean public build evidence. | Closure PR review scope: dependency revision and fresh public configure/build evidence; independent review is required before merge. | Awaiting independent PR review |
| `106d680a217895d4a3d83b21ffe0735dda69bbb0` | Records the final Phase 0 clean-build result without changing runtime source, CMake inputs, or package-lock contents. | Closure PR review scope: build transcript, output hash, source-graph, and no-credential evidence; independent review is required before merge. | Awaiting independent PR review |
| `899364dc62d1881d2c9a9303e7c440589b8b58a1` | Repairs the verified Phase 1 portability, cache pinning, signing-default, notices/SBOM, command recipe, and event-loop cancellation findings. It pins the public llama.cpp commit archive by SHA-256, adds the fork-owned static-registry patch/audit gate, enforces macOS 14.5 and portable ARM64 compilation, and moves ad-hoc packaging behind an explicitly named development command. | Clean archive-pinned configure/build; independent timer cancellation smoke; release-identity absence gate; final packaged-binary audit remains a required independent-review gate. | Awaiting independent PR review |
| `2cd6033f41264d99f0ac0f8c560569215e5e3385` | Seals the Phase 1 inference-only preset, direct core + llama.cpp + narrow N-API adapter, static backend/source reduction patch, explicit licensed fixture helper, strict artifact audit, reproducible metadata, and fail-closed signing seam. The inherited commons, Electron facade, desktop adapter, server, downloads, telemetry, Connect, and private engines are not configured on this path. | Two clean public checkout roots built byte-identical raw linker outputs with their linker-generated ad-hoc code signatures intact; strict graph audit, licensed-fixture smoke, positive Metal, forced/injected CPU fallback, deterministic development archive, and official timestamped signing evidence are recorded below. | Awaiting independent exact-head Sol review |
| `bb81e449cc02f7c52f6e39428a1bc58bc7e701a7` | Replaces namespace-global inference ownership with Node-API environment instance data, an asynchronous environment cleanup hook, and an idempotent finalizer. Cleanup cancels and drains stream work before model unload, backend shutdown, and `InferenceCore` destruction. Adds child-process ordinary-return coverage and preserves the documented versioned directory at the root of every ZIP. | Reproduced the prior exit-134 failure, then verified initialize, load/generate, controlled-error, explicit-shutdown, and in-flight stream cleanup exits without `SIGABRT` or `std::system_error`; strict artifact audit and official signed candidate provenance are recorded below. | Awaiting independent exact-head Sol review |
| `1fe2f8f119d9bd3d457029d6f8d92cc560798706` | Introduces the Phase 1.1 internal pull stream: each host `next()` asynchronously yields no more than one bounded delta or one terminal record; cancellation, duplicate demand, abandonment, unload/reset/shutdown, and environment exit settle safely. It fixes the decode memory-slot failure by clearing the KV cache, assigning explicit positions, and stopping at the remaining context budget. It also fixes an ordinary-exit `SIGSEGV`: the cleanup hook now drains and removes its Node-API handle on the Node cleanup thread instead of a detached native thread. | Fresh public roots produced byte-identical raw linker ARM64 outputs with linker-generated ad-hoc code signatures; artifact audit, signed package, manifest/SBOM/notices verification, a 100-process initialize/ordinary-exit stress check, and five consecutive six-cycle CPU diagnostics passed. This host has no usable Metal device, so positive Metal and injected-Metal-failure fallback remain required on an eligible host. | Awaiting independent exact-head Sol review |
| `f7f3b58706e01f403078b852d8d607bcc0a6be3b` | Repairs the Phase 1.2 Metal lifecycle RSS regression without changing the sealed N-API surface. Pull demand moves from arbitrary libuv workers to one environment-owned native executor, and each Metal demand has an explicit Objective-C autorelease scope. Cleanup still cancels and drains every lease before joining that executor and releasing model/context/KV/sampler resources. It records version `0.20.31-ispo.4` and adds both new native sources to the signed input manifest. | The eligible Apple M2 Pro lane first measured 14,204,928 bytes post-warmup without the autorelease scope; the scoped focused six-cycle smoke measured 1,245,184 bytes. The required unchanged five-fresh-process/six-cycle command then passed once, including Metal, forced CPU/Accelerate, injected Metal-load fallback, pull/backpressure, lifecycle, GC, and exit assertions. Fresh public roots produced byte-identical raw linker outputs with linker-generated ad-hoc code signatures; exact signed-candidate hashes are recorded below. | Awaiting independent exact-head Sol review |
| `a63498489e185c1c765e252e8a2f7519c886479b` | Advances the private source/package identity to `0.20.31-ispo.6` and captures one typed raw-linker identity before any explicit code-sign mutation. The package input manifest, CycloneDX SBOM, staged metadata, and non-circular artifact manifest bind that one stage. | Two fresh public roots must agree on the raw linker identity; the package path rejects a missing or altered automatic linker signature rather than stripping or normalizing it. No `.6` package, tag, publication, or policy update is created by this source change. | Awaiting independent exact-head Sol review |

No upstream source logic has been modified in Phase 0. The additive
[closure PR #1](https://github.com/ISPOai/runanywhere-sdks/pull/1) contains
the repair to this ledger and is the auditable independent-review record for
all six pre-existing direct commits. Its review must identify the exact PR
head, reviewer, and verification evidence before merge; neither this ledger
nor its author claims that independent review has already happened.

## Package identity

The current Phase 1.2 package identity is the private Electron/Node N-API
source package:

| Path | ISPO package name | Version | Publication state |
| --- | --- | --- | --- |
| `bindings/electron/native` | `@ispo/runanywhere-local-inference-native` | `0.20.31-ispo.9` | private; unadmitted proposal; never publish from Phase 0/1 |
| `bindings/electron/native` | `@ispo/runanywhere-local-inference-native` | `0.20.31-ispo.10` | additive local Qwen3 source proposal; not admitted, signed, tagged, merged, or published |

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
| llama.cpp + ggml | `https://github.com/RunanywhereAI/llama.cpp.git`, immutable commit `79e2eb5eef131799ca6a2e2e342056a37a148df8`, source archive SHA-256 `67d40b994c948d6536c50a1fe613cc0e4710af2567667344011a40f4dcbe72e9` | MIT; the Phase 1 build verifies the archive hash before applying the fork-owned static-backend patch. |
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

Fresh public-checkout evidence for
`106d680a217895d4a3d83b21ffe0735dda69bbb0` is recorded below. The closure PR
reruns this exact recipe at its head after the manifest and lock repair. The
commands use a new empty scratch directory, a public HTTPS clone, and a
deliberately empty environment. Set the exact public branch name in
`head_ref`; the closure branch is `ispo/phase0-closure-review`.

```sh
scratch="$(mktemp -d /private/tmp/runanywhere-phase0-public.XXXXXX)"
public_remote="https://github.com/ISPOai/runanywhere-sdks.git"
head_ref="ispo/phase0-closure-review"
tool_path="/Users/venge/.local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
mkdir -p "$scratch/home" "$scratch/npm-cache"
env -i HOME="$scratch/home" PATH="$tool_path" LANG=C.UTF-8 \
  GIT_TERMINAL_PROMPT=0 git clone --branch "$head_ref" --single-branch \
  "$public_remote" "$scratch/repo"
repo="$scratch/repo"
cd "$repo/bindings/electron/native"
env -i HOME="$scratch/home" PATH="$tool_path" LANG=C.UTF-8 \
  npm ci --ignore-scripts --cache "$scratch/npm-cache"
cd "$repo"
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

The Phase 1.2 package layout is `ispo-local-inference-darwin-arm64-0.20.31-ispo.4/`: one native addon in `native/`, embedded Metal shaders inside that Mach-O, no third-party dylibs, notices in `notices/`, and input/SBOM/hash records in `metadata/`. The ZIP preserves that versioned directory as its top-level entry; extraction never spills `native/`, `notices/`, or `metadata/` into a desktop-signing parent. It is an input suitable for later nested desktop signing; this script signs only the native addon and never publishes a package or release.

`metadata/artifact-manifest.sha256` hashes every staged file except itself. The `.zip.sha256` is adjacent to, not inside, the archive, so the archive hash is non-circular. Secure timestamping makes an official Developer ID archive time-bearing; byte-identical reproducibility is instead proven on the raw linker output before explicit code signing and separately named ad-hoc development archive, while the official archive has deterministic layout and a strict signature gate.

### Exact Phase 1 candidate provenance

The following values are from the official candidate built from implementation
source commit `2cd6033f41264d99f0ac0f8c560569215e5e3385` on 2026-08-29. The
candidate's included `metadata/input-manifest.json` records that same commit in
`forkHead`. This ledger amendment is deliberately a later provenance-only
change: it is not represented inside that already-created archive, preventing a
self-referential archive or manifest hash. The candidate was not uploaded,
published, merged, or released.

| Candidate file / evidence | SHA-256 / exact result |
| --- | --- |
| Official archive | `947ac681252cb13ce5afe97ea3cdd2ae43f6cb1e490bb54d110660f026ba5dc8` |
| Adjacent archive SHA-256 sidecar file | `72c8d44e099e23de0322d7a03c9840eb86f65fee3c9cb10c09d4aabcc04d129e`; its sole archive value is `947ac681252cb13ce5afe97ea3cdd2ae43f6cb1e490bb54d110660f026ba5dc8` |
| Signed native addon | `2dddf2f7ad6fd969ee805461745112edc5be533192c84cdd7d3128e3e26b3199` |
| Staged artifact manifest | `5e9c4147e3127d5b3688eb7c5d0d4fb7c304ba0ea5c82685b02a27b57ec04ae3` |
| Input manifest | `172f29662ace9408b78383ad249ed65d0a37f147b8fd42aa1aba6b8bfd64c59e` |
| CycloneDX 1.5 SBOM | `6f9f8d32d579dec33e4a39bef7f4b44a9b5d4948eff765d5fc5ebd4883208cba` |
| CycloneDX schema-validation record | `5052e88a380049c5b1ff79344443d119cb998fb51d7a63e3519db21bb54c59ab` |
| Third-party notices | `127bf60484418714b6d10b30322ca15dd6a05799df4bb7fb6910e92f1c2e461e` |
| Separately shipped TinyLlama fixture MIT record | `6bd23f49b01b86435022533403437eba85c5a487c2d8fb4fef2ecf9cf7ea9586` |

The staged manifest independently records the remaining packaged notices:
RunAnywhere License `45506e9fbd89370dae9ad4b132cf6d2cc8e26322fa4d9856e26474ff7a3c5acd`,
llama.cpp MIT `94f29bbed6a22c35b992c5c6ebf0e7c92f13b836b90f36f461c9cf2f0f1d010d`,
node-addon-api MIT `89024017b88a9f2b763f79b941a4f2db3b4428edfcacdc0b23866b2da633ad0c`,
and node-api-headers MIT `a553508f516031c91f3af1148d44970cb81bbae6c4f091be6835d39cc252238c`.
The archive passed `unzip -t` and every staged file passed
`shasum -a 256 -c metadata/artifact-manifest.sha256`.

The candidate native addon passed strict verification under the explicitly
supplied `Developer ID Application: ISPO Labs, Inc (4L8CX8AY6M)` identity with
`TeamIdentifier=4L8CX8AY6M`, `flags=0x10000(runtime)`, and a secure Apple
timestamp. This signing proof does not authorize publication or merge; the
release script still exits 65 before building when `ISPO_CODESIGN_IDENTITY` is
absent.

### Lifecycle-repair candidate provenance

The following values are from the repaired official candidate built from
implementation source commit `bb81e449cc02f7c52f6e39428a1bc58bc7e701a7` on
2026-08-29. Its package root is the versioned
`ispo-local-inference-darwin-arm64-0.20.31-ispo.2/` directory. This later
ledger amendment records a non-circular candidate: it was not present in the
candidate already built from that source, and the candidate was neither
uploaded, published, merged, nor released.

| Candidate file / evidence | SHA-256 / exact result |
| --- | --- |
| Official archive | `c8b2f0cb9cad0a4638d3eafcdc698fd16ba400507346af4c632ff40f466d7ff6` |
| Adjacent archive SHA-256 sidecar file | `4ac04d0c6d2afe422598a5e6d34c650101fed0768170ea952345f5b2768f8898`; its sole archive value is `c8b2f0cb9cad0a4638d3eafcdc698fd16ba400507346af4c632ff40f466d7ff6` |
| Signed native addon | `3df5178393141f8511ded7af08d49785101d847b200bc76f155e4d0dee5835e1` |
| Staged artifact manifest | `f1d5a44cb6af6cd16f17336d94d97773461268b2ca7ff2e6ac9734a031b091db` |
| Input manifest | `a90e18c8984750e9bf197194cd3ec0e6b0093289e10a280ba861f7721a4d2e62` |
| CycloneDX 1.5 SBOM | `6f9f8d32d579dec33e4a39bef7f4b44a9b5d4948eff765d5fc5ebd4883208cba` |
| CycloneDX schema-validation record | `5052e88a380049c5b1ff79344443d119cb998fb51d7a63e3519db21bb54c59ab` |
| Third-party notices | `127bf60484418714b6d10b30322ca15dd6a05799df4bb7fb6910e92f1c2e461e` |
| Separately shipped TinyLlama fixture MIT record | `6bd23f49b01b86435022533403437eba85c5a487c2d8fb4fef2ecf9cf7ea9586` |

The repaired candidate passed `unzip -t`, complete staged
`metadata/artifact-manifest.sha256` verification, CycloneDX 1.5 schema
validation, strict arm64 artifact audit, and strict Developer ID verification
with hardened runtime and a secure Apple timestamp. Release packaging without
an explicit signing identity exited 65 before build or artifact output.

### Phase 1.2 Metal RSS repair candidate provenance

The following values are from the official Phase 1.2 candidate built from
implementation source commit `f7f3b58706e01f403078b852d8d607bcc0a6be3b`, an
additive descendant of public merged `ispo/main`
`5ab1f1f8e88946848accd151f51bebe838435387`, on 2026-08-29. Its included
`metadata/input-manifest.json` records that `forkHead`, the immutable Phase
1.1 base `70877eb0a3281ae5f5ddad0fa48d60e749746083`, and all 20 selected
source inputs, including the Objective-C++ autorelease-scope source. This
ledger amendment is deliberately a later provenance-only change: it was not
inside the already-created candidate, so none of the archive, manifest, or
signature hashes are self-referential. The candidate was not uploaded,
published, merged, or released.

| Candidate file / evidence | SHA-256 / exact result |
| --- | --- |
| Two fresh-root raw linker outputs | byte-identical: `1eab6fd6a5b5530fa2bcca1b0a01ed92fbd8bccf55e94bb15af122a99e9b63e4` |
| Official archive | `ae0b0308e3127710252ac9cd1e86f10aa71f29d960a1f7f95e398c672beecfcc` |
| Adjacent archive SHA-256 sidecar file | `807303edf4d5640c23ab87827cf1b8090f941cca386eddfa8367f074978329a8`; its sole archive value is `ae0b0308e3127710252ac9cd1e86f10aa71f29d960a1f7f95e398c672beecfcc` |
| Signed native addon | `696f935bc410b5e9f1e463237bddc74bd5c1b0c9ca86256cd1eaf46a9b0d443c` |
| Staged artifact manifest | `ca8a234982a830b6e0b96dd0ebb9080c27a3b93cc0ef993be6b38ff526d35da7` |
| Input manifest | `3d0cc94971f244d16fc58a6cc02d910255fb15a8ea84309cf360596f6e2239dc` |
| CycloneDX 1.5 SBOM | `2a9a25143367f61edf6303d20a80460bf0be3273ed1f97b97be0153f6bdd6d7c` |
| CycloneDX schema-validation record | `5052e88a380049c5b1ff79344443d119cb998fb51d7a63e3519db21bb54c59ab` |

The signed candidate passed `unzip -t`, complete staged
`metadata/artifact-manifest.sha256` verification (including every required
notice and the MIT-only test-fixture record), the strict ARM64 artifact audit,
and independent `codesign --verify --strict` validation. The explicitly
supplied Developer ID signature reports `TeamIdentifier=4L8CX8AY6M`,
`flags=0x10000(runtime)`, and a secure Apple timestamp. Release packaging
without `ISPO_CODESIGN_IDENTITY` exited 65 before artifact output.

The exact unchanged
`ISPO_SMOKE_RUNS=5 ISPO_SMOKE_CYCLES=6 run-fresh-smoke-series.sh` gate ran
once on an Apple M2 Pro Metal host. Its five post-warmup RSS plateaus were
1,638,400, 2,523,136, 819,200, 573,440, and 2,850,816 bytes, all below the
unchanged 8,388,608-byte contract. Each fresh process completed six lifecycle
cycles with positive Metal execution, forced CPU/Accelerate, injected
Metal-load fallback, stalled-consumer backpressure, cancellation/interleaving,
GC/implicit-exit, and terminal-accounting assertions. No retry wrapper was
used.

### Phase 1.1 pull-stream candidate provenance

The following values are from the official Phase 1.1 candidate built from
implementation source commit `1fe2f8f119d9bd3d457029d6f8d92cc560798706` on
2026-08-29. Its `metadata/input-manifest.json` pins both that `forkHead` and
the immutable Phase 1.1 base
`70877eb0a3281ae5f5ddad0fa48d60e749746083`. This later ledger amendment is
deliberately not included in that already-created archive, so the artifact
hashes remain non-circular. The candidate was not uploaded, published, merged,
or released.

| Candidate file / evidence | SHA-256 / exact result |
| --- | --- |
| Official archive | `4342a9d2627b5076a5279b68f464de129d311ab0ea1e57c1bbf02d7806d42a5f` |
| Adjacent archive SHA-256 sidecar file | `6f2ef890f1cadae7aec5c2ecd8436643978dac5d6aff7501f782ab657b7eca76`; its sole archive value is `4342a9d2627b5076a5279b68f464de129d311ab0ea1e57c1bbf02d7806d42a5f` |
| Signed native addon | `3381acd126e6b7aa64d64fb8524088fae9aef0d10bd677d28029c7fd4bbad93b` |
| Staged artifact manifest | `8c207d888d692ac3c914e7e6783a4ab03d6575698594529495af05c05bce580d` |
| Input manifest | `d3b2382390bdbe3083baa9586ee0a09d658251820bce37b822f8b9d146a26ba9` |
| CycloneDX 1.5 SBOM | `d0aada8f6a1b228a4a6f602685c68cc28320a4cb8c8a2661f95916c06dbb3520` |
| CycloneDX schema-validation record | `5052e88a380049c5b1ff79344443d119cb998fb51d7a63e3519db21bb54c59ab` |

The candidate passed `unzip -t`, complete staged
`metadata/artifact-manifest.sha256` verification, strict arm64 artifact audit,
and Developer ID verification with `TeamIdentifier=4L8CX8AY6M`, hardened
runtime, and a secure Apple timestamp. Release packaging without an explicit
identity exited 65 before it created an artifact. Five fresh CPU diagnostics
passed with a six-cycle RSS plateau below 8 MiB and stalled consumers that held
both token counts and generation elapsed time constant; positive Metal and the
injected Metal-failure path were intentionally not treated as passed on this
host because its Metal device probe returned null.

## Phase 1 artifact recipe and gate

The retained Phase 1.2 artifact identity is `@ispo/runanywhere-local-inference@0.20.31-ispo.4`. It is a host-internal N-API module, not an Electron preload/renderer/global surface. Its only exports are `initialize`, `capabilities`, `loadExactLocalModel`, `complete`, `stream`, `cancel`, `unload`, `metrics`, `reset`, and `shutdown`.

`stream(prompt, { maxTokens })` creates an opaque native pull-stream identity.
It has one method, `next()`, whose Promise resolves to exactly one closed result:
either `{ type: "delta", delta }` or `{ type: "terminal", finishReason,
metrics }`. There is no callback argument or push queue. The host owns demand:
no prompt evaluation or token decoding begins until the first `next()`, and a
consumer that stops demanding cannot cause additional token generation. Only
one `next()` can be active, one generation lease exists globally, and an
independently callable `cancel()` terminalizes the lease exactly once. Terminal
metrics expose prompt/output token counts, elapsed time, time-to-first-token,
decode time, backend, cancellation state, cancellation count, and a distinct
`stop`, `length`, `cancelled`, or `error` finish reason. The API never returns
native pointers, paths, raw native exceptions, credentials, URLs, or discovery
objects.

Every generation clears its KV memory and sampler before prompt evaluation,
uses explicit sequence positions, and limits output to the remaining context
budget. A request that reaches that budget returns `length`, rather than
attempting another decode and producing a memory-slot failure.

Each Node-API environment owns its own adapter state through instance data; no
namespace-static inference core survives into shared-library destruction. Its
pull demand work is marshalled from libuv's worker callback to one
environment-owned native executor. That executor is independent of the Node
event loop and places an explicit Objective-C autorelease scope around each
demand. This gives Metal temporary objects a deterministic release point and
prevents lifecycle cycles from accumulating per-worker autoreleased Metal
state. The
N-API v8 asynchronous cleanup hook runs its cancel-and-drain sequence on the
Node cleanup thread: it cancels active generation, waits for every
queued/running stream lease to finish, unloads the model, shuts down and
destroys `InferenceCore`, joins the native executor, and only then releases the
hook. It never calls
Node-API cleanup-handle removal from a detached native thread. The environment
finalizer repeats the same idempotent shutdown path after the hook, including
when initialization had failed after a partially constructed core. Explicit
`shutdown()` uses that same path and may be called repeatedly before ordinary
Node return.

The selected source slice fetches only the public llama.cpp commit `79e2eb5eef131799ca6a2e2e342056a37a148df8`, archive SHA-256 `67d40b994c948d6536c50a1fe613cc0e4710af2567667344011a40f4dcbe72e9`, and applies `llama-static-backend-registry.patch`, SHA-256 `cf94d1a767693a88d29e5f68340970452d87dc6bceb1d4bf52a17886fbcb6200`. It removes `ggml-backend-dl.cpp` from the selected target and compiles a static CPU/Accelerate/Metal registry only.

The release preset has `RAC_DESKTOP_ADAPTER=OFF`; inherited core, cloud/control-plane, telemetry, Connect, model downloads, NeuRT, QHexRT, ONNX, Sherpa, server, examples, tests, HTTP, RPC, curl, and unused engines are not configured. It embeds Metal shaders. An actual GPU backend probe plus model/context fallback decides the reported backend; an injected post-probe Metal model-load failure is a deterministic CPU/Accelerate fallback test seam.

The test-only fixture is `tinyllama-15M-stories-Q2_K.gguf`, source revision `227c5a5ad3c1a830901543cf9959c53572014a68`, SHA-256 `f7e39dc9f26f3d39bf59e885349c6eec65880f685322d591f53e6cdb46ceb2e9`. Its immutable model card has SHA-256 `904844774ca757e910ac26d8bbf550e574946ee4a72ba99b17f986a4ea75e315` and declares `license: mit`. The model-card declaration and MIT terms are preserved in `TINYLLAMA-15M-STORIES-MIT.txt`; model bytes are explicit test input only, never a runtime download or model-admission decision.

The package validates generated CycloneDX 1.5 SBOMs with the official schema tag `1.5`, commit `c320fc0f0b46873864927d9d5684eea7ba439728`: BOM SHA-256 `067f7824b08653839ea050ae9e09ca48375eadc2652b0e2a299476e7db90335b`, SPDX companion SHA-256 `4f6e2b05c05d26a4f2dc5879fbc2fca94b0a28db46289d0c51345621b71cfbfc`, and JSON-signature companion SHA-256 `8bae002c25e723db7ee1f26afde680ae1a2b1a8f6b4b4b0fd65dc3becb090aae`. Schema/test dependencies, every compiled/runtime/test input, and license hashes are recorded in `metadata/input-manifest.json`. CycloneDX components use supported `hashes` and `properties`, never npm-only `integrity`.

For the retained Phase 1.2 evidence, run the following in two independent scratch roots and compare the raw linker-output hashes:

```sh
public_remote="https://github.com/ISPOai/runanywhere-sdks.git"
head_ref="ispo/phase1-2-metal-rss"
for root in /private/tmp/ispo-phase1-a /private/tmp/ispo-phase1-b; do
  git clone --branch "$head_ref" --single-branch "$public_remote" "$root"
  (cd "$root/bindings/electron/native" &&
    npm ci --ignore-scripts --cache /private/tmp/ispo-phase1-npm-cache)
  (
    cd "$root"
    cmake --preset ispo-darwin-arm64-inference-release --fresh
    cmake --build --preset ispo-darwin-arm64-inference-release --parallel 4
    ./ispo/inference/scripts/audit-artifact.sh \
      "$root/build/ispo-darwin-arm64-inference-release/ispo/inference/ispo_local_inference_native.node"
    ./ispo/inference/scripts/fetch-smoke-fixture.sh \
      /private/tmp/ispo-fixtures/tinyllama-15M-stories-Q2_K.gguf
    ISPO_SMOKE_RUNS=5 ISPO_SMOKE_CYCLES=6 \
      ./ispo/inference/scripts/run-fresh-smoke-series.sh \
      "$root/build/ispo-darwin-arm64-inference-release/ispo/inference/ispo_local_inference_native.node" \
      /private/tmp/ispo-fixtures/tinyllama-15M-stories-Q2_K.gguf
  )
done
cmp \
  /private/tmp/ispo-phase1-a/build/ispo-darwin-arm64-inference-release/ispo/inference/ispo_local_inference_native.node \
  /private/tmp/ispo-phase1-b/build/ispo-darwin-arm64-inference-release/ispo/inference/ispo_local_inference_native.node
```

The smoke gate has no retry-on-failure wrapper: five fresh processes each run
six full lifecycle cycles. It proves closed pull result shapes; zero additional
output tokens and bounded RSS while a consumer stalls after one delta;
deterministic resume; cancel before first demand; cancel while `next()` is
pending; rejected duplicate `next()`; unload/reset/shutdown during a pending
`next()`; stream abandonment/GC; and implicit Node exit. It also proves
controlled JavaScript errors for URL, relative, missing, wrong-extension,
unloaded, duplicate, cancellation, and shutdown cases; deterministic
complete/stream token deltas and terminal metrics; repeated
load/generate/cancel/unload/reset; bounded post-warmup RSS; positive Metal
generation; explicit forced CPU/Accelerate; and injected Metal-failure
fallback. Every child must exit zero without `SIGABRT` or `std::system_error`
output.

For a separately named ad-hoc development artifact only:

```sh
ISPO_ARTIFACT_OUTPUT=/private/tmp/ispo-phase1-2-development \
  ./ispo/inference/scripts/package-development-darwin-arm64.sh
unzip -Z1 /private/tmp/ispo-phase1-2-development/ispo-local-inference-darwin-arm64-0.20.31-ispo.4-development.zip | \
  grep -E '^ispo-local-inference-darwin-arm64-0.20.31-ispo.4-development/(metadata|native|notices)/'
```

For an official release candidate, an explicitly supplied Developer ID identity is mandatory. The release script fails before build/output creation when absent, signs with `--timestamp --options runtime`, requires a TeamIdentifier, hardened-runtime flag, strict verification, and a secure timestamp, and has no ad-hoc fallback:

```sh
ISPO_ARTIFACT_OUTPUT=/private/tmp/ispo-phase1-2-release \
ISPO_CODESIGN_IDENTITY='Developer ID Application: ISPO Labs, Inc (4L8CX8AY6M)' \
  ./ispo/inference/scripts/package-darwin-arm64.sh
```

The archive contains the addon, notices, model-license record, CycloneDX SBOM, SBOM-validation record, pinned input manifest, and non-circular artifact manifest. Do not merge until an independent exact-head review records the final refs and repeats these gates.

## 0.20.31-ispo.6 canonical pre-explicit-sign proposal

This is an additive, unadmitted source/provenance proposal based exactly on
reviewed public `ispo/main` commit
`04273588a9c03088bf0e5438b0a0cc7f9d9aa6df`. It does not merge, rebase, or
otherwise incorporate unadmitted PR #5 (`0417a33bf59657ccae62226167bb95d9655dce16`).
The retained `.4` archive, policy, and historical hashes above remain unchanged.

The one canonical pre-explicit-sign identity is the SHA-256 of
`native/ispo_local_inference_native.node` immediately after the selected CMake
link step and before either `codesign --force --sign -` or Developer ID
`codesign --force --sign <identity> --timestamp --options runtime` can mutate
it. It is deliberately **not** called unsigned: Darwin's linker has already
emitted an embedded `LC_CODE_SIGNATURE` with
`flags=0x20002(adhoc,linker-signed)`, `Signature=adhoc`, and no TeamIdentifier.
The package script validates that exact signature state and writes a closed
identity record before explicit signing; after signing, it stages that record
as `metadata/canonical-pre-explicit-sign-identity.json` and copies it into
`metadata/input-manifest.json` and CycloneDX root-component properties. The
non-circular artifact manifest then hashes that metadata file along with the
final signed native addon. All license and notice files remain exclusively under
`notices/`; SBOM and input/provenance records remain under `metadata/`.

The raw linker identity recorded for this reviewed source is
`1eab6fd6a5b5530fa2bcca1b0a01ed92fbd8bccf55e94bb15af122a99e9b63e4`.
Two independent public roots built that byte-identical file with the same
AppleClang 17 / Xcode 26.2 / CMake 4.4.3 / Node 26 toolchain under isolated
HOME, temporary, npm-cache, and proxy-free inputs. On a disposable copy of
that raw file, the linker record had `LC_CODE_SIGNATURE` at offset `3492656`,
size `27440`, and CodeDirectory `v=20400 size=27417
flags=0x20002(adhoc,linker-signed) hashes=853+0`. Explicit ad-hoc signing
rewrote it to `LC_CODE_SIGNATURE` size `25120`, CodeDirectory `v=20400
size=7056 flags=0x2(adhoc) hashes=214+2`, and hash
`76b8df31b345f1f432ba2c562248c259f6181f6830393849c05b920ff76fb1a9`.
Removing that explicit signature removed the code-signature load command and
produced `d797f559216a0beb7f5533acd0889dedcf0bf0aea374bc622f9d8682cf1ce166`.
Neither transformed copy is the canonical linker identity. A separate
Developer ID test copy, signed with installed identity
`E3CD340EA811F8566A79463CAA0D30AD7A47A231`, rewrote the command to size
`25248`, CodeDirectory `v=20500 size=7032 flags=0x10000(runtime)
hashes=214+2`, TeamIdentifier `4L8CX8AY6M`, and a secure timestamp; its hash
was `c5b8a8d1295888edf47631786caac155038400f2637ecdad008cbdb66d0cde09`.
It was not packaged, tagged, or published.

The distinct PR #5 source produced raw linker output
`0dea7c3087cbefa66730171378dbb3b57c2ed79011971066ab19586a965f80c2`.
Its `487311947361df9bede395a68898d821e9f93bfaf1921c47cf432a20d8a07470`
value was obtained only after an explicit ad-hoc signature was removed from a
packaged addon. It is therefore a signature-removal derivative, not raw linker
output, and is intentionally absent from the `.6` identity record.

The unchanged five-fresh-process, six-cycle smoke must run once in an approved
unsandboxed Metal host lane with isolated HOME, temporary, network, and cache
inputs. It must not use `ISPO_SMOKE_ALLOW_CPU_ONLY`, a CPU-only override, or a
retry wrapper. The pinned TinyLlama fixture remains a test-only input outside
the repository/package and is usable only after its helper verifies the pinned
MIT model-card and model-file hashes.

## 0.20.31-ispo.7 executor-quiescence repair proposal

This additive, unadmitted `.7` proposal descends from the `.6` pre-explicit-
sign proposal without rewriting it. It repairs the executor handoff that let a
pull result become observable after the request result was written but before
the dedicated executor had returned to its condition-variable wait boundary.
Each request now carries an executor-quiescent acknowledgement; the waiting
`next()` work does not complete until both the result and that acknowledgement
are present. The acknowledgement is set while the executor retains its mutex
and immediately re-enters the wait loop, so a caller cannot baseline RSS in
the post-demand settlement window.

`ISPO_INFERENCE_TESTING` is an explicit test-build-only CMake option. It adds a
model-free native barrier probe that pauses the executor after result
publication. The focused test proves that the pending operation remains
unsettled until the barrier is released and the quiescence acknowledgement is
published. The release preset leaves the option unset; package assembly checks
the unchanged closed production export set and records the test source as an
input with test-only hooks disabled.

No `.7` archive, tag, policy update, catalog admission, publication, merge, or
independent review is claimed by this source change. Its single canonical raw
pre-explicit-sign identity may be recorded only after two fresh isolated public
roots reproduce the linker-generated ad-hoc output byte-for-byte. The required
unsandboxed five-by-six Metal smoke remains a one-time post-repair gate, not a
retry of `.6`.

## 0.20.31-ispo.8 post-autorelease settlement repair proposal

This additive, unadmitted `.8` proposal descends from the `.7` executor-
quiescence proposal without rewriting it. A pull demand now calls
`llama_synchronize()` for an active Metal context while holding the core
lifecycle lock, then exits its per-demand Objective-C autorelease scope before
the executor publishes the existing quiescent acknowledgement. The selected
llama API waits for queued backend computation, so result publication cannot
race a still-settling Metal command path or a live per-demand autorelease pool.
CPU/Accelerate keeps its existing path because there is no Metal backend to
synchronize.

The test-only barrier now sits immediately after the actual autorelease scope,
before the executor can store the result or acknowledge it to the pending
`next()` worker. Its model-free probe executes that same scope helper with a
closed terminal stream, proving a Promise stays pending before the boundary,
after cancellation/reset, and until explicit release. A second probe proves
ordinary shutdown releases and drains the boundary before the executor joins.
The release build still has no test exports; package assembly checks the exact
sorted production export set and self-tests exact, missing, and extra sets.

No `.8` archive, signing, tag, policy update, catalog admission, publication,
merge, or independent review is claimed by this source change. The required
unsandboxed five-by-six Metal smoke remains a one-time post-repair gate and is
not run by this source proposal.

### `.8` raw linker reproduction

The post-autorelease implementation source is public commit
`1a0a0f256b0ff337e18b1b243f8d930ce1573d6c` on
`ispo/phase1-5-native-settlement`, descended from reviewed `.7` commit
`eeb7b762204cd3c57eedc64161b34b2ae6e82cda`. Two fresh isolated public
HTTPS-clone roots checked out that implementation commit, installed the native
package with `npm ci --ignore-scripts` under separate empty HOME and npm-cache
directories, and built the release native target with separate temporary
directories. Neither build invoked an explicit code-sign mutation, packaging,
or smoke fixture.

The two linker outputs were byte-identical at SHA-256
`b86960c26b317f1bdfd16155fd18564ed880079024d21c19f54b4faaa40c7cae`.
Each output passed `codesign --verify --strict`; `codesign -dvv` reported the
linker-generated `Signature=adhoc`, `flags=0x20002(adhoc,linker-signed)`, and
no TeamIdentifier. The compiled source objects were also byte-identical across
both roots:

| Object | SHA-256 |
| --- | --- |
| `native/addon.cpp.o` | `63c2913402dcb3fcd11ff42a20f38ef7d506ff55ade4000cac1e08f5924ac71a` |
| `native/metal-executor-scope.mm.o` | `617ebf32d1806396573d275ad2a18ec11725bd1be0600f0f7dd1f2d845c3120e` |
| `core/inference_core.cpp.o` | `c63f11416f8e965ebda17ad04a44291139c605a2f3fa9ea941e376ca3f1a8fea` |

The enclosing Darwin static archive is not an identity input: its sole compiled
member was byte-identical, while its `__.SYMDEF SORTED` and member headers carry
the archive creation time. This later provenance-only record creates no
archive, signing result, publication, tag, or admission claim.

## 0.20.31-ispo.9 static Metal residency-set repair proposal

This additive, unadmitted `.9` proposal descends from the `.8` post-
autorelease-settlement proposal without rewriting it. The sealed static-only
build had already compiled out the residency-set worker body and dummy work,
but Metal device initialization still selected residency sets on eligible Apple
GPUs. That selection allocated the residency collection, its Objective-C
objects, and a dispatch group with a global-queue task whose lifetime belongs
to the global Metal device rather than to a demand context. `llama_synchronize()`
correctly settles a demand context's command buffers, but cannot join that
device-owned task.

The `.9` static-only patch prevents Metal device initialization from selecting
residency sets. It therefore never enters `ggml_metal_rsets_init()` in this
sealed build and retains no residency collection or background dispatch group
after initialization. It preserves the compiled Metal backend, the existing
per-demand `llama_synchronize()` and post-autorelease acknowledgement order,
one-core-`next()` pull semantics, cancellation, lifecycle ordering, and the
closed production export surface.

`ISPO_INFERENCE_TESTING` now adds a test-only query of the initialized Metal
device property. On an eligible host it requires a positive Metal probe and
proves static initialization leaves residency sets disabled; it loads no model
and performs no prompt, decode, or token work. The release build leaves this
query and every test export disabled, while package assembly records the test
source in the signed input manifest and continues to verify the exact
production exports.

No `.9` admission matrix, archive, explicit signing, tag, policy update,
catalog admission, publication, merge, or independent review is claimed by
this source proposal. The authorized five-by-six matrices remain unconsumed
and may run only once each after independent raw-linker reproduction of the
exact `.9` head.

## 0.20.31-ispo.9 signed-candidate review provenance

This later provenance-only record binds the signed candidate back to the
unchanged `.9` implementation commit
`3eed9521811a54b2690d1b890b06cf879243fbfc`, whose parent is the accepted
`.8` head `04dcc0e2b4614145b24020c95fde4fe3301936ea`. It changes no runtime,
native, packaging, or test source and is intentionally outside the candidate
whose already-created input manifest names the implementation commit. The
separate review head therefore records non-circular evidence without changing
any candidate input.

| Evidence | SHA-256 |
| --- | --- |
| Raw linker addon before explicit signing | `8dc813f26991fbbd42ceda2ed9b39e75364dd614ed16b666bcc6c820631bea20` |
| Signed candidate archive | `3361967b4f60eaf91860fc1c611d1d368bba127a0bfd5827bd83c792d2fac47c` |
| Adjacent archive-checksum file | `845f0bf934b412f704a75ea1f0a8adc9152d1d7af697d9680d0b1f778719560c` |
| Signed native addon | `e26a2b652094e52338dff96753dc7b25bacee4d3cf239f263fe275347cee0344` |
| Artifact manifest | `27631a9697047e94e579b5f858010000ad561a1374992f4928d1b8005db4d9dc` |
| Input manifest | `dc71c74c3cb223a43a6e2bb8681fabdf627f2be9cefac93e5432bf31acb949b7` |
| CycloneDX SBOM | `45ee77d44ec2d879e4b15c15c76622af6a300b6134abf0103b7c112fbc4caaed` |
| SBOM validation receipt | `5052e88a380049c5b1ff79344443d119cb998fb51d7a63e3519db21bb54c59ab` |
| Terra five-by-six matrix log | `3b5a5b188d54af49270457f87c3ff61c024d69a97ed4a72e50da5e640de85133` |
| Sol five-by-six matrix log | `ce89cb85e5151e739b35547be195838f04eaa17ba0fe06eb917f8fa7a7f4b7d1` |

The exact signed addon carries hardened-runtime Developer ID Application
signing for Team `4L8CX8AY6M` with a secure timestamp. Independent review
verified its macOS 14.5 floor, sealed system-only graph, sole global N-API
export, exact production property set, complete non-circular manifests, SBOM,
notices, and absence of model weights. All five fresh Terra processes and all
five fresh Sol processes passed positive Metal, CPU/Accelerate, injected Metal
load fallback, pull/backpressure, cancellation, lifecycle, GC, and exit checks;
stalled growth stayed at or below 49,152 bytes and plateau growth stayed at or
below 3,457,024 bytes.

The independent signed-artifact review passed before any governance binding.
This amendment itself creates no tag or ruleset, updates no host policy, merges
or publishes no release, downloads no model, runs no E2E test, and mutates no
live application.

## 0.20.31-ispo.10 Qwen3 architecture-support proposal

This additive local proposal starts from the public
`ispo/v0.20.31-ispo.9` source tag and leaves the `.9` implementation,
provenance, archive, signed addon, and rollback record unchanged. It exists
because the exact retained Qwen3 GGUF reaches llama.cpp metadata dispatch on
`.9` and fails before backend selection with an unsupported `qwen3`
architecture. It is not a prompt, template, context, generation, lifecycle,
or Metal fallback result.

The smallest verified upstream support boundary is the signed llama.cpp source
commit `d3bd7193ba66c15963fd1c59448f22019a8caf6e` (`b5092`, “llama : Support
Qwen3 and Qwen3MoE”). Its immutable RunAnywhere archive is
`d086756e37fda7fff0d671d8106601232258d6f95384d04bf69b126445ad201d`; the
selected source `LICENSE` remains MIT with SHA-256
`e562a2ddfaf8280537795ac5ecd34e3012b6582a147ef69ba6a6a5c08c84757d`.
The preceding source revision has no Qwen3 architecture entry, tensor map, or
graph builder. The proposal therefore upgrades the closed dependency rather
than adding an ISPO-owned architecture shim.

The fork-owned static sealing patch is rebased to that exact source. It retains
the closed compiled CPU/Accelerate and Metal registry, rejects dynamic backend
loads, excludes filesystem/environment discovery from the sealed path,
disables Metal residency sets, limits architecture dispatch to Qwen3, and
removes dormant transport and repository strings from that map. The update
adapts only genuine upstream API changes: it uses the b5092 KV-clear API and
does not assign a context option that b5092 does not expose. The one-demand,
one-token pull executor, independent cancellation, post-backend and
post-autorelease settlement, lifecycle teardown, production exports, macOS
14.5 floor, and direct N-API boundary remain unchanged.

The core now obtains the loaded model's compiled chat template through
llama.cpp, renders one bounded user message with the assistant generation
prompt, and tokenizes that result. A test-only hook and the bounded Qwen3
conformance helper require the exact single-user ChatML form, 2048-token
context admission, actual bounded completion, and unload/shutdown cleanup.
The helper records only a bounded result category, context count, backend
category, and completion byte count; it records no model location, source
identity, credential, or backend handle. Its model-free contract test rejects
template changes and verifies cleanup on failure.

Before the final Qwen3 matrix loads either addon, it re-hashes an immutable
pre-matrix receipt from exactly two fresh public roots. That receipt binds the
production, raw, and test addons; direct objects; static archives; source and
review heads; upstream archive, license, and patch; matrix script; exact
canonical GGUF; immutable Apache-2.0 license text; context/backend limits; and
the raw linker's LC_UUID and CodeDirectory evidence. It also records the
canonical toolchain, normalized final link-command identity, and a sealed
environment declaration (empty isolated home/cache and no proxy, Hub token, or
local llama.cpp override). It retains bounded relative build paths only, never
a model location, URL, credential, native handle, or user-store path.

The historical raw divergence was caused by the final Darwin linker `-o`
spelling, not archive-member headers: a basename-only Make-style output yields
the historical raw identity while Ninja's
`ispo/inference/ispo_local_inference_native.node` output yields the canonical
identity. Archive normalization remains required canonical-provenance work,
but is not evidence of the raw linker input. The producer therefore rejects
non-Ninja generators and requires the canonical preset and final output-path
form before admitting the content-derived LC_UUID or CodeDirectory. The matrix
also independently rejects changed source, model, license, production/raw/test
addon, signed-addon state, raw-linker producer, pre-matrix receipt,
matrix-script, context, and backend evidence before any native load.

The package producer carries the same source head and canonical producer
identity in the raw-linker identity, input manifest, and SBOM property so a
later signed candidate cannot relabel a raw result from another source or
producer.

The `.10` package inputs now name the new immutable source and helper tests;
the SBOM's llama.cpp component follows the same archive receipt and the notice
bundle retains the selected MIT text. The former Llama-only smoke-fixture
metadata and notice are not staged for `.10`. Package staging rejects named
model-weight extensions and leading GGUF/ggml signatures before manifests or
archives are emitted. No model bytes, model download capability, model URL,
or model license text is added to source, native code, package input, SBOM, or
artifact.

This record proves only a local source proposal and focused build/test work.
It claims no Terra or Sol final conformance matrix, signature, archive, tag,
policy binding, catalog descriptor, application package, merge, publication,
or E2E execution. Those gates remain separate exact-head work after two fresh
isolated public-root raw-artifact reproductions.
