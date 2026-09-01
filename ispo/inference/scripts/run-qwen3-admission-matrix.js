'use strict';

const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const qwen3ContextTokens = 2048;
const qwen3Prompt = 'Reply with exactly one word.';
const expectedQwen3ChatPrompt =
  '<|im_start|>user\nReply with exactly one word.<|im_end|>\n<|im_start|>assistant\n';
const matrixCycles = 6;
const maximumOutputBytes = 8192;
const maximumStalledRssGrowthBytes = 256 * 1024;
const maximumSteadyRssPlateauBytes = 8 * 1024 * 1024;
const qwen3MatrixLimits = Object.freeze({
  allowedBackends: Object.freeze(['cpu-accelerate', 'metal']),
  contextTokens: qwen3ContextTokens,
  matrixCycles,
  maximumOutputBytes,
  maximumStalledRssGrowthBytes,
  maximumSteadyRssPlateauBytes,
});
const allowedBackends = new Set(qwen3MatrixLimits.allowedBackends);
const qwen3ModelIdentity = Object.freeze({
  bytes: 2497280256,
  sha256: '7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5',
});
const qwen3LicenseIdentity = Object.freeze({
  bytes: 11544,
  sha256: '5de36594c10839788a8c589443a8ef9d8b8d17c65a1b5807206ae037fc36c6bd',
});
const qwen3UpstreamIdentity = Object.freeze({
  archiveSha256: 'd086756e37fda7fff0d671d8106601232258d6f95384d04bf69b126445ad201d',
  licenseSha256: 'e562a2ddfaf8280537795ac5ecd34e3012b6582a147ef69ba6a6a5c08c84757d',
  patchSha256: 'e986b6ed5dbaeb0255c72490595a20102622fda8ca7aaba2cce62b26b88e5097',
  revision: 'd3bd7193ba66c15963fd1c59448f22019a8caf6e',
});
const qwen3SourceIdentity = Object.freeze({
  proposalBranch: 'ispo/qwen3-runtime-admission-v0.20.31-ispo.10',
  reviewBase: 'ac9e07f2e346ed18ea616329a13c891fdf881995',
});
const rawLinkerIdentityContract = Object.freeze({
  artifactPath: 'native/ispo_local_inference_native.node',
  reproducibility: Object.freeze({
    rawMachOUuid: 'content-derived',
    staticArchiveMetadata: 'canonicalized',
  }),
  schemaVersion: 2,
  signatureState: 'linker-generated-ad-hoc',
  stage: 'raw-linker-output-before-explicit-codesign',
});
const sha256Pattern = /^[0-9a-f]{64}$/;
const sourceHeadPattern = /^[0-9a-f]{40}$/;
const sourceRepository = path.resolve(__dirname, '../../..');
const subprocessEnvironment = Object.freeze({ PATH: '/usr/bin:/bin:/usr/sbin:/sbin' });

class Qwen3MatrixError extends Error {
  constructor(stage, failureCode) {
    super('Qwen3 admission matrix failed');
    this.failureCode = failureCode;
    this.stage = stage;
  }
}

class Qwen3MatrixInputError extends Error {
  constructor(failureCode) {
    super('Qwen3 admission matrix input was invalid');
    this.failureCode = failureCode;
  }
}

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const runStage = async (stage, operation) => {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Qwen3MatrixError) throw error;
    if (error instanceof Qwen3MatrixInputError) {
      throw new Qwen3MatrixError(stage, error.failureCode);
    }
    throw new Qwen3MatrixError(stage, 'unexpected');
  }
};

const stringValue = (value, label) => {
  try {
    return String.prototype.valueOf.call(value);
  } catch {
    throw new Error(`${label} was not a string`);
  }
};

const objectValue = (value, label) => {
  assert(value instanceof Object, `${label} was not an object`);
  return value;
};

const digest = (value) => createHash('sha256').update(value, 'utf8').digest('hex');

const inputFailure = (failureCode) => {
  throw new Qwen3MatrixInputError(failureCode);
};

const inputAssert = (condition, failureCode) => {
  if (!condition) inputFailure(failureCode);
};

const inputString = (value, failureCode) => {
  try {
    return stringValue(value, failureCode);
  } catch {
    inputFailure(failureCode);
  }
};

const exactInputRecord = (value, keys, failureCode) => {
  inputAssert(value instanceof Object && !Array.isArray(value), failureCode);
  inputAssert(JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()),
    failureCode);
  return value;
};

const boundedFileIdentity = (value, failureCode) => {
  const record = exactInputRecord(value, ['bytes', 'sha256'], failureCode);
  inputAssert(Number.isSafeInteger(record.bytes) && record.bytes >= 0, failureCode);
  inputAssert(sha256Pattern.test(record.sha256), failureCode);
  return { bytes: record.bytes, sha256: record.sha256 };
};

const sameFileIdentity = (left, right) => left.bytes === right.bytes && left.sha256 === right.sha256;

const parseRawLinkerIdentity = (value) => {
  const record = exactInputRecord(value, [
    'artifactPath',
    'forkHead',
    'reproducibility',
    'schemaVersion',
    'sha256',
    'signatureState',
    'stage',
  ], 'raw-linker-identity-invalid');
  const reproducibility = exactInputRecord(record.reproducibility, [
    'rawMachOUuid',
    'staticArchiveMetadata',
  ], 'raw-linker-identity-invalid');
  inputAssert(record.schemaVersion === rawLinkerIdentityContract.schemaVersion,
    'raw-linker-identity-invalid');
  inputAssert(record.artifactPath === rawLinkerIdentityContract.artifactPath,
    'raw-linker-identity-invalid');
  inputAssert(record.stage === rawLinkerIdentityContract.stage, 'raw-linker-identity-invalid');
  inputAssert(record.signatureState === rawLinkerIdentityContract.signatureState,
    'raw-linker-identity-invalid');
  inputAssert(reproducibility.rawMachOUuid === rawLinkerIdentityContract.reproducibility.rawMachOUuid,
    'raw-linker-identity-invalid');
  inputAssert(
    reproducibility.staticArchiveMetadata === rawLinkerIdentityContract.reproducibility.staticArchiveMetadata,
    'raw-linker-identity-invalid',
  );
  inputAssert(sourceHeadPattern.test(record.forkHead), 'raw-linker-identity-invalid');
  inputAssert(sha256Pattern.test(record.sha256), 'raw-linker-identity-invalid');
  return {
    artifactPath: record.artifactPath,
    forkHead: record.forkHead,
    reproducibility: {
      rawMachOUuid: reproducibility.rawMachOUuid,
      staticArchiveMetadata: reproducibility.staticArchiveMetadata,
    },
    schemaVersion: record.schemaVersion,
    sha256: record.sha256,
    signatureState: record.signatureState,
    stage: record.stage,
  };
};

const readRawLinkerIdentity = async (filename) => {
  let value;
  try {
    value = JSON.parse(await fs.promises.readFile(filename, 'utf8'));
  } catch {
    inputFailure('raw-linker-identity-unreadable');
  }
  try {
    return parseRawLinkerIdentity(value);
  } catch {
    inputFailure('raw-linker-identity-invalid');
  }
};

const streamFileIdentity = async (filename, label) => {
  const metadata = await fs.promises.lstat(filename);
  assert(metadata.isFile() && !metadata.isSymbolicLink(), `${label} was not a regular file`);
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of fs.createReadStream(filename, { highWaterMark: 64 * 1024 })) {
    bytes += chunk.byteLength;
    hash.update(chunk);
  }
  return { bytes, sha256: hash.digest('hex') };
};

const captureFileIdentity = async (filename, failureCode) => {
  try {
    return await streamFileIdentity(filename, failureCode);
  } catch {
    inputFailure(failureCode);
  }
};

const gitOutput = (argumentsList, failureCode) => {
  const result = spawnSync('/usr/bin/git', ['-C', sourceRepository, ...argumentsList], {
    encoding: 'utf8',
    env: subprocessEnvironment,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  inputAssert(result.error === undefined && result.status === 0, failureCode);
  return inputString(result.stdout.trim(), failureCode);
};

const readSourceFacts = () => {
  const implementationHead = gitOutput(['rev-parse', 'HEAD'], 'source-implementation-head-unavailable');
  const reviewHead = gitOutput(
    ['rev-parse', `refs/remotes/origin/${qwen3SourceIdentity.proposalBranch}`],
    'source-review-head-unavailable',
  );
  inputAssert(sourceHeadPattern.test(implementationHead), 'source-implementation-head-invalid');
  inputAssert(sourceHeadPattern.test(reviewHead), 'source-review-head-invalid');
  const sourceStatus = gitOutput(
    ['status', '--porcelain=v1', '--untracked-files=all'],
    'source-tree-status-unavailable',
  );
  inputAssert(sourceStatus === '', 'source-tree-dirty');
  const ancestry = spawnSync('/usr/bin/git', [
    '-C',
    sourceRepository,
    'merge-base',
    '--is-ancestor',
    qwen3SourceIdentity.reviewBase,
    implementationHead,
  ], {
    env: subprocessEnvironment,
    stdio: 'ignore',
  });
  inputAssert(ancestry.error === undefined && ancestry.status === 0, 'source-review-lineage-invalid');
  return { implementationHead, reviewHead, reviewBase: qwen3SourceIdentity.reviewBase };
};

const readUpstreamRevision = () => {
  let source;
  try {
    source = fs.readFileSync(path.join(sourceRepository, 'ispo/inference/CMakeLists.txt'), 'utf8');
  } catch {
    inputFailure('upstream-cmake-unreadable');
  }
  inputAssert(
    source.includes(`set(ISPO_INFERENCE_LLAMA_REVISION "${qwen3UpstreamIdentity.revision}")`) &&
      source.includes(`"${qwen3UpstreamIdentity.archiveSha256}")`),
    'upstream-cmake-identity-mismatch',
  );
  return qwen3UpstreamIdentity.revision;
};

const parseSignedAddon = (value) => {
  inputAssert(value instanceof Object && !Array.isArray(value), 'signed-addon-invalid');
  const record = value;
  const state = inputString(record.state, 'signed-addon-invalid');
  if (state === 'not-applicable') {
    exactInputRecord(record, ['state'], 'signed-addon-invalid');
    return { state };
  }
  inputAssert(state === 'present', 'signed-addon-invalid');
  exactInputRecord(record, ['identity', 'state'], 'signed-addon-invalid');
  return { identity: boundedFileIdentity(record.identity, 'signed-addon-invalid'), state };
};

const parseUpstreamEvidence = (value) => {
  const record = exactInputRecord(value, ['archive', 'license', 'patch', 'revision'], 'upstream-evidence-invalid');
  const revision = inputString(record.revision, 'upstream-evidence-invalid');
  inputAssert(sourceHeadPattern.test(revision), 'upstream-evidence-invalid');
  return {
    archive: boundedFileIdentity(record.archive, 'upstream-evidence-invalid'),
    license: boundedFileIdentity(record.license, 'upstream-evidence-invalid'),
    patch: boundedFileIdentity(record.patch, 'upstream-evidence-invalid'),
    revision,
  };
};

const parseMatrixLimits = (value) => {
  const record = exactInputRecord(value, [
    'allowedBackends',
    'contextTokens',
    'matrixCycles',
    'maximumOutputBytes',
    'maximumStalledRssGrowthBytes',
    'maximumSteadyRssPlateauBytes',
  ], 'matrix-limits-invalid');
  inputAssert(Array.isArray(record.allowedBackends), 'matrix-limits-invalid');
  const allowedBackends = record.allowedBackends.map((backend) => inputString(backend, 'matrix-limits-invalid'));
  for (const key of [
    'contextTokens',
    'matrixCycles',
    'maximumOutputBytes',
    'maximumStalledRssGrowthBytes',
    'maximumSteadyRssPlateauBytes',
  ]) {
    inputAssert(Number.isSafeInteger(record[key]) && record[key] > 0, 'matrix-limits-invalid');
  }
  return {
    allowedBackends,
    contextTokens: record.contextTokens,
    matrixCycles: record.matrixCycles,
    maximumOutputBytes: record.maximumOutputBytes,
    maximumStalledRssGrowthBytes: record.maximumStalledRssGrowthBytes,
    maximumSteadyRssPlateauBytes: record.maximumSteadyRssPlateauBytes,
  };
};

const validateExactInputBindings = (candidate) => {
  const source = exactInputRecord(candidate.source, [
    'declaredImplementationHead',
    'declaredReviewHead',
    'implementationHead',
    'reviewBase',
    'reviewHead',
  ], 'source-evidence-invalid');
  for (const key of Object.keys(source)) {
    inputAssert(sourceHeadPattern.test(inputString(source[key], 'source-evidence-invalid')),
      'source-evidence-invalid');
  }
  const rawLinker = parseRawLinkerIdentity(candidate.rawLinker);
  const productionAddon = boundedFileIdentity(candidate.productionAddon, 'production-addon-invalid');
  const rawAddon = boundedFileIdentity(candidate.rawAddon, 'raw-addon-invalid');
  const signedAddon = parseSignedAddon(candidate.signedAddon);
  const testAddon = boundedFileIdentity(candidate.testAddon, 'test-addon-invalid');
  const model = boundedFileIdentity(candidate.model, 'model-identity-invalid');
  const license = boundedFileIdentity(candidate.license, 'license-identity-invalid');
  const upstream = parseUpstreamEvidence(candidate.upstream);
  const matrixScript = boundedFileIdentity(candidate.matrixScript, 'matrix-script-invalid');
  const declaredMatrixScript = boundedFileIdentity(candidate.declaredMatrixScript, 'matrix-script-invalid');
  const limits = parseMatrixLimits(candidate.limits);

  inputAssert(source.declaredImplementationHead === source.implementationHead,
    'source-implementation-head-mismatch');
  inputAssert(source.declaredReviewHead === source.reviewHead && source.implementationHead === source.reviewHead,
    'source-review-head-mismatch');
  inputAssert(source.reviewBase === qwen3SourceIdentity.reviewBase, 'source-review-lineage-invalid');
  inputAssert(rawLinker.forkHead === source.implementationHead, 'raw-linker-source-head-mismatch');
  inputAssert(rawLinker.sha256 === rawAddon.sha256, 'raw-linker-identity-mismatch');
  if (signedAddon.state === 'not-applicable') {
    inputAssert(sameFileIdentity(productionAddon, rawAddon), 'raw-production-addon-mismatch');
  } else {
    inputAssert(sameFileIdentity(signedAddon.identity, productionAddon), 'signed-addon-identity-mismatch');
  }
  inputAssert(sameFileIdentity(model, qwen3ModelIdentity), 'model-identity-mismatch');
  inputAssert(sameFileIdentity(license, qwen3LicenseIdentity), 'license-identity-mismatch');
  inputAssert(upstream.revision === qwen3UpstreamIdentity.revision, 'upstream-revision-mismatch');
  inputAssert(upstream.archive.sha256 === qwen3UpstreamIdentity.archiveSha256, 'upstream-archive-mismatch');
  inputAssert(upstream.license.sha256 === qwen3UpstreamIdentity.licenseSha256, 'upstream-license-mismatch');
  inputAssert(upstream.patch.sha256 === qwen3UpstreamIdentity.patchSha256, 'upstream-patch-mismatch');
  inputAssert(sameFileIdentity(matrixScript, declaredMatrixScript), 'matrix-script-identity-mismatch');
  inputAssert(JSON.stringify(limits) === JSON.stringify(qwen3MatrixLimits), 'matrix-limits-mismatch');

  return {
    source: {
      implementationHead: source.implementationHead,
      reviewBase: source.reviewBase,
      reviewHead: source.reviewHead,
    },
    rawLinker: {
      reproducibility: rawLinker.reproducibility,
      sha256: rawLinker.sha256,
      signatureState: rawLinker.signatureState,
      stage: rawLinker.stage,
    },
    nativeArtifacts: {
      productionAddon,
      rawAddon,
      signedAddon,
      testAddon,
    },
    model,
    license,
    upstream,
    matrixScript,
    limits,
  };
};

const captureExactInputBindings = async ({
  addonPath,
  declaredMatrixScript,
  licensePath,
  modelPath,
  rawAddonPath,
  rawLinkerIdentityPath,
  signedAddonPath,
  sourceImplementationHead,
  sourceReviewHead,
  testAddonPath,
  upstreamArchivePath,
  upstreamLicensePath,
  upstreamPatchPath,
}) => {
  const productionAddon = await captureFileIdentity(addonPath, 'production-addon-unreadable');
  const testAddon = await captureFileIdentity(testAddonPath, 'test-addon-unreadable');
  const model = await captureFileIdentity(modelPath, 'model-unreadable');
  const license = await captureFileIdentity(licensePath, 'license-unreadable');
  const rawAddon = await captureFileIdentity(rawAddonPath, 'raw-addon-unreadable');
  const rawLinker = await readRawLinkerIdentity(rawLinkerIdentityPath);
  const source = readSourceFacts();
  const upstream = {
    archive: await captureFileIdentity(upstreamArchivePath, 'upstream-archive-unreadable'),
    license: await captureFileIdentity(upstreamLicensePath, 'upstream-license-unreadable'),
    patch: await captureFileIdentity(upstreamPatchPath, 'upstream-patch-unreadable'),
    revision: readUpstreamRevision(),
  };
  const matrixScript = await captureFileIdentity(__filename, 'matrix-script-unreadable');
  const signedAddon = signedAddonPath === null
    ? { state: 'not-applicable' }
    : { identity: await captureFileIdentity(signedAddonPath, 'signed-addon-unreadable'), state: 'present' };
  return validateExactInputBindings({
    declaredMatrixScript,
    license,
    limits: qwen3MatrixLimits,
    matrixScript,
    model,
    productionAddon,
    rawAddon,
    rawLinker,
    signedAddon,
    source: {
      declaredImplementationHead: sourceImplementationHead,
      declaredReviewHead: sourceReviewHead,
      ...source,
    },
    testAddon,
    upstream,
  });
};

const elapsed = (operation) => {
  const startedAt = Date.now();
  const value = operation();
  return { elapsedMs: Date.now() - startedAt, value };
};

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const releaseNative = (native) => {
  try {
    native.unload();
  } catch {
    // A failed load can leave no model to unload; shutdown still owns the remaining state.
  } finally {
    native.shutdown();
  }
};

const loadedCapabilities = (native, label) => {
  const capabilities = objectValue(native.capabilities(), `${label} capabilities`);
  assert(capabilities.loaded === true, `${label} did not retain a loaded model`);
  assert(allowedBackends.has(capabilities.backend), `${label} selected an unknown backend`);
  return capabilities;
};

const loadExactQwen3 = (native, modelPath, options, label) => {
  native.loadExactLocalModel(modelPath, {
    contextTokens: qwen3ContextTokens,
    threads: 2,
    ...options,
  });
  return loadedCapabilities(native, label);
};

const assertMetrics = (value, label) => {
  const metrics = objectValue(value, `${label} metrics`);
  const expectedKeys = [
    'backend',
    'cancelled',
    'cancelledGenerations',
    'decodeMs',
    'elapsedMs',
    'finishReason',
    'generatedTokens',
    'outputTokens',
    'promptTokens',
    'ttftMs',
  ];
  assert(JSON.stringify(Object.keys(metrics).sort()) === JSON.stringify(expectedKeys),
    `${label} metrics exposed an unexpected shape`);
  for (const key of ['promptTokens', 'outputTokens', 'generatedTokens', 'cancelledGenerations', 'decodeMs', 'elapsedMs']) {
    assert(Number.isFinite(metrics[key]) && metrics[key] >= 0, `${label} ${key} was invalid`);
  }
  assert(metrics.outputTokens === metrics.generatedTokens,
    `${label} output token accounting diverged`);
  assert(allowedBackends.has(metrics.backend), `${label} backend was invalid`);
  assert(metrics.cancelled === true || metrics.cancelled === false, `${label} cancellation state was invalid`);
  assert(['none', 'stop', 'length', 'cancelled', 'error'].includes(metrics.finishReason),
    `${label} finish reason was invalid`);
  assert(metrics.ttftMs === null || (Number.isFinite(metrics.ttftMs) && metrics.ttftMs >= 0),
    `${label} ttftMs was invalid`);
  return metrics;
};

const assertDelta = (value, label) => {
  const step = objectValue(value, label);
  assert(JSON.stringify(Object.keys(step).sort()) === JSON.stringify(['delta', 'type']),
    `${label} exposed an unexpected shape`);
  assert(step.type === 'delta', `${label} was not a pull delta`);
  const delta = stringValue(step.delta, `${label} delta`);
  assert(Buffer.byteLength(delta, 'utf8') <= maximumOutputBytes, `${label} exceeded the output bound`);
  return delta;
};

const assertTerminal = (value, label) => {
  const step = objectValue(value, label);
  assert(JSON.stringify(Object.keys(step).sort()) === JSON.stringify(['finishReason', 'metrics', 'type']),
    `${label} exposed an unexpected shape`);
  assert(step.type === 'terminal', `${label} was not terminal`);
  assert(['stop', 'length', 'cancelled', 'error'].includes(step.finishReason),
    `${label} had an invalid terminal reason`);
  const metrics = assertMetrics(step.metrics, label);
  assert(metrics.finishReason === step.finishReason, `${label} terminal reason diverged from metrics`);
  return { metrics, reason: step.finishReason };
};

const consumePullStream = async (stream, label) => {
  const deltas = [];
  for (let demand = 0; demand <= 2; demand += 1) {
    const step = await stream.next();
    if (step.type === 'delta') {
      deltas.push(assertDelta(step, `${label} delta ${demand}`));
      continue;
    }
    return { deltas, terminal: assertTerminal(step, `${label} terminal`) };
  }
  throw new Error(`${label} exceeded its bounded demand budget`);
};

const runTemplateCheck = (testNative, modelPath) => {
  try {
    testNative.initialize({ forceCpu: true });
    const templateLoad = elapsed(() => loadExactQwen3(testNative, modelPath, { forceCpu: true }, 'template addon'));
    assert(templateLoad.value.backend === 'cpu-accelerate', 'template addon did not use forced CPU/Accelerate');
    const template = stringValue(testNative.__testRenderChatTemplate(qwen3Prompt), 'Qwen3 chat template');
    assert(template === expectedQwen3ChatPrompt, 'Qwen3 ChatML template output was not exact');
    return { loadMs: templateLoad.elapsedMs, verified: true };
  } finally {
    releaseNative(testNative);
  }
};

const runStaticMetalCheck = (testNative) => {
  try {
    testNative.initialize();
    const capabilities = objectValue(testNative.capabilities(), 'test addon capabilities');
    assert(capabilities.metalCompiled === true, 'test addon did not compile Metal');
    assert(capabilities.metalInitialized === true, 'eligible host did not initialize Metal');
    assert(testNative.__testStaticMetalResidencyDisabled() === true,
      'static Metal initialization retained a residency set');
    return { backend: capabilities.backend, residencySets: 'disabled' };
  } finally {
    testNative.shutdown();
  }
};

const runStalledPullCheck = async (native) => {
  const stream = native.stream(qwen3Prompt, { maxTokens: 2 });
  const beforeDemand = assertMetrics(native.metrics(), 'stalled pull before demand');
  assert(beforeDemand.outputTokens === 0, 'stream generated before demand');

  const first = assertDelta(await stream.next(), 'stalled pull first demand');
  const afterFirstDemand = assertMetrics(native.metrics(), 'stalled pull after first demand');
  const rssAfterFirstDemand = process.memoryUsage().rss;
  assert(afterFirstDemand.outputTokens === 1, 'one demand generated more than one token');

  await delay(75);
  const afterStall = assertMetrics(native.metrics(), 'stalled pull after delay');
  const rssAfterStall = process.memoryUsage().rss;
  assert(afterStall.outputTokens === afterFirstDemand.outputTokens,
    'generation advanced while the consumer was stalled');
  assert(afterStall.elapsedMs === afterFirstDemand.elapsedMs,
    'generation time advanced while the consumer was stalled');
  const stalledRssGrowthBytes = rssAfterStall - rssAfterFirstDemand;
  assert(stalledRssGrowthBytes <= maximumStalledRssGrowthBytes,
    'RSS advanced while the consumer was stalled');

  const remainder = await consumePullStream(stream, 'stalled pull resume');
  const output = `${first}${remainder.deltas.join('')}`;
  assert(Buffer.byteLength(output, 'utf8') > 0, 'pull stream generated no output');
  return {
    afterFirstDemandTokens: afterFirstDemand.outputTokens,
    afterStallTokens: afterStall.outputTokens,
    outputBytes: Buffer.byteLength(output, 'utf8'),
    outputSha256: digest(output),
    stalledRssGrowthBytes,
    terminalReason: remainder.terminal.reason,
  };
};

const runCancellationCheck = async (native) => {
  const stream = native.stream(qwen3Prompt, { maxTokens: 2 });
  const pending = stream.next();
  native.cancel();
  const terminal = assertTerminal(await pending, 'cancelled pull');
  assert(terminal.reason === 'cancelled', 'independent cancellation did not terminalize the pending demand');
  return {
    cancelledGenerations: terminal.metrics.cancelledGenerations,
    outputTokens: terminal.metrics.outputTokens,
  };
};

const runOrdinaryExitCheck = (addonPath, modelPath) => {
  const childSource = `
const native = require(${JSON.stringify(addonPath)});
const modelPath = ${JSON.stringify(modelPath)};
const prompt = ${JSON.stringify(qwen3Prompt)};
(async () => {
  try {
    native.initialize({ forceCpu: true });
    native.loadExactLocalModel(modelPath, { contextTokens: 2048, threads: 2, forceCpu: true });
    let stream = native.stream(prompt, { maxTokens: 2 });
    await stream.next();
    const reference = new WeakRef(stream);
    stream = null;
    for (let attempt = 0; attempt < 20 && reference.deref() !== undefined; attempt += 1) {
      global.gc();
      await new Promise((resolve) => setImmediate(resolve));
    }
    if (reference.deref() !== undefined) throw new Error('stream collection did not complete');
    await new Promise((resolve) => setImmediate(resolve));
    const completion = native.complete(prompt, { maxTokens: 2 });
    if (Buffer.byteLength(completion, 'utf8') === 0) throw new Error('GC retained the generation lease');
    native.unload();
    native.shutdown();
  } catch {
    process.exitCode = 1;
  }
})();
`;
  const result = spawnSync(process.execPath, ['--expose-gc', '-e', childSource], {
    env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
    stdio: 'ignore',
  });
  assert(result.error === undefined, 'ordinary-exit child could not start');
  assert(result.signal === null, 'ordinary-exit child terminated by signal');
  assert(result.status === 0, 'ordinary-exit child failed');
  return { gc: 'stream-collected', ordinaryExit: 'clean' };
};

const runOfflineStreamCheck = (addonPath, modelPath) => {
  const childSource = `
const native = require(${JSON.stringify(addonPath)});
const modelPath = ${JSON.stringify(modelPath)};
const prompt = ${JSON.stringify(qwen3Prompt)};
(async () => {
  try {
    native.initialize({ forceCpu: true });
    native.loadExactLocalModel(modelPath, { contextTokens: 2048, threads: 2, forceCpu: true });
    const stream = native.stream(prompt, { maxTokens: 2 });
    const first = await stream.next();
    if (first.type !== 'delta') throw new Error('offline stream produced no delta');
    const second = await stream.next();
    const terminal = second.type === 'delta' ? await stream.next() : second;
    if (terminal.type !== 'terminal') throw new Error('offline stream did not terminalize');
    native.unload();
    native.shutdown();
  } catch {
    process.exitCode = 1;
  }
})();
`;
  const result = spawnSync('/usr/bin/sandbox-exec', [
    '-p',
    '(version 1) (allow default) (deny network*)',
    process.execPath,
    '-e',
    childSource,
  ], {
    env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
    stdio: 'ignore',
  });
  assert(result.error === undefined, 'offline child could not start');
  assert(result.signal === null, 'offline child terminated by signal');
  assert(result.status === 0, 'offline stream did not complete under physical network denial');
  return { metadataDownloadTransport: 'seatbelt-deny-network', stream: 'completed' };
};

const parseArguments = (argumentsList) => {
  if (argumentsList.length !== 17) throw new Error('Qwen3 matrix arguments are invalid');
  const [
    addonPath,
    testAddonPath,
    modelPath,
    licensePath,
    rawAddonPath,
    rawLinkerIdentityPath,
    sourceImplementationHead,
    sourceReviewHead,
    upstreamArchivePath,
    upstreamLicensePath,
    upstreamPatchPath,
    signedAddonArgument,
    matrixScriptBytes,
    matrixScriptSha256,
    outputPath,
    logPath,
    receiptPath,
  ] = argumentsList;
  for (const candidate of [
    addonPath,
    testAddonPath,
    modelPath,
    licensePath,
    rawAddonPath,
    rawLinkerIdentityPath,
    upstreamArchivePath,
    upstreamLicensePath,
    upstreamPatchPath,
    outputPath,
    logPath,
    receiptPath,
  ]) {
    if (!path.isAbsolute(candidate)) throw new Error('Qwen3 matrix arguments are invalid');
  }
  if (
    !sourceHeadPattern.test(sourceImplementationHead) ||
    !sourceHeadPattern.test(sourceReviewHead) ||
    !sha256Pattern.test(matrixScriptSha256)
  ) {
    throw new Error('Qwen3 matrix arguments are invalid');
  }
  const declaredMatrixScriptBytes = Number(matrixScriptBytes);
  if (!Number.isSafeInteger(declaredMatrixScriptBytes) || declaredMatrixScriptBytes <= 0) {
    throw new Error('Qwen3 matrix arguments are invalid');
  }
  const signedAddonPath = signedAddonArgument === 'not-applicable' ? null : signedAddonArgument;
  if (signedAddonPath !== null && !path.isAbsolute(signedAddonPath)) {
    throw new Error('Qwen3 matrix arguments are invalid');
  }
  return {
    addonPath,
    declaredMatrixScript: { bytes: declaredMatrixScriptBytes, sha256: matrixScriptSha256 },
    licensePath,
    logPath,
    modelPath,
    outputPath,
    rawAddonPath,
    rawLinkerIdentityPath,
    receiptPath,
    signedAddonPath,
    sourceImplementationHead,
    sourceReviewHead,
    testAddonPath,
    upstreamArchivePath,
    upstreamLicensePath,
    upstreamPatchPath,
  };
};

const writeJson = (filename, value) => {
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const writeMatrixArtifacts = async (options, report) => {
  const failed = report.status === 'failed';
  const log = failed
    ? {
      schemaVersion: 1,
      status: 'failed',
      event: {
        failureCode: report.failureCode,
        failureStage: report.failureStage,
        kind: 'matrix-failed',
      },
    }
    : {
      schemaVersion: 1,
      status: 'passed',
      event: { kind: 'matrix-completed' },
    };
  writeJson(options.outputPath, report);
  writeJson(options.logPath, log);
  const [reportIdentity, logIdentity] = await Promise.all([
    streamFileIdentity(options.outputPath, 'matrix output'),
    streamFileIdentity(options.logPath, 'matrix log'),
  ]);
  const receipt = {
    schemaVersion: 1,
    status: report.status,
    failure: failed
      ? { failureCode: report.failureCode, failureStage: report.failureStage }
      : null,
    inputBindings: failed ? null : report.inputBindings,
    output: {
      log: logIdentity,
      report: reportIdentity,
    },
  };
  writeJson(options.receiptPath, receipt);
  return receipt;
};

const runQwen3AdmissionMatrix = async ({ addonPath, inputBindings, testAddonPath, modelPath }) => {
  const native = require(addonPath);
  const testNative = require(testAddonPath);
  try {
    const staticMetal = await runStage('static-metal', () => runStaticMetalCheck(testNative));
    const template = await runStage('template', () => runTemplateCheck(testNative, modelPath));

    native.initialize();
    const initialCapabilities = objectValue(native.capabilities(), 'production addon capabilities');
    assert(initialCapabilities.metalCompiled === true, 'production addon did not compile Metal');
    assert(initialCapabilities.metalInitialized === true, 'eligible host did not initialize Metal');

    const metalLoad = await runStage('metal-load', () => elapsed(() => loadExactQwen3(native, modelPath, {}, 'Metal addon')));
    assert(metalLoad.value.backend === 'metal', 'positive Metal load selected an unexpected backend');
    const rssAfterMetalLoad = process.memoryUsage().rss;

    const metalCompletion = await runStage('metal-completion', () => elapsed(() => {
      const completion = stringValue(native.complete(qwen3Prompt, { maxTokens: 2 }), 'Metal completion');
      assert(Buffer.byteLength(completion, 'utf8') > 0, 'Metal completion generated no output');
      assert(Buffer.byteLength(completion, 'utf8') <= maximumOutputBytes, 'Metal completion exceeded the output bound');
      return completion;
    }));
    const rssAfterMetalCompletion = process.memoryUsage().rss;
    const stalledPull = await runStage('pull-backpressure', () => runStalledPullCheck(native));
    const rssAfterPullSteady = process.memoryUsage().rss;
    const cancellation = await runStage('cancellation', () => runCancellationCheck(native));
    native.unload();
    assert(native.capabilities().loaded === false, 'unload retained the model');
    native.reset();

    const lifecycleRss = [process.memoryUsage().rss];
    for (let iteration = 1; iteration < matrixCycles; iteration += 1) {
      const lifecycleLoad = loadExactQwen3(native, modelPath, {}, 'lifecycle addon');
      assert(lifecycleLoad.backend === 'metal', 'lifecycle reload did not select Metal');
      const output = stringValue(native.complete(qwen3Prompt, { maxTokens: 2 }), 'lifecycle completion');
      assert(Buffer.byteLength(output, 'utf8') > 0, 'lifecycle completion generated no output');
      native.unload();
      assert(native.capabilities().loaded === false, 'lifecycle unload retained the model');
      native.reset();
      lifecycleRss.push(process.memoryUsage().rss);
    }
    const warmLifecycleRss = lifecycleRss.slice(1);
    const steadyRssPlateauBytes = Math.max(...warmLifecycleRss) - Math.min(...warmLifecycleRss);
    assert(steadyRssPlateauBytes <= maximumSteadyRssPlateauBytes,
      'post-warmup lifecycle RSS plateau exceeded the sealed-runtime limit');
    native.shutdown();

    native.initialize({ forceCpu: true });
    const forcedCpuLoad = await runStage('forced-cpu-load', () => elapsed(() =>
      loadExactQwen3(native, modelPath, { forceCpu: true }, 'forced CPU addon')));
    assert(forcedCpuLoad.value.backend === 'cpu-accelerate', 'forced CPU/Accelerate was not active');
    const forcedCpuCompletion = await runStage('forced-cpu-completion', () => elapsed(() => {
      const completion = stringValue(native.complete(qwen3Prompt, { maxTokens: 2 }), 'forced CPU completion');
      assert(Buffer.byteLength(completion, 'utf8') > 0, 'forced CPU completion generated no output');
      return completion;
    }));
    native.unload();
    native.reset();
    native.shutdown();

    native.initialize();
    assert(native.capabilities().metalInitialized === true,
      'injected fallback did not begin after a positive Metal probe');
    const fallbackLoad = await runStage('injected-metal-fallback', () => elapsed(() =>
      loadExactQwen3(native, modelPath, { injectMetalFailureForTest: true }, 'fallback addon')));
    assert(fallbackLoad.value.backend === 'cpu-accelerate',
      'injected Metal model-load failure did not select CPU/Accelerate');
    const fallbackCompletion = await runStage('fallback-completion', () => elapsed(() => {
      const completion = stringValue(native.complete(qwen3Prompt, { maxTokens: 2 }), 'fallback completion');
      assert(Buffer.byteLength(completion, 'utf8') > 0, 'fallback completion generated no output');
      return completion;
    }));
    native.unload();
    native.reset();
    native.shutdown();

    const ordinaryExit = await runStage('ordinary-exit', () => runOrdinaryExitCheck(addonPath, modelPath));
    const offline = await runStage('offline-stream', () => runOfflineStreamCheck(addonPath, modelPath));

    return {
      schemaVersion: 3,
      status: 'passed',
      inputBindings,
      template: {
        kind: 'qwen3-chatml-single-user',
        contextTokens: qwen3ContextTokens,
        verified: template.verified,
      },
      backend: {
        metal: metalLoad.value.backend,
        forcedCpu: forcedCpuLoad.value.backend,
        injectedMetalFallback: fallbackLoad.value.backend,
        staticMetal,
      },
      output: {
        metalCompletionBytes: Buffer.byteLength(metalCompletion.value, 'utf8'),
        metalCompletionSha256: digest(metalCompletion.value),
        pullStreamBytes: stalledPull.outputBytes,
        pullStreamSha256: stalledPull.outputSha256,
        forcedCpuCompletionBytes: Buffer.byteLength(forcedCpuCompletion.value, 'utf8'),
        fallbackCompletionBytes: Buffer.byteLength(fallbackCompletion.value, 'utf8'),
      },
      timing: {
        templateLoadMs: template.loadMs,
        metalLoadMs: metalLoad.elapsedMs,
        metalCompletionMs: metalCompletion.elapsedMs,
        forcedCpuLoadMs: forcedCpuLoad.elapsedMs,
        forcedCpuCompletionMs: forcedCpuCompletion.elapsedMs,
        fallbackLoadMs: fallbackLoad.elapsedMs,
        fallbackCompletionMs: fallbackCompletion.elapsedMs,
      },
      rss: {
        modelAndContextAfterLoadBytes: rssAfterMetalLoad,
        modelAndContextPeakBytes: Math.max(rssAfterMetalLoad, rssAfterMetalCompletion, rssAfterPullSteady),
        modelAndContextSteadyBytes: rssAfterPullSteady,
        postLifecycleSteadyRssBytes: lifecycleRss.at(-1),
        postWarmupLifecyclePlateauBytes: steadyRssPlateauBytes,
      },
      streaming: {
        pull: 'completed',
        noDemandBackpressure: stalledPull,
        cancellation,
      },
      lifecycle: {
        cycles: matrixCycles,
        unloadResetReload: 'passed',
        ordinaryExit,
      },
      offline,
    };
  } finally {
    releaseNative(testNative);
    releaseNative(native);
  }
};

const main = async () => {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
    const inputBindings = await runStage('input-bindings', () => captureExactInputBindings(options));
    const report = await runQwen3AdmissionMatrix({ ...options, inputBindings });
    await writeMatrixArtifacts(options, report);
  } catch (error) {
    if (options) {
      const failureStage = error instanceof Qwen3MatrixError ? error.stage : 'internal';
      const failureCode = error instanceof Qwen3MatrixError ? error.failureCode : 'unexpected';
      try {
        await writeMatrixArtifacts(options, {
          failureCode,
          failureStage,
          schemaVersion: 3,
          status: 'failed',
        });
      } catch {
        // The matrix receipt is best-effort only after an output-path failure; runtime remains failed.
      }
    }
    process.stderr.write('Qwen3 admission matrix failed\n');
    process.exitCode = 1;
  }
};

if (require.main === module) {
  void main();
}

module.exports = {
  expectedQwen3ChatPrompt,
  matrixCycles,
  parseRawLinkerIdentity,
  qwen3MatrixLimits,
  qwen3ContextTokens,
  qwen3LicenseIdentity,
  qwen3ModelIdentity,
  qwen3Prompt,
  qwen3SourceIdentity,
  qwen3UpstreamIdentity,
  runQwen3AdmissionMatrix,
  validateExactInputBindings,
  writeMatrixArtifacts,
};
