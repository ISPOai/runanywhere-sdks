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
| `2cd6033f41264d99f0ac0f8c560569215e5e3385` | Seals the Phase 1 inference-only preset, direct core + llama.cpp + narrow N-API adapter, static backend/source reduction patch, explicit licensed fixture helper, strict artifact audit, reproducible metadata, and fail-closed signing seam. The inherited commons, Electron facade, desktop adapter, server, downloads, telemetry, Connect, and private engines are not configured on this path. | Two clean public checkout roots built byte-identical unsigned addons; strict graph audit, licensed-fixture smoke, positive Metal, forced/injected CPU fallback, deterministic development archive, and official timestamped signing evidence are recorded below. | Awaiting independent exact-head Sol review |
| `bb81e449cc02f7c52f6e39428a1bc58bc7e701a7` | Replaces namespace-global inference ownership with Node-API environment instance data, an asynchronous environment cleanup hook, and an idempotent finalizer. Cleanup cancels and drains stream work before model unload, backend shutdown, and `InferenceCore` destruction. Adds child-process ordinary-return coverage and preserves the documented versioned directory at the root of every ZIP. | Reproduced the prior exit-134 failure, then verified initialize, load/generate, controlled-error, explicit-shutdown, and in-flight stream cleanup exits without `SIGABRT` or `std::system_error`; strict artifact audit and official signed candidate provenance are recorded below. | Awaiting independent exact-head Sol review |
| `1fe2f8f119d9bd3d457029d6f8d92cc560798706` | Introduces the Phase 1.1 internal pull stream: each host `next()` asynchronously yields no more than one bounded delta or one terminal record; cancellation, duplicate demand, abandonment, unload/reset/shutdown, and environment exit settle safely. It fixes the decode memory-slot failure by clearing the KV cache, assigning explicit positions, and stopping at the remaining context budget. It also fixes an ordinary-exit `SIGSEGV`: the cleanup hook now drains and removes its Node-API handle on the Node cleanup thread instead of a detached native thread. | Fresh public roots produced byte-identical unsigned ARM64 addons; artifact audit, signed package, manifest/SBOM/notices verification, a 100-process initialize/ordinary-exit stress check, and five consecutive six-cycle CPU diagnostics passed. This host has no usable Metal device, so positive Metal and injected-Metal-failure fallback remain required on an eligible host. | Awaiting independent exact-head Sol review |

No upstream source logic has been modified in Phase 0. The additive
[closure PR #1](https://github.com/ISPOai/runanywhere-sdks/pull/1) contains
the repair to this ledger and is the auditable independent-review record for
all six pre-existing direct commits. Its review must identify the exact PR
head, reviewer, and verification evidence before merge; neither this ledger
nor its author claims that independent review has already happened.

## Package identity

The current Phase 1.1 package identity is the private Electron/Node N-API
source package:

| Path | ISPO package name | Version | Publication state |
| --- | --- | --- | --- |
| `bindings/electron/native` | `@ispo/runanywhere-local-inference-native` | `0.20.31-ispo.3` | private; never publish from Phase 0/1 |

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

The Phase 1.1 package layout is `ispo-local-inference-darwin-arm64-0.20.31-ispo.3/`: one native addon in `native/`, embedded Metal shaders inside that Mach-O, no third-party dylibs, notices in `notices/`, and input/SBOM/hash records in `metadata/`. The ZIP preserves that versioned directory as its top-level entry; extraction never spills `native/`, `notices/`, or `metadata/` into a desktop-signing parent. It is an input suitable for later nested desktop signing; this script signs only the native addon and never publishes a package or release.

`metadata/artifact-manifest.sha256` hashes every staged file except itself. The `.zip.sha256` is adjacent to, not inside, the archive, so the archive hash is non-circular. Secure timestamping makes an official Developer ID archive time-bearing; byte-identical reproducibility is instead proven on the unsigned addon and separately named ad-hoc development archive, while the official archive has deterministic layout and a strict signature gate.

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

The artifact identity is `@ispo/runanywhere-local-inference@0.20.31-ispo.3`. It is a host-internal N-API module, not an Electron preload/renderer/global surface. Its only exports are `initialize`, `capabilities`, `loadExactLocalModel`, `complete`, `stream`, `cancel`, `unload`, `metrics`, `reset`, and `shutdown`.

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
namespace-static inference core survives into shared-library destruction. The
N-API v8 asynchronous cleanup hook runs its cancel-and-drain sequence on the
Node cleanup thread: it cancels active generation, waits for every
queued/running stream lease to finish, unloads the model, shuts down and
destroys `InferenceCore`, and only then releases the hook. It never calls
Node-API cleanup-handle removal from a detached native thread. The environment
finalizer repeats the same idempotent shutdown path after the hook, including
when initialization had failed after a partially constructed core. Explicit
`shutdown()` uses that same path and may be called repeatedly before ordinary
Node return.

The selected source slice fetches only the public llama.cpp commit `79e2eb5eef131799ca6a2e2e342056a37a148df8`, archive SHA-256 `67d40b994c948d6536c50a1fe613cc0e4710af2567667344011a40f4dcbe72e9`, and applies `llama-static-backend-registry.patch`, SHA-256 `cf94d1a767693a88d29e5f68340970452d87dc6bceb1d4bf52a17886fbcb6200`. It removes `ggml-backend-dl.cpp` from the selected target and compiles a static CPU/Accelerate/Metal registry only.

The release preset has `RAC_DESKTOP_ADAPTER=OFF`; inherited core, cloud/control-plane, telemetry, Connect, model downloads, NeuRT, QHexRT, ONNX, Sherpa, server, examples, tests, HTTP, RPC, curl, and unused engines are not configured. It embeds Metal shaders. An actual GPU backend probe plus model/context fallback decides the reported backend; an injected post-probe Metal model-load failure is a deterministic CPU/Accelerate fallback test seam.

The test-only fixture is `tinyllama-15M-stories-Q2_K.gguf`, source revision `227c5a5ad3c1a830901543cf9959c53572014a68`, SHA-256 `f7e39dc9f26f3d39bf59e885349c6eec65880f685322d591f53e6cdb46ceb2e9`. Its immutable model card has SHA-256 `904844774ca757e910ac26d8bbf550e574946ee4a72ba99b17f986a4ea75e315` and declares `license: mit`. The model-card declaration and MIT terms are preserved in `TINYLLAMA-15M-STORIES-MIT.txt`; model bytes are explicit test input only, never a runtime download or model-admission decision.

The package validates generated CycloneDX 1.5 SBOMs with the official schema tag `1.5`, commit `c320fc0f0b46873864927d9d5684eea7ba439728`: BOM SHA-256 `067f7824b08653839ea050ae9e09ca48375eadc2652b0e2a299476e7db90335b`, SPDX companion SHA-256 `4f6e2b05c05d26a4f2dc5879fbc2fca94b0a28db46289d0c51345621b71cfbfc`, and JSON-signature companion SHA-256 `8bae002c25e723db7ee1f26afde680ae1a2b1a8f6b4b4b0fd65dc3becb090aae`. Schema/test dependencies, every compiled/runtime/test input, and license hashes are recorded in `metadata/input-manifest.json`. CycloneDX components use supported `hashes` and `properties`, never npm-only `integrity`.

From a clean public checkout, run the following in two independent scratch roots and compare the unsigned addon hashes:

```sh
public_remote="https://github.com/ISPOai/runanywhere-sdks.git"
head_ref="ispo/phase1-1-pull-stream"
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
ISPO_ARTIFACT_OUTPUT=/private/tmp/ispo-phase1-1-development \
  ./ispo/inference/scripts/package-development-darwin-arm64.sh
unzip -Z1 /private/tmp/ispo-phase1-1-development/ispo-local-inference-darwin-arm64-0.20.31-ispo.3-development.zip | \
  grep -E '^ispo-local-inference-darwin-arm64-0.20.31-ispo.3-development/(metadata|native|notices)/'
```

For an official release candidate, an explicitly supplied Developer ID identity is mandatory. The release script fails before build/output creation when absent, signs with `--timestamp --options runtime`, requires a TeamIdentifier, hardened-runtime flag, strict verification, and a secure timestamp, and has no ad-hoc fallback:

```sh
ISPO_ARTIFACT_OUTPUT=/private/tmp/ispo-phase1-1-release \
ISPO_CODESIGN_IDENTITY='Developer ID Application: ISPO Labs, Inc (4L8CX8AY6M)' \
  ./ispo/inference/scripts/package-darwin-arm64.sh
```

The archive contains the addon, notices, model-license record, CycloneDX SBOM, SBOM-validation record, pinned input manifest, and non-circular artifact manifest. Do not merge until an independent exact-head review records the final refs and repeats these gates.
