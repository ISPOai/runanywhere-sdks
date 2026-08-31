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
const allowedBackends = new Set(['metal', 'cpu-accelerate']);

class Qwen3MatrixError extends Error {
  constructor(stage) {
    super('Qwen3 admission matrix failed');
    this.stage = stage;
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
    throw new Qwen3MatrixError(stage);
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
  if (argumentsList.length !== 4) throw new Error('Qwen3 matrix arguments are invalid');
  const [addonPath, testAddonPath, modelPath, outputPath] = argumentsList;
  for (const candidate of [addonPath, testAddonPath, modelPath, outputPath]) {
    if (!path.isAbsolute(candidate)) throw new Error('Qwen3 matrix arguments are invalid');
  }
  return { addonPath, testAddonPath, modelPath, outputPath };
};

const writeReport = (outputPath, report) => {
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
};

const runQwen3AdmissionMatrix = async ({ addonPath, testAddonPath, modelPath }) => {
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
      schemaVersion: 1,
      status: 'passed',
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
  let outputPath;
  try {
    const options = parseArguments(process.argv.slice(2));
    outputPath = options.outputPath;
    const report = await runQwen3AdmissionMatrix(options);
    writeReport(outputPath, report);
  } catch (error) {
    if (outputPath) {
      const failureStage = error instanceof Qwen3MatrixError ? error.stage : 'internal';
      writeReport(outputPath, { schemaVersion: 1, status: 'failed', failureStage });
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
  qwen3ContextTokens,
  qwen3Prompt,
  runQwen3AdmissionMatrix,
};
