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

## Downstream patch ledger

| Patch / commit | Scope | Status |
| --- | --- | --- |
| `0001-ispo-native-package-identity` | ISPO-owned private Electron/Node N-API package identity and version | Reviewed Phase 0 downstream patch |
| `0002-ispo-provenance-policy-and-notices` | This document; upstream-update policy; third-party notices | Reviewed Phase 0 downstream patch |
| Phase 1 runtime patch set | Inference-only CMake preset, source reduction, sealing, packaging | Not yet produced — Phase 1 owns it |

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

| Input | Pin |
| --- | --- |
| RunAnywhere source | Git commit `00e879fa818111054c02c8ad1f1a0398a4738f92` |
| llama.cpp source | `https://github.com/RunanywhereAI/llama.cpp.git` tag `runanywhere-b10453.4`, resolved in the Phase 0 public build to commit `79e2eb5eef131799ca6a2e2e342056a37a148df8` |
| Node N-API source dependencies | `node-addon-api` `8.9.0`; `node-api-headers` `1.9.0` (from `bindings/electron/native/package-lock.json`) |
| Electron source dependency lock | Electron `43.1.1`; TypeScript `5.9.3` (from `bindings/electron/package-lock.json`) |
| Public-source proof flags | `RAC_BUILD_BACKENDS=ON`, `RAC_BACKEND_LLAMACPP=ON`, `RAC_BUILD_ELECTRON_ADDON=ON`, `RAC_DESKTOP_ADAPTER=OFF`, `RAC_BUILD_SERVER=OFF`, `RAC_BUILD_PLATFORM=OFF`, `RAC_BACKEND_RAG=OFF`, `RAC_STATIC_PLUGINS=ON`, `GGML_METAL=OFF`, `RAC_GPU_VULKAN=OFF` |

These proof flags are not the Phase 1 hardened CMake preset. Phase 1 owns the
shipping preset, Metal enablement, resource packaging, and sealed-runtime
settings.

## Phase 0 public build evidence

A fresh sparse public clone of `origin/ispo/main` at
`5b98189417b0b0ed6c84b6c5233a50976489918f` configured and built
`runanywhere_native` on Darwin ARM64 with CMake `4.4.3`, Ninja `1.13.2`, Xcode
`26.2`, and Node `22.23.1`. The commands used an empty environment containing
only a scratch `HOME`, `PATH`, and `LANG`; no RunAnywhere token, control-plane
URL, private engine pack, or vendor-only runner was supplied. The configure
selected llama.cpp commit `79e2eb5eef131799ca6a2e2e342056a37a148df8` and
completed with the public-source flags above. The verification output was a
non-shipped `runanywhere_native.node` Mach-O arm64 file with SHA-256
`71c9c4e22bca06ff6d5567f11fb18561f4ba9bf9befa37d4f09eebf66afdc938`.

## Shipped artifacts

| Artifact | SHA-256 | Status |
| --- | --- | --- |
| Darwin ARM64 native addon | Pending — not yet produced; Phase 1 owns the artifact | Not shipped |
| Darwin ARM64 runtime libraries | Pending — not yet produced; Phase 1 owns the artifact | Not shipped |
| Embedded Metal resources | Pending — not yet produced; Phase 1 owns the artifact | Not shipped |
| Artifact manifest | Pending — not yet produced; Phase 1 owns the artifact | Not shipped |

Before any artifact is released, replace each pending entry with the exact
input pin, output filename, SHA-256, build command, and verification result.
