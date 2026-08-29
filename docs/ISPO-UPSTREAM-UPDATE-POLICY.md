# ISPO RunAnywhere upstream-update policy

## Scope and authority

This policy governs `ISPOai/runanywhere-sdks`. The accepted baseline is the
annotated tag `ispo/upstream-00e879fa818111054c02c8ad1f1a0398a4738f92`.
`upstream` must always name `https://github.com/RunanywhereAI/runanywhere-sdks.git`.
Only reviewed, additive downstream commits may enter `ispo/main`.

Never merge an unreviewed upstream branch, force-push, rewrite public history,
move an adoption tag, or publish/release as part of an update.

## Pin every input

Every source repository is pinned by immutable commit ID; every release asset,
tool archive, model file, and generated artifact is pinned by exact version,
origin URL, and SHA-256. Model source revisions and checksums are admitted
separately from runtime inputs. Do not use a floating branch, latest release,
unversioned URL, mutable tag without resolved commit, package range, or a
checksum supplied without an independently recorded source.

The update record must include:

- current and proposed upstream commit IDs and annotated adoption tag;
- current and proposed dependency source revisions, release URLs, and checksums;
- full diff/release-note/security-advisory review, including the upstream
  `LICENSE` and third-party notices;
- an explicit relevant-change decision for the selected core, llama.cpp,
  Electron/Node N-API, build, licensing, and dependency surfaces;
- reviewed downstream patches and a regenerated artifact manifest with
  SHA-256 hashes when artifacts exist.

Changes outside the selected slice may remain unimported only after recording
why they are irrelevant. A security or license change that touches a transitive
input is relevant until reviewed.

## Required update procedure

1. Fetch the exact candidate commit from `upstream` into a fresh clone; record
   `git rev-parse` output and verify the commit is reachable from the reviewed
   upstream release or commit.
2. Review upstream release notes, commits, security advisories, license changes,
   and the full relevant diff. Resolve mutable tags to commits before review.
3. Import only the approved core/Electron/llama.cpp fixes as reviewed commits;
   do not merge an upstream branch wholesale.
4. Update `ISPO-MODIFICATIONS.md`, dependency pins, third-party notices, and
   all artifact/model checksum records before build or release.
5. Run the full verification matrix below from a clean checkout. Investigate
   every changed result; a green unrelated lane does not waive a relevant lane.
6. Create a new annotated immutable adoption tag at the reviewed upstream
   commit, then push the additive tag and reviewed `ispo/main` commit. Leave
   prior tags and history intact.

## Full verification matrix

- provenance: fork origin, `upstream` URL, adopted commit, tag object/target,
  package identities, and `git diff --check`;
- licensing: upstream license/copyright retention and third-party/model-license
  review;
- clean-checkout configure and build of the selected public core + llama.cpp +
  Electron/Node N-API slice with no RunAnywhere token, control-plane URL,
  private engine pack, or vendor-only runner;
- dependency integrity: exact source/release/model/checksum verification and
  generated artifact-manifest hash verification;
- Phase 1 runtime verification when an artifact exists: signed package contents,
  Metal resources and CPU fallback, isolated loopback behavior, no network,
  deterministic smoke generation, cancellation, unload, and backend reporting;
- relevant C++/N-API tests, package typechecks, and release checks for every
  changed surface.

No update can replace this matrix with a claim that an upstream CI run passed.
