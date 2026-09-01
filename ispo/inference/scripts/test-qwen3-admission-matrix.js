'use strict';

const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  expectedQwen3ChatPrompt,
  matrixCycles,
  parseQwen3PreMatrixReceipt,
  parseRawLinkerIdentity,
  qwen3ContextTokens,
  qwen3LicenseIdentity,
  qwen3MatrixLimits,
  qwen3ModelIdentity,
  qwen3NativeArtifactIdentity,
  qwen3Prompt,
  qwen3SourceIdentity,
  qwen3UpstreamIdentity,
  validateExactInputBindings,
  writeMatrixArtifacts,
} = require('./run-qwen3-admission-matrix.js');
const { validateCanonicalProducerEvidence } = require('./verify-deterministic-darwin-build-inputs.js');

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
const productionAddon = qwen3NativeArtifactIdentity.productionAddon;
const rawAddon = qwen3NativeArtifactIdentity.productionAddon;
const testAddon = qwen3NativeArtifactIdentity.testAddon;
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
  producer: {
    cmakeGenerator: 'Ninja',
    finalLinkOutputPath: 'ispo/inference/ispo_local_inference_native.node',
    preset: 'ispo-darwin-arm64-inference-release',
  },
  reproducibility: {
    rawMachOUuid: 'content-derived',
    staticArchiveMetadata: 'canonicalized-provenance',
  },
  schemaVersion: 3,
  sha256: productionAddon.sha256,
  signatureState: 'linker-generated-ad-hoc',
  stage: 'raw-linker-output-before-explicit-codesign',
});
const upstream = Object.freeze({
  archive: fileIdentity(qwen3UpstreamIdentity.archiveBytes, qwen3UpstreamIdentity.archiveSha256),
  license: fileIdentity(qwen3UpstreamIdentity.licenseBytes, qwen3UpstreamIdentity.licenseSha256),
  patch: fileIdentity(qwen3UpstreamIdentity.patchBytes, qwen3UpstreamIdentity.patchSha256),
  revision: qwen3UpstreamIdentity.revision,
});

const linker = Object.freeze({
  cdHash: 'a4a03265849d1f63ccf18d8ee7282ab4a8ac0748',
  codeDirectory: 'v=20400 size=15993 flags=0x20002(adhoc,linker-signed) hashes=496+0 location=embedded',
  minos: '14.5',
  platform: 1,
  teamIdentifier: 'not set',
  uuid: '7FEAC51B-65E2-3469-A00D-5430772D6041',
});
const producer = Object.freeze({
  cmakeGenerator: 'Ninja',
  finalLinkOutputPath: 'ispo/inference/ispo_local_inference_native.node',
  linkOutputPath: 'ispo/inference/ispo_local_inference_native.node',
  normalizedFinalLinkCommandSha256: 'f'.repeat(64),
  preset: 'ispo-darwin-arm64-inference-release',
});
const toolchain = Object.freeze({
  architecture: 'arm64',
  cCompiler: '/usr/bin/cc',
  cxxCompiler: '/usr/bin/c++',
  cxxCompilerVersion: 'Apple clang version 17.0.0',
  deploymentTarget: '14.5',
  ninjaVersion: '1.13.1',
});
const environment = Object.freeze({
  allProxy: 'unset',
  fetchContentSourceDirIspoLlamacpp: 'unset',
  gitTerminalPrompt: '0',
  home: 'isolated-empty',
  httpProxy: 'unset',
  httpsProxy: 'unset',
  huggingFaceToken: 'unset',
  npmCache: 'isolated-empty',
  path: '/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin',
});
const artifactLabels = Object.freeze([
  'raw-addon',
  'core-object',
  'addon-object',
  'metal-executor-object',
  'inference-core-archive',
  'llama-archive',
  'ggml-archive',
  'ggml-base-archive',
  'ggml-cpu-archive',
  'ggml-blas-archive',
  'ggml-metal-archive',
]);
const record = (label, relativePath, identity) => ({
  byteSize: identity.bytes,
  label,
  relativePath,
  sha256: identity.sha256,
});
const syntheticArtifactIdentity = (index) => fileIdentity(1000 + index, index.toString(16).padStart(64, '0'));
const artifactRecords = (kind, identity) => artifactLabels.map((label, index) => record(
  label,
  `build/${kind}/${label}`,
  label === 'raw-addon' ? identity : syntheticArtifactIdentity(index + (kind === 'production' ? 0 : 32)),
));
const preMatrixReceipt = Object.freeze({
  artifacts: {
    production: artifactRecords('production', productionAddon),
    test: artifactRecords('test', testAddon),
  },
  binding: {
    limits: qwen3MatrixLimits,
    model: { byteSize: qwen3ModelIdentity.bytes, sha256: qwen3ModelIdentity.sha256 },
    qwenLicense: { byteSize: qwen3LicenseIdentity.bytes, sha256: qwen3LicenseIdentity.sha256 },
    reviewBase: qwen3SourceIdentity.reviewBase,
    signedAddon: { state: 'not-applicable' },
    sourceImplementationHead: sourceHead,
    sourceReviewHead: sourceHead,
  },
  environment,
  freshPublicRoots: 2,
  inputs: [
    record('upstream-archive', 'inputs/upstream-archive', {
      bytes: upstream.archive.bytes,
      sha256: upstream.archive.sha256,
    }),
    record('upstream-license', 'inputs/upstream-license', {
      bytes: upstream.license.bytes,
      sha256: upstream.license.sha256,
    }),
    record('upstream-patch', 'inputs/upstream-patch', {
      bytes: upstream.patch.bytes,
      sha256: upstream.patch.sha256,
    }),
    record('matrix-script', 'inputs/matrix-script', matrixScript),
  ],
  linker,
  producer,
  rawLinkerIdentity: rawLinker,
  schemaVersion: 3,
  source: {
    branch: qwen3SourceIdentity.proposalBranch,
    implementationHead: sourceHead,
    reviewBase: qwen3SourceIdentity.reviewBase,
    reviewHead: sourceHead,
  },
  toolchain,
  upstream: {
    archive: {
      byteSize: upstream.archive.bytes,
      revision: upstream.revision,
      sha256: upstream.archive.sha256,
    },
    license: { byteSize: upstream.license.bytes, sha256: upstream.license.sha256 },
    patch: { byteSize: upstream.patch.bytes, sha256: upstream.patch.sha256 },
  },
});
const preMatrixReceiptIdentity = fileIdentity(9308, 'f'.repeat(64));

const candidateFor = (overrides = {}) => ({
  declaredMatrixScript: overrides.declaredMatrixScript ?? matrixScript,
  declaredPreMatrixReceipt: overrides.declaredPreMatrixReceipt ?? preMatrixReceiptIdentity,
  license: overrides.license ?? qwen3LicenseIdentity,
  limits: overrides.limits ?? qwen3MatrixLimits,
  linker: overrides.linker ?? linker,
  matrixScript: overrides.matrixScript ?? matrixScript,
  model: overrides.model ?? qwen3ModelIdentity,
  preMatrixReceipt: overrides.preMatrixReceipt ?? {
    identity: preMatrixReceiptIdentity,
    receipt: preMatrixReceipt,
  },
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
    producer: {
      cmakeGenerator: 'Ninja',
      finalLinkOutputPath: 'ispo/inference/ispo_local_inference_native.node',
      preset: 'ispo-darwin-arm64-inference-release',
    },
    reproducibility: {
      rawMachOUuid: 'content-derived',
      staticArchiveMetadata: 'canonicalized-provenance',
    },
    schemaVersion: 3,
    sha256: productionAddon.sha256,
    signatureState: 'linker-generated-ad-hoc',
    stage: 'raw-linker-output-before-explicit-codesign',
  }), 'raw linker parser did not retain the deterministic identity');
  assert(parseQwen3PreMatrixReceipt(preMatrixReceipt).artifacts.production[0].sha256 === undefined,
    'pre-matrix receipt parser retained an unparsed artifact record');
  assert(exactJson(parseQwen3PreMatrixReceipt(preMatrixReceipt).artifacts.production[0].identity) ===
    exactJson(productionAddon), 'pre-matrix receipt parser lost the public raw addon identity');
  assert(exactJson(validateCanonicalProducerEvidence({
    cmakeGenerator: 'Ninja',
    finalLinkOutputPath: 'ispo/inference/ispo_local_inference_native.node',
    linkOutputPath: 'ispo/inference/ispo_local_inference_native.node',
    normalizedFinalLinkCommandSha256: 'f'.repeat(64),
    preset: 'ispo-darwin-arm64-inference-release',
  })) === exactJson({
    cmakeGenerator: 'Ninja',
    finalLinkOutputPath: 'ispo/inference/ispo_local_inference_native.node',
    linkOutputPath: 'ispo/inference/ispo_local_inference_native.node',
    normalizedFinalLinkCommandSha256: 'f'.repeat(64),
    preset: 'ispo-darwin-arm64-inference-release',
  }), 'canonical producer proof changed');
  try {
    validateCanonicalProducerEvidence({
      cmakeGenerator: 'Unix Makefiles',
      finalLinkOutputPath: 'ispo/inference/ispo_local_inference_native.node',
      linkOutputPath: 'ispo_local_inference_native.node',
      normalizedFinalLinkCommandSha256: 'f'.repeat(64),
      preset: 'ispo-darwin-arm64-inference-release',
    });
    throw new Error('canonicalized archive headers admitted the historical Make-style producer');
  } catch (error) {
    assert(error.message === 'build did not use the canonical Ninja generator',
      'historical Make-style 087d producer no longer fails at its generator boundary');
  }

  const inputBindings = validateExactInputBindings(candidateFor());
  assert(exactJson(inputBindings) === exactJson({
    source: {
      implementationHead: sourceHead,
      reviewBase: qwen3SourceIdentity.reviewBase,
      reviewHead: sourceHead,
    },
    rawLinker: {
      artifactPath: 'native/ispo_local_inference_native.node',
      forkHead: sourceHead,
      producer: {
        cmakeGenerator: 'Ninja',
        finalLinkOutputPath: 'ispo/inference/ispo_local_inference_native.node',
        preset: 'ispo-darwin-arm64-inference-release',
      },
      reproducibility: {
        rawMachOUuid: 'content-derived',
        staticArchiveMetadata: 'canonicalized-provenance',
      },
      schemaVersion: 3,
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
    preMatrixReceipt: {
      environment,
      freshPublicRoots: 2,
      identity: preMatrixReceiptIdentity,
      linker,
      producer,
      toolchain,
    },
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
  }), 'production-addon-identity-mismatch');
  expectInputFailure(candidateFor({
    productionAddon: fileIdentity(productionAddon.bytes - 1, productionAddon.sha256),
  }), 'production-addon-identity-mismatch');
  expectInputFailure(candidateFor({
    rawAddon: fileIdentity(rawAddon.bytes, 'e'.repeat(64)),
  }), 'raw-linker-identity-mismatch');
  expectInputFailure(candidateFor({
    testAddon: fileIdentity(testAddon.bytes, 'e'.repeat(64)),
  }), 'test-addon-identity-mismatch');
  expectInputFailure(candidateFor({
    testAddon: fileIdentity(testAddon.bytes - 1, testAddon.sha256),
  }), 'test-addon-identity-mismatch');
  expectInputFailure(candidateFor({
    rawLinker: { ...rawLinker, sha256: 'e'.repeat(64) },
  }), 'raw-linker-identity-mismatch');
  expectInputFailure(candidateFor({
    rawLinker: {
      ...rawLinker,
      producer: {
        ...rawLinker.producer,
        finalLinkOutputPath: 'ispo_local_inference_native.node',
      },
    },
  }), 'raw-linker-identity-invalid');
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
    license: fileIdentity(qwen3LicenseIdentity.bytes - 1, qwen3LicenseIdentity.sha256),
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
    signedAddon: { identity: productionAddon, state: 'present' },
  }), 'pre-matrix-receipt-signed-addon-mismatch');
  expectInputFailure(candidateFor({
    upstream: { ...upstream, archive: fileIdentity(upstream.archive.bytes, 'e'.repeat(64)) },
  }), 'upstream-archive-mismatch');
  expectInputFailure(candidateFor({
    upstream: { ...upstream, archive: fileIdentity(upstream.archive.bytes - 1, upstream.archive.sha256) },
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
  expectInputFailure(candidateFor({
    declaredPreMatrixReceipt: fileIdentity(preMatrixReceiptIdentity.bytes, 'e'.repeat(64)),
  }), 'pre-matrix-receipt-identity-mismatch');
  expectInputFailure(candidateFor({
    preMatrixReceipt: {
      identity: fileIdentity(preMatrixReceiptIdentity.bytes, 'e'.repeat(64)),
      receipt: preMatrixReceipt,
    },
  }), 'pre-matrix-receipt-identity-mismatch');
  expectInputFailure(candidateFor({
    productionAddon: fileIdentity(productionAddon.bytes, 'e'.repeat(64)),
    rawAddon: fileIdentity(rawAddon.bytes, 'e'.repeat(64)),
    rawLinker: { ...rawLinker, sha256: 'e'.repeat(64) },
    testAddon: fileIdentity(testAddon.bytes, 'e'.repeat(64)),
  }), 'production-addon-identity-mismatch');
  const changedLinkerReceipt = JSON.parse(JSON.stringify(preMatrixReceipt));
  changedLinkerReceipt.linker.uuid = '11111111-1111-1111-1111-111111111111';
  expectInputFailure(candidateFor({
    preMatrixReceipt: { identity: preMatrixReceiptIdentity, receipt: changedLinkerReceipt },
  }), 'pre-matrix-receipt-linker-evidence-mismatch');
  const changedMatrixReceipt = JSON.parse(JSON.stringify(preMatrixReceipt));
  changedMatrixReceipt.inputs[3].sha256 = 'e'.repeat(64);
  expectInputFailure(candidateFor({
    preMatrixReceipt: { identity: preMatrixReceiptIdentity, receipt: changedMatrixReceipt },
  }), 'pre-matrix-receipt-matrix-script-mismatch');
  const changedModelReceipt = JSON.parse(JSON.stringify(preMatrixReceipt));
  changedModelReceipt.binding.model.sha256 = 'e'.repeat(64);
  expectInputFailure(candidateFor({
    preMatrixReceipt: { identity: preMatrixReceiptIdentity, receipt: changedModelReceipt },
  }), 'pre-matrix-receipt-invalid');
  const changedProducerReceipt = JSON.parse(JSON.stringify(preMatrixReceipt));
  changedProducerReceipt.producer.linkOutputPath = 'ispo_local_inference_native.node';
  expectInputFailure(candidateFor({
    preMatrixReceipt: { identity: preMatrixReceiptIdentity, receipt: changedProducerReceipt },
  }), 'pre-matrix-receipt-invalid');
  const changedToolchainReceipt = JSON.parse(JSON.stringify(preMatrixReceipt));
  changedToolchainReceipt.toolchain.deploymentTarget = '14.4';
  expectInputFailure(candidateFor({
    preMatrixReceipt: { identity: preMatrixReceiptIdentity, receipt: changedToolchainReceipt },
  }), 'pre-matrix-receipt-invalid');
  const changedEnvironmentReceipt = JSON.parse(JSON.stringify(preMatrixReceipt));
  changedEnvironmentReceipt.environment.huggingFaceToken = 'present';
  expectInputFailure(candidateFor({
    preMatrixReceipt: { identity: preMatrixReceiptIdentity, receipt: changedEnvironmentReceipt },
  }), 'pre-matrix-receipt-invalid');
  const changedSourceReceipt = JSON.parse(JSON.stringify(preMatrixReceipt));
  changedSourceReceipt.binding.sourceImplementationHead = 'e'.repeat(40);
  changedSourceReceipt.binding.sourceReviewHead = 'e'.repeat(40);
  changedSourceReceipt.rawLinkerIdentity.forkHead = 'e'.repeat(40);
  changedSourceReceipt.source.implementationHead = 'e'.repeat(40);
  changedSourceReceipt.source.reviewHead = 'e'.repeat(40);
  expectInputFailure(candidateFor({
    preMatrixReceipt: { identity: preMatrixReceiptIdentity, receipt: changedSourceReceipt },
  }), 'pre-matrix-receipt-source-mismatch');

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
      path.join(receiptDirectory, 'missing-pre-matrix-receipt.json'),
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
