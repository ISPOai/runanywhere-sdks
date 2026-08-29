# ISPO local-inference third-party license obligations

This notice records the license-review obligations for the selected local
inference slice. It supplements, and never replaces, the complete upstream
`LICENSE` and all notices carried by the selected sources and dependencies.

| Component | Source/pin record | Required action before shipping |
| --- | --- | --- |
| RunAnywhere SDK source | `00e879fa818111054c02c8ad1f1a0398a4738f92`; root `LICENSE` | Preserve the full RunAnywhere License, copyright notice, modification notice, and eligibility review. Do not imply trademark permission. |
| llama.cpp and ggml | `RunanywhereAI/llama.cpp` `runanywhere-b10453.4`; exact resolved commit and license text pending Phase 1 lock | Preserve upstream llama.cpp/ggml notices and license text in the shipped notice bundle; record the resolved commit and SHA-256 of the fetched source/archive. |
| Metal shader/resources and Apple frameworks | Generated from the pinned llama.cpp source and Apple SDK selected by Xcode; no Phase 0 artifact | Preserve any upstream resource notices; comply with the applicable Apple SDK/Xcode terms. Record SDK/Xcode version, resource provenance, and output hashes in the Phase 1 manifest. |
| Node and Node-API | `node-addon-api` `8.9.0`, `node-api-headers` `1.9.0`; Node runtime version recorded by release build | Retain each dependency's distributed license/notice and satisfy Node/Electron runtime distribution terms. Do not treat N-API headers as ISPO-authored. |
| Electron and TypeScript build dependencies | Electron `43.1.1`, TypeScript `5.9.3` | Retain applicable notices when redistributed; record the exact lockfile integrity values and release inputs. |
| Admitted models | Separate host-owned admission record per model | Model weights, tokenizers, templates, datasets, and upstream notices are separately licensed. Runtime licensing never admits a model. Require a model-specific license ID/link, source revision, file checksum, acceptance state, and redistribution decision before download or shipment. |

The Phase 0 source proof does not distribute a compiled artifact. Before Phase
1 shipping, produce a complete, artifact-specific third-party notice bundle and
associate it with the artifact manifest and SHA-256 hashes in
`ISPO-MODIFICATIONS.md`.
