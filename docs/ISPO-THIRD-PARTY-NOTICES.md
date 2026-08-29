# ISPO local-inference third-party license obligations

This notice records the license-review obligations for the selected local
inference slice. It supplements, and never replaces, the complete upstream
`LICENSE` and all notices carried by the selected sources and dependencies.

| Component | Source/pin record | Required action before shipping |
| --- | --- | --- |
| RunAnywhere SDK source | `00e879fa818111054c02c8ad1f1a0398a4738f92`; root `LICENSE` | Preserve the full RunAnywhere License, copyright notice, modification notice, and eligibility review. Do not imply trademark permission. |
| llama.cpp and ggml | `https://github.com/RunanywhereAI/llama.cpp.git` tag `runanywhere-b10453.4`, resolved commit `79e2eb5eef131799ca6a2e2e342056a37a148df8`; MIT | Preserve upstream llama.cpp/ggml notices and license text in the shipped notice bundle; a git commit is the Phase 0 source-content identity. Record an archive hash if a Phase 1 delivery archive is used. |
| C++ configure dependencies | Abseil `255c84dadd029fd8ad25c5efb5933e47beaa00c7` (Apache-2.0); protobuf `35cd01f9fe9afbeea38cc7b979a3b6bfcde82c03` (BSD-3-Clause); nlohmann/json `55f93686c01528224f448c19128836e7df245f72` (MIT); libarchive `ded82291ab41d5e355831b96b0e1ff49e24d8939` (BSD-2-Clause) | Preserve each selected dependency's license and notice text in the artifact-specific notice bundle. |
| Metal shader/resources and Apple frameworks | Generated from the pinned llama.cpp source and Apple SDK selected by Xcode; no Phase 0 artifact | Preserve any upstream resource notices; comply with the applicable Apple SDK/Xcode terms. Record SDK/Xcode version, resource provenance, and output hashes in the Phase 1 manifest. |
| Node and Node-API | `node-addon-api` `8.9.0`, `node-api-headers` `1.9.0`; Node runtime version recorded by release build | Retain each dependency's distributed license/notice and satisfy Node/Electron runtime distribution terms. Do not treat N-API headers as ISPO-authored. |
| Electron and TypeScript build dependencies | Electron `43.1.1`, TypeScript `5.9.3` | Retain applicable notices when redistributed; record the exact lockfile integrity values and release inputs. |
| Python/protoc codegen tools | CPython `3.14.2`; `protobuf==6.33.0` (BSD-3-Clause) and `PyYAML==6.0.3` (MIT) from the checked hash lock; protoc `35.1` (BSD-3-Clause) | Preserve applicable notices if shipped. Phase 0 consumes them only to configure/build source; the lock and protoc SHA-256 are recorded in `ISPO-MODIFICATIONS.md`. |
| Admitted models | Separate host-owned admission record per model | Model weights, tokenizers, templates, datasets, and upstream notices are separately licensed. Runtime licensing never admits a model. Require a model-specific license ID/link, source revision, file checksum, acceptance state, and redistribution decision before download or shipment. |

## Phase 1 test fixture

`stories15M-q4_0.gguf` is a test-only Apache-2.0 GGUF fixture from
`ggml-org/models-moved`, immutable source revision
`499bc8821c6b12b4e53c5bffcb21ec206f212d81`, SHA-256
`66967fbece6dbe97886593fdbb73589584927e29119ec31f08090732d1861739`.
It is fetched only by the explicit verification helper, never by the runtime.

The Phase 0 source proof does not distribute a compiled artifact. Before Phase
1 shipping, produce a complete, artifact-specific third-party notice bundle and
associate it with the artifact manifest and SHA-256 hashes in
`ISPO-MODIFICATIONS.md`.
