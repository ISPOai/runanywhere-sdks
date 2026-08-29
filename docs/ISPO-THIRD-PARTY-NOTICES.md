# ISPO local-inference third-party license obligations

This notice records the license-review obligations for the selected local
inference slice. It supplements, and never replaces, the complete upstream
`LICENSE` and all notices carried by the selected sources and dependencies.

| Component | Source/pin record | Required action before shipping |
| --- | --- | --- |
| RunAnywhere SDK source | `00e879fa818111054c02c8ad1f1a0398a4738f92`; root `LICENSE` | Preserve the full RunAnywhere License, copyright notice, modification notice, and eligibility review. Do not imply trademark permission. |
| llama.cpp and ggml | `https://github.com/RunanywhereAI/llama.cpp.git` tag `runanywhere-b10453.4`, resolved commit `79e2eb5eef131799ca6a2e2e342056a37a148df8`; MIT | Ship the pinned source `LICENSE` as `LLAMA-CPP-MIT.txt`; the artifact input manifest records this patch's SHA-256 and resolved Git head. |
| C++ configure dependencies | Abseil `255c84dadd029fd8ad25c5efb5933e47beaa00c7` (Apache-2.0); protobuf `35cd01f9fe9afbeea38cc7b979a3b6bfcde82c03` (BSD-3-Clause); nlohmann/json `55f93686c01528224f448c19128836e7df245f72` (MIT); libarchive `ded82291ab41d5e355831b96b0e1ff49e24d8939` (BSD-2-Clause) | Preserve each selected dependency's license and notice text in the artifact-specific notice bundle. |
| Metal shader/resources and Apple frameworks | Generated from the pinned llama.cpp source and Apple SDK selected by Xcode; no Phase 0 artifact | Preserve any upstream resource notices; comply with the applicable Apple SDK/Xcode terms. Record SDK/Xcode version, resource provenance, and output hashes in the Phase 1 manifest. |
| Node and Node-API | `node-addon-api` `8.9.0`, `node-api-headers` `1.9.0`; Node runtime version and npm SRIs recorded by release build | Ship their distributed MIT texts as `NODE-ADDON-API-MIT.txt` and `NODE-API-HEADERS-MIT.txt`. Do not treat N-API headers as ISPO-authored. |
| Electron and TypeScript build dependencies | Electron `43.1.1`, TypeScript `5.9.3` | Retain applicable notices when redistributed; record the exact lockfile integrity values and release inputs. |
| Python/protoc codegen tools | CPython `3.14.2`; `protobuf==6.33.0` (BSD-3-Clause) and `PyYAML==6.0.3` (MIT) from the checked hash lock; protoc `35.1` (BSD-3-Clause) | Preserve applicable notices if shipped. Phase 0 consumes them only to configure/build source; the lock and protoc SHA-256 are recorded in `ISPO-MODIFICATIONS.md`. |
| Admitted models | Separate host-owned admission record per model | Model weights, tokenizers, templates, datasets, and upstream notices are separately licensed. Runtime licensing never admits a model. Require a model-specific license ID/link, source revision, file checksum, acceptance state, and redistribution decision before download or shipment. |

## Phase 1 test fixture

`tinyllama-15M-stories-Q2_K.gguf` is a test-only GGUF fixture from
`tensorblock/tinyllama-15M-stories-GGUF`, immutable source revision
`227c5a5ad3c1a830901543cf9959c53572014a68`, SHA-256
`f7e39dc9f26f3d39bf59e885349c6eec65880f685322d591f53e6cdb46ceb2e9`.
The immutable `README.md` model card at that exact revision declares
`license: mit`; its SHA-256 is
`904844774ca757e910ac26d8bbf550e574946ee4a72ba99b17f986a4ea75e315`.
The repository has no separate `LICENSE` file at that revision. The fork
therefore records the authoritative model-card declaration and preserves the
MIT terms independently in
`ispo/inference/fixtures/TINYLLAMA-15M-STORIES-MIT.txt`.

The helper fetches this input only when a verifier invokes it explicitly,
checks both the immutable model-card and model hashes, and is never linked into
or called by runtime code. The runtime package does not contain the model
bytes. Its notice bundle carries `TINYLLAMA-15M-STORIES-MIT.txt` as a
separate model-license record; runtime-license obligations do not admit,
download, or redistribute a model.

The Phase 1 package script creates the artifact-specific notice bundle and
records its SHA-256 entries in `metadata/artifact-manifest.sha256`.
