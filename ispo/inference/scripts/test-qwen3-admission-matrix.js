'use strict';

const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  expectedQwen3ChatPrompt,
  matrixCycles,
  parseRawLinkerIdentity,
  qwen3ContextTokens,
  qwen3LicenseIdentity,
  qwen3MatrixLimits,
  qwen3ModelIdentity,
  qwen3Prompt,
  qwen3SourceIdentity,
  qwen3UpstreamIdentity,
  validateExactInputBindings,
  writeMatrixArtifacts,
} = require('./run-qwen3-admission-matrix.js');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const exactJson = (value) => JSON.stringify(value);
const fileIdentity = (bytes, sha256) => ({ bytes, sha256 });
const fileDigest = (filename) => {
  const bytes = fs.readFileSync(filename);
  return fileIdentity(bytes.byteLength, createHash('sha256').update(bytes).digest('hex'));
};

const sourceHead = 'a'.repeat(40);
const productionAddon = fileIdentity(4096, 'b'.repeat(64));
const rawAddon = fileIdentity(4096, productionAddon.sha256);
const testAddon = fileIdentity(2048, 'c'.repeat(64));
const matrixScript = fileIdentity(1234, 'd'.repeat(64));
const source = Object.freeze({
  declaredImplementationHead: sourceHead,
  declaredReviewHead: sourceHead,
  implementationHead: sourceHead,
  reviewBase: qwen3SourceIdentity.reviewBase,
  reviewHead: sourceHead,
});
const rawLinker = Object.freeze({
  artifactPath: 'native/ispo_local_inference_native.node',
  forkHead: sourceHead,
  reproducibility: {
    rawMachOUuid: 'content-derived',
    staticArchiveMetadata: 'canonicalized',
  },
  schemaVersion: 2,
  sha256: productionAddon.sha256,
  signatureState: 'linker-generated-ad-hoc',
  stage: 'raw-linker-output-before-explicit-codesign',
});
const upstream = Object.freeze({
  archive: fileIdentity(111, qwen3UpstreamIdentity.archiveSha256),
  license: fileIdentity(222, qwen3UpstreamIdentity.licenseSha256),
  patch: fileIdentity(333, qwen3UpstreamIdentity.patchSha256),
  revision: qwen3UpstreamIdentity.revision,
});

const candidateFor = (overrides = {}) => ({
  declaredMatrixScript: overrides.declaredMatrixScript ?? matrixScript,
  license: overrides.license ?? qwen3LicenseIdentity,
  limits: overrides.limits ?? qwen3MatrixLimits,
  matrixScript: overrides.matrixScript ?? matrixScript,
  model: overrides.model ?? qwen3ModelIdentity,
  productionAddon: overrides.productionAddon ?? productionAddon,
  rawAddon: overrides.rawAddon ?? rawAddon,
  rawLinker: overrides.rawLinker ?? rawLinker,
  signedAddon: overrides.signedAddon ?? { state: 'not-applicable' },
  source: overrides.source ?? source,
  testAddon: overrides.testAddon ?? testAddon,
  upstream: overrides.upstream ?? upstream,
});

const expectInputFailure = (candidate, expectedFailureCode) => {
  try {
    validateExactInputBindings(candidate);
  } catch (error) {
    assert(error instanceof Error, 'invalid matrix input did not throw an error');
    assert(error.failureCode === expectedFailureCode,
      `matrix input failure changed: expected ${expectedFailureCode}, received ${error.failureCode}`);
    return;
  }
  throw new Error(`matrix accepted an input that should fail with ${expectedFailureCode}`);
};

const main = async () => {
  assert(qwen3ContextTokens === 2048, 'Qwen3 context admission changed');
  assert(matrixCycles === 6, 'Qwen3 lifecycle matrix cycle count changed');
  assert(expectedQwen3ChatPrompt ===
    '<|im_start|>user\nReply with exactly one word.<|im_end|>\n<|im_start|>assistant\n',
  'Qwen3 ChatML template changed');
  assert(qwen3Prompt === 'Reply with exactly one word.', 'Qwen3 bounded prompt changed');

  assert(exactJson(parseRawLinkerIdentity(rawLinker)) === exactJson({
    artifactPath: 'native/ispo_local_inference_native.node',
    forkHead: sourceHead,
    reproducibility: {
      rawMachOUuid: 'content-derived',
      staticArchiveMetadata: 'canonicalized',
    },
    schemaVersion: 2,
    sha256: productionAddon.sha256,
    signatureState: 'linker-generated-ad-hoc',
    stage: 'raw-linker-output-before-explicit-codesign',
  }), 'raw linker parser did not retain the deterministic identity');

  const inputBindings = validateExactInputBindings(candidateFor());
  assert(exactJson(inputBindings) === exactJson({
    source: {
      implementationHead: sourceHead,
      reviewBase: qwen3SourceIdentity.reviewBase,
      reviewHead: sourceHead,
    },
    rawLinker: {
      reproducibility: {
        rawMachOUuid: 'content-derived',
        staticArchiveMetadata: 'canonicalized',
      },
      sha256: productionAddon.sha256,
      signatureState: 'linker-generated-ad-hoc',
      stage: 'raw-linker-output-before-explicit-codesign',
    },
    nativeArtifacts: {
      productionAddon,
      rawAddon,
      signedAddon: { state: 'not-applicable' },
      testAddon,
    },
    model: qwen3ModelIdentity,
    license: qwen3LicenseIdentity,
    upstream,
    matrixScript,
    limits: qwen3MatrixLimits,
  }), 'matrix receipt did not retain every exact input identity');

  assert(exactJson(validateExactInputBindings(candidateFor({
    rawLinker: parseRawLinkerIdentity(rawLinker),
  }))) === exactJson(inputBindings),
  'matrix input capture cannot revalidate its normalized raw-linker identity');

  expectInputFailure(candidateFor({
    source: { ...source, declaredImplementationHead: 'e'.repeat(40) },
  }), 'source-implementation-head-mismatch');
  expectInputFailure(candidateFor({
    source: { ...source, declaredReviewHead: 'e'.repeat(40) },
  }), 'source-review-head-mismatch');
  expectInputFailure(candidateFor({
    productionAddon: fileIdentity(productionAddon.bytes, 'e'.repeat(64)),
  }), 'raw-production-addon-mismatch');
  expectInputFailure(candidateFor({
    rawAddon: fileIdentity(rawAddon.bytes, 'e'.repeat(64)),
  }), 'raw-linker-identity-mismatch');
  expectInputFailure(candidateFor({
    rawLinker: { ...rawLinker, sha256: 'e'.repeat(64) },
  }), 'raw-linker-identity-mismatch');
  expectInputFailure(candidateFor({
    rawLinker: { ...rawLinker, forkHead: 'e'.repeat(40) },
  }), 'raw-linker-source-head-mismatch');
  expectInputFailure(candidateFor({
    model: fileIdentity(qwen3ModelIdentity.bytes - 1, qwen3ModelIdentity.sha256),
  }), 'model-identity-mismatch');
  expectInputFailure(candidateFor({
    model: fileIdentity(qwen3ModelIdentity.bytes, 'e'.repeat(64)),
  }), 'model-identity-mismatch');
  expectInputFailure(candidateFor({
    license: fileIdentity(qwen3LicenseIdentity.bytes, 'e'.repeat(64)),
  }), 'license-identity-mismatch');
  expectInputFailure(candidateFor({
    declaredMatrixScript: fileIdentity(matrixScript.bytes, 'e'.repeat(64)),
  }), 'matrix-script-identity-mismatch');
  expectInputFailure(candidateFor({
    limits: { ...qwen3MatrixLimits, contextTokens: qwen3ContextTokens - 1 },
  }), 'matrix-limits-mismatch');
  expectInputFailure(candidateFor({
    limits: { ...qwen3MatrixLimits, allowedBackends: ['cpu-accelerate'] },
  }), 'matrix-limits-mismatch');
  expectInputFailure(candidateFor({
    signedAddon: { identity: fileIdentity(productionAddon.bytes, 'e'.repeat(64)), state: 'present' },
  }), 'signed-addon-identity-mismatch');
  expectInputFailure(candidateFor({
    upstream: { ...upstream, archive: fileIdentity(upstream.archive.bytes, 'e'.repeat(64)) },
  }), 'upstream-archive-mismatch');
  expectInputFailure(candidateFor({
    upstream: { ...upstream, license: fileIdentity(upstream.license.bytes, 'e'.repeat(64)) },
  }), 'upstream-license-mismatch');
  expectInputFailure(candidateFor({
    upstream: { ...upstream, patch: fileIdentity(upstream.patch.bytes, 'e'.repeat(64)) },
  }), 'upstream-patch-mismatch');
  expectInputFailure(candidateFor({
    upstream: { ...upstream, revision: 'e'.repeat(40) },
  }), 'upstream-revision-mismatch');

  const receiptDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ispo-qwen3-admission-matrix-'));
  try {
    const report = path.join(receiptDirectory, 'failure-report.json');
    const log = path.join(receiptDirectory, 'failure-log.json');
    const receipt = path.join(receiptDirectory, 'failure-receipt.json');
    const result = spawnSync(process.execPath, [
      path.join(__dirname, 'run-qwen3-admission-matrix.js'),
      path.join(receiptDirectory, 'missing-addon.node'),
      path.join(receiptDirectory, 'missing-test-addon.node'),
      path.join(receiptDirectory, 'missing-model.gguf'),
      path.join(receiptDirectory, 'missing-license.txt'),
      path.join(receiptDirectory, 'missing-raw-addon.node'),
      path.join(receiptDirectory, 'missing-raw-linker-identity.json'),
      sourceHead,
      sourceHead,
      path.join(receiptDirectory, 'missing-upstream-archive.tar.gz'),
      path.join(receiptDirectory, 'missing-upstream-license.txt'),
      path.join(receiptDirectory, 'missing-upstream.patch'),
      'not-applicable',
      '1',
      'e'.repeat(64),
      report,
      log,
      receipt,
    ], { encoding: 'utf8' });
    assert(result.status === 1, 'matrix failure did not retain its exit status');
    assert(result.stdout === '', 'matrix failure wrote unbounded stdout');
    assert(result.stderr === 'Qwen3 admission matrix failed\n', 'matrix failure output changed');
    const failureReport = JSON.parse(fs.readFileSync(report, 'utf8'));
    const failureLog = JSON.parse(fs.readFileSync(log, 'utf8'));
    const failureReceipt = JSON.parse(fs.readFileSync(receipt, 'utf8'));
    assert(exactJson(failureReport) === exactJson({
      failureCode: 'production-addon-unreadable',
      failureStage: 'input-bindings',
      schemaVersion: 3,
      status: 'failed',
    }), 'matrix failure report did not retain its bounded failure reason');
    assert(exactJson(failureLog) === exactJson({
      schemaVersion: 1,
      status: 'failed',
      event: {
        failureCode: 'production-addon-unreadable',
        failureStage: 'input-bindings',
        kind: 'matrix-failed',
      },
    }), 'matrix failure log did not retain the independent failure event');
    assert(exactJson(failureReceipt) === exactJson({
      schemaVersion: 1,
      status: 'failed',
      failure: {
        failureCode: 'production-addon-unreadable',
        failureStage: 'input-bindings',
      },
      inputBindings: null,
      output: {
        log: fileDigest(log),
        report: fileDigest(report),
      },
    }), 'matrix failure receipt did not independently bind its report and log bytes');

    const successReport = path.join(receiptDirectory, 'success-report.json');
    const successLog = path.join(receiptDirectory, 'success-log.json');
    const successReceipt = path.join(receiptDirectory, 'success-receipt.json');
    const returnedReceipt = await writeMatrixArtifacts({
      logPath: successLog,
      outputPath: successReport,
      receiptPath: successReceipt,
    }, {
      inputBindings,
      schemaVersion: 3,
      status: 'passed',
    });
    assert(exactJson(returnedReceipt) === exactJson(JSON.parse(fs.readFileSync(successReceipt, 'utf8'))),
      'matrix success receipt return value diverged from the persisted receipt');
    assert(exactJson(returnedReceipt) === exactJson({
      schemaVersion: 1,
      status: 'passed',
      failure: null,
      inputBindings,
      output: {
        log: fileDigest(successLog),
        report: fileDigest(successReport),
      },
    }), 'matrix success receipt did not bind the exact inputs and output/log bytes');
  } finally {
    fs.rmSync(receiptDirectory, { recursive: true, force: true });
  }

  process.stdout.write('Qwen3 admission matrix contract passed\n');
};

void main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
