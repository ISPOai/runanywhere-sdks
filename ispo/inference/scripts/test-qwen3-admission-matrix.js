'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  expectedQwen3ChatPrompt,
  matrixCycles,
  parseRawLinkerIdentity,
  qwen3ContextTokens,
  qwen3LicenseIdentity,
  qwen3ModelIdentity,
  qwen3Prompt,
  validateExactInputBindings,
} = require('./run-qwen3-admission-matrix.js');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(qwen3ContextTokens === 2048, 'Qwen3 context admission changed');
assert(matrixCycles === 6, 'Qwen3 lifecycle matrix cycle count changed');
assert(expectedQwen3ChatPrompt ===
  '<|im_start|>user\nReply with exactly one word.<|im_end|>\n<|im_start|>assistant\n',
  'Qwen3 ChatML template changed');
assert(qwen3Prompt === 'Reply with exactly one word.', 'Qwen3 bounded prompt changed');

const sourceHead = 'a'.repeat(40);
const productionAddon = { bytes: 4096, sha256: 'b'.repeat(64) };
const rawAddon = { bytes: 4096, sha256: productionAddon.sha256 };
const testAddon = { bytes: 2048, sha256: 'c'.repeat(64) };
const model = { ...qwen3ModelIdentity };
const license = { bytes: 11544, ...qwen3LicenseIdentity };
const rawLinker = {
  schemaVersion: 1,
  artifactPath: 'native/ispo_local_inference_native.node',
  forkHead: sourceHead,
  stage: 'raw-linker-output-before-explicit-codesign',
  signatureState: 'linker-generated-ad-hoc',
  sha256: productionAddon.sha256,
};

const candidateFor = (overrides = {}) => ({
  declaredSourceHead: overrides.declaredSourceHead ?? sourceHead,
  license: overrides.license ?? license,
  model: overrides.model ?? model,
  productionAddon: overrides.productionAddon ?? productionAddon,
  rawAddon: overrides.rawAddon ?? rawAddon,
  rawLinker: overrides.rawLinker ?? rawLinker,
  repositoryHead: overrides.repositoryHead ?? sourceHead,
  testAddon: overrides.testAddon ?? testAddon,
});

assert(JSON.stringify(parseRawLinkerIdentity(rawLinker)) === JSON.stringify({
  forkHead: sourceHead,
  sha256: productionAddon.sha256,
  signatureState: 'linker-generated-ad-hoc',
  stage: 'raw-linker-output-before-explicit-codesign',
}), 'raw linker parser did not retain the bounded identity');

const inputBindings = validateExactInputBindings(candidateFor());
assert(JSON.stringify(inputBindings) === JSON.stringify({
  source: { head: sourceHead },
  rawLinker: {
    sha256: productionAddon.sha256,
    signatureState: 'linker-generated-ad-hoc',
    stage: 'raw-linker-output-before-explicit-codesign',
  },
  nativeArtifacts: {
    productionAddon,
    rawAddon,
    testAddon,
  },
  model,
  license,
}), 'input receipt contained an unexpected identity shape');

const rejectedCandidates = [
  candidateFor({ declaredSourceHead: 'd'.repeat(40) }),
  candidateFor({ repositoryHead: 'd'.repeat(40) }),
  candidateFor({ rawLinker: { ...rawLinker, extra: 'unexpected' } }),
  candidateFor({ rawLinker: { ...rawLinker, forkHead: 'd'.repeat(40) } }),
  candidateFor({ rawLinker: { ...rawLinker, sha256: 'd'.repeat(64) } }),
  candidateFor({ rawAddon: { ...rawAddon, sha256: 'd'.repeat(64) } }),
  candidateFor({ model: { ...model, bytes: model.bytes - 1 } }),
  candidateFor({ model: { ...model, sha256: 'd'.repeat(64) } }),
  candidateFor({ license: { ...license, sha256: 'd'.repeat(64) } }),
  candidateFor({ testAddon: { ...testAddon, bytes: -1 } }),
];
for (const rejectedCandidate of rejectedCandidates) {
  let rejected = false;
  try {
    validateExactInputBindings(rejectedCandidate);
  } catch {
    rejected = true;
  }
  assert(rejected, 'an exact Qwen3 matrix input mismatch was accepted');
}

const receiptDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ispo-qwen3-admission-matrix-'));
try {
  const receipt = path.join(receiptDirectory, 'failure.json');
  const result = spawnSync(process.execPath, [
    path.join(__dirname, 'run-qwen3-admission-matrix.js'),
    path.join(receiptDirectory, 'missing-addon.node'),
    path.join(receiptDirectory, 'missing-test-addon.node'),
    path.join(receiptDirectory, 'missing-model.gguf'),
    path.join(receiptDirectory, 'missing-license'),
    path.join(receiptDirectory, 'missing-raw-addon.node'),
    path.join(receiptDirectory, 'missing-raw-linker-identity.json'),
    sourceHead,
    receipt,
  ], { encoding: 'utf8' });
  assert(result.status === 1, 'matrix failure did not retain its exit status');
  assert(result.stdout === '', 'matrix failure wrote unbounded stdout');
  assert(result.stderr === 'Qwen3 admission matrix failed\n', 'matrix failure output changed');
  const failureReceipt = JSON.parse(fs.readFileSync(receipt, 'utf8'));
  assert(JSON.stringify(failureReceipt) === JSON.stringify({
    schemaVersion: 2,
    status: 'failed',
    failureStage: 'input-bindings',
  }), 'matrix failure did not retain the bounded receipt');
} finally {
  fs.rmSync(receiptDirectory, { recursive: true, force: true });
}

process.stdout.write('Qwen3 admission matrix contract passed\n');
