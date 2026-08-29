'use strict';

const { spawnSync } = require('node:child_process');

const [addonPath, modelPath] = process.argv.slice(2);
if (!addonPath || !modelPath || !addonPath.startsWith('/') || !modelPath.startsWith('/')) {
  throw new Error('usage: node run-smoke.js /absolute/path/addon.node /absolute/path/model.gguf');
}

const native = require(addonPath);
const cycles = Number.parseInt(process.env.ISPO_SMOKE_CYCLES || '6', 10);
const allowCpuOnly = process.env.ISPO_SMOKE_ALLOW_CPU_ONLY === '1';
const maxRssPlateauBytes = 8 * 1024 * 1024;
const maxStalledRssGrowthBytes = 256 * 1024;
const maxDeltaBytes = 4096;
const terminalKeys = ['finishReason', 'metrics', 'type'];
const metricKeys = [
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

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const ordinaryReturn = (label, source, nodeArguments = []) => {
  const result = spawnSync(process.execPath, [...nodeArguments, '-e', source], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  assert(!result.error, `${label} could not start: ${result.error && result.error.message}`);
  assert(result.signal === null, `${label} exited from signal ${result.signal}`);
  assert(result.status === 0, `${label} exited ${result.status}: ${output}`);
  assert(!/SIGABRT|std::system_error/.test(output), `${label} reported teardown failure: ${output}`);
  return { label, status: result.status };
};

const nativeSource = `const native = require(${JSON.stringify(addonPath)});`;
const modelSource = JSON.stringify(modelPath);
const cpuLoadSource = `native.loadExactLocalModel(${modelSource}, {
  contextTokens: 256,
  threads: 2,
  forceCpu: true,
});`;

const lifecycleSubprocesses = () => [
  ordinaryReturn('initialize then ordinary return', `${nativeSource}
    native.initialize({ forceCpu: true });`),
  ordinaryReturn('load and complete then ordinary return', `${nativeSource}
    native.initialize({ forceCpu: true });
    ${cpuLoadSource}
    const completion = native.complete('Once upon a time', { maxTokens: 8 });
    if (typeof completion !== 'string' || completion.length === 0) throw new Error('missing completion');`),
  ordinaryReturn('controlled error then ordinary return', `${nativeSource}
    native.initialize({ forceCpu: true });
    try {
      native.loadExactLocalModel('/private/tmp/ispo-missing-model.gguf');
    } catch (error) {
      if (!(error instanceof Error)) throw new Error('controlled error was not an Error');
    }`),
  ordinaryReturn('explicit shutdown then ordinary return', `${nativeSource}
    native.initialize({ forceCpu: true });
    native.shutdown();
    native.shutdown();`),
  ordinaryReturn('cancel while next pending', `${nativeSource}
    (async () => {
      native.initialize({ forceCpu: true });
      ${cpuLoadSource}
      const stream = native.stream('Continue', { maxTokens: 64 });
      const pending = stream.next();
      native.cancel();
      const terminal = await pending;
      if (terminal.type !== 'terminal' || terminal.finishReason !== 'cancelled') {
        throw new Error('pending next did not settle as cancelled');
      }
    })().catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });`),
  ordinaryReturn('unload while next pending', `${nativeSource}
    (async () => {
      native.initialize({ forceCpu: true });
      ${cpuLoadSource}
      const stream = native.stream('Continue', { maxTokens: 64 });
      const pending = stream.next();
      native.unload();
      const terminal = await pending;
      if (terminal.type !== 'terminal' || terminal.finishReason !== 'cancelled') {
        throw new Error('unload did not settle pending next');
      }
      if (native.capabilities().loaded) throw new Error('unload retained the model');
    })().catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });`),
  ordinaryReturn('reset while next pending', `${nativeSource}
    (async () => {
      native.initialize({ forceCpu: true });
      ${cpuLoadSource}
      const stream = native.stream('Continue', { maxTokens: 64 });
      const pending = stream.next();
      native.reset();
      const terminal = await pending;
      if (terminal.type !== 'terminal' || terminal.finishReason !== 'cancelled') {
        throw new Error('reset did not settle pending next');
      }
      if (typeof native.complete('Once upon a time', { maxTokens: 8 }) !== 'string') {
        throw new Error('reset did not leave a usable loaded model');
      }
    })().catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });`),
  ordinaryReturn('shutdown while next pending', `${nativeSource}
    (async () => {
      native.initialize({ forceCpu: true });
      ${cpuLoadSource}
      const stream = native.stream('Continue', { maxTokens: 64 });
      const pending = stream.next();
      native.shutdown();
      const terminal = await pending;
      if (terminal.type !== 'terminal' || terminal.finishReason !== 'cancelled') {
        throw new Error('shutdown did not settle pending next');
      }
    })().catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });`),
  ordinaryReturn('abandon stream and collect', `${nativeSource}
    (async () => {
      native.initialize({ forceCpu: true });
      ${cpuLoadSource}
      const reference = new WeakRef(native.stream('Continue', { maxTokens: 64 }));
      let collected = false;
      for (let attempt = 0; attempt < 20 && !collected; attempt += 1) {
        await new Promise((resolve) => setImmediate(() => {
          global.gc();
          resolve();
        }));
        collected = reference.deref() === undefined;
        if (!collected) {
          await new Promise((resolve) => setImmediate(resolve));
        }
      }
      if (!collected) throw new Error('stream object was not collected');
      // node-addon-api posts the native ObjectWrap finalizer after V8 reports
      // the weak reference clear; give that one deterministic event-loop turn
      // before asserting that its abandonment released the generation lease.
      await new Promise((resolve) => setImmediate(resolve));
      const completion = native.complete('Once upon a time', { maxTokens: 8 });
      if (typeof completion !== 'string' || completion.length === 0) {
        throw new Error('abandoned stream retained the generation lease');
      }
    })().catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });`, ['--expose-gc']),
  ordinaryReturn('implicit Node exit while next is pending', `${nativeSource}
    native.initialize({ forceCpu: true });
    ${cpuLoadSource}
    const stream = native.stream('Continue', { maxTokens: 64 });
    void stream.next();`),
];

const expectJavaScriptError = (label, callback) => {
  try {
    callback();
  } catch (error) {
    assert(error instanceof Error, `${label} did not produce a JavaScript Error`);
    return { label, name: error.name, message: error.message };
  }
  throw new Error(`${label} unexpectedly succeeded`);
};

const expectPromiseError = async (label, promise) => {
  try {
    await promise;
  } catch (error) {
    assert(error instanceof Error, `${label} did not reject with an Error`);
    return { label, name: error.name, message: error.message };
  }
  throw new Error(`${label} unexpectedly resolved`);
};

const assertMetrics = (metrics, label, terminal = false) => {
  assert(metrics && typeof metrics === 'object', `${label} metrics were not an object`);
  assert(JSON.stringify(Object.keys(metrics).sort()) === JSON.stringify(metricKeys),
    `${label} metrics exposed an unexpected shape`);
  for (const field of ['promptTokens', 'outputTokens', 'generatedTokens', 'cancelledGenerations', 'elapsedMs', 'decodeMs']) {
    assert(typeof metrics[field] === 'number' && Number.isFinite(metrics[field]) && metrics[field] >= 0,
      `${label} ${field} was invalid`);
  }
  assert(metrics.outputTokens === metrics.generatedTokens,
    `${label} outputTokens and generatedTokens differed`);
  assert(metrics.ttftMs === null || (typeof metrics.ttftMs === 'number' && metrics.ttftMs >= 0),
    `${label} ttftMs was invalid`);
  assert(['metal', 'cpu-accelerate'].includes(metrics.backend), `${label} backend was invalid`);
  assert(typeof metrics.cancelled === 'boolean', `${label} cancellation state was invalid`);
  assert(['none', 'stop', 'length', 'cancelled', 'error'].includes(metrics.finishReason),
    `${label} finish reason was invalid`);
  if (terminal) {
    assert(metrics.finishReason !== 'none', `${label} terminal metrics did not finish`);
  }
};

const assertDelta = (step, label) => {
  assert(step && typeof step === 'object', `${label} was not an object`);
  assert(JSON.stringify(Object.keys(step).sort()) === JSON.stringify(['delta', 'type']),
    `${label} exposed an unexpected shape`);
  assert(step.type === 'delta', `${label} was not a delta`);
  assert(typeof step.delta === 'string', `${label} delta was not a string`);
  assert(Buffer.byteLength(step.delta, 'utf8') <= maxDeltaBytes, `${label} exceeded the bounded delta size`);
};

const assertTerminal = (step, label) => {
  assert(step && typeof step === 'object', `${label} was not an object`);
  assert(JSON.stringify(Object.keys(step).sort()) === JSON.stringify(terminalKeys),
    `${label} exposed an unexpected shape`);
  assert(step.type === 'terminal', `${label} was not terminal`);
  assert(['stop', 'length', 'cancelled', 'error'].includes(step.finishReason),
    `${label} had an invalid finish reason`);
  assertMetrics(step.metrics, label, true);
  assert(step.metrics.finishReason === step.finishReason,
    `${label} terminal reason did not match terminal metrics`);
  return step;
};

const consume = async (stream, label) => {
  const deltas = [];
  for (let demand = 0; demand <= 256; demand += 1) {
    const step = await stream.next();
    if (step.type === 'delta') {
      assertDelta(step, `${label} delta ${demand}`);
      deltas.push(step.delta);
      continue;
    }
    return { deltas, terminal: assertTerminal(step, `${label} terminal`) };
  }
  throw new Error(`${label} exceeded its bounded output token limit`);
};

const load = (options = {}) => native.loadExactLocalModel(modelPath, {
  contextTokens: 256,
  threads: 2,
  ...options,
});

const runStalledConsumer = async () => {
  const stream = native.stream('Once upon a time', { maxTokens: 8 });
  assert(stream && typeof stream.next === 'function', 'stream did not return an internal pull identity');
  const beforeDemand = native.metrics();
  assertMetrics(beforeDemand, 'stalled consumer before demand');
  assert(beforeDemand.outputTokens === 0, 'stream generated before the first demand');

  const first = await stream.next();
  assertDelta(first, 'stalled consumer first demand');
  const afterFirstDemand = native.metrics();
  const rssAfterFirstDemand = process.memoryUsage().rss;
  assertMetrics(afterFirstDemand, 'stalled consumer after first demand');
  assert(afterFirstDemand.outputTokens === 1, 'first demand generated more than one token');

  await delay(75);

  const afterStall = native.metrics();
  const rssAfterStall = process.memoryUsage().rss;
  assertMetrics(afterStall, 'stalled consumer after delay');
  assert(afterStall.outputTokens === afterFirstDemand.outputTokens,
    'generated-token metrics advanced without a host demand');
  assert(afterStall.elapsedMs === afterFirstDemand.elapsedMs,
    'elapsed generation time advanced without a host demand');
  const stalledRssGrowthBytes = rssAfterStall - rssAfterFirstDemand;
  assert(stalledRssGrowthBytes <= maxStalledRssGrowthBytes,
    `RSS advanced while the consumer was stalled: ${stalledRssGrowthBytes}`);

  const rest = await consume(stream, 'stalled consumer resume');
  return {
    output: [first.delta, ...rest.deltas].join(''),
    terminal: rest.terminal,
    beforeDemand,
    afterFirstDemand,
    afterStall,
    stalledRssGrowthBytes,
  };
};

const cancelBeforeFirstDemand = async () => {
  const stream = native.stream('Continue', { maxTokens: 64 });
  native.cancel();
  const terminal = assertTerminal(await stream.next(), 'cancel before first next');
  assert(terminal.finishReason === 'cancelled', 'cancel before first next was not cancelled');
  assert(terminal.metrics.outputTokens === 0, 'cancel before first next generated output');
  return terminal;
};

const cancelWhileNextPending = async () => {
  const stream = native.stream('Continue', { maxTokens: 64 });
  const pending = stream.next();
  native.cancel();
  const terminal = assertTerminal(await pending, 'cancel while next pending');
  assert(terminal.finishReason === 'cancelled', 'pending next did not settle as cancelled');
  return terminal;
};

const duplicateNext = async () => {
  const stream = native.stream('Continue', { maxTokens: 64 });
  const pending = stream.next();
  const duplicate = await expectPromiseError('double next', stream.next());
  native.cancel();
  const terminal = assertTerminal(await pending, 'double next pending result');
  assert(terminal.finishReason === 'cancelled', 'double next did not settle its original demand');
  return { duplicate, terminal };
};

(async () => {
  assert(Number.isInteger(cycles) && cycles >= 6, 'ISPO_SMOKE_CYCLES must be an integer of at least 6');
  native.shutdown();
  const teardownChecks = lifecycleSubprocesses();

  const boundaryErrors = [
    expectJavaScriptError('initialize wrong option type', () => native.initialize({ forceCpu: 'false' })),
    expectJavaScriptError('URL model input', () => native.loadExactLocalModel('https://example.invalid/model.gguf')),
    expectJavaScriptError('relative model input', () => native.loadExactLocalModel('relative-model.gguf')),
    expectJavaScriptError('missing model input', () => native.loadExactLocalModel('/private/tmp/ispo-missing-model.gguf')),
    expectJavaScriptError('wrong extension model input', () => native.loadExactLocalModel('/private/tmp/ispo-model.txt')),
    expectJavaScriptError('unloaded complete', () => native.complete('Once upon a time', { maxTokens: 8 })),
    expectJavaScriptError('stream callback contract removed', () => native.stream('Once upon a time', { maxTokens: 8 }, () => {})),
  ];

  native.initialize();
  const initialCapabilities = native.capabilities();
  assert(initialCapabilities.metalCompiled, 'Metal was not compiled into the addon');
  const metalAvailable = initialCapabilities.metalInitialized;
  assert(metalAvailable || allowCpuOnly,
    'Metal initialization probe did not succeed; set ISPO_SMOKE_ALLOW_CPU_ONLY=1 only for non-gating local diagnostics');

  const automaticLoadOptions = metalAvailable ? {} : { forceCpu: true };
  const automaticBackend = metalAvailable ? 'metal' : 'cpu-accelerate';
  if (!metalAvailable) {
    native.shutdown();
    native.initialize({ forceCpu: true });
  }

  const rssCheckpoints = [];
  const automaticBackends = [];
  let deterministicOutput;
  let stalledConsumer;
  let duplicateGenerationError;
  let cancellationCount = 0;

  for (let iteration = 0; iteration < cycles; iteration += 1) {
    const loadedCapabilities = load(automaticLoadOptions);
    automaticBackends.push(loadedCapabilities.backend);
    assert(loadedCapabilities.loaded, 'model did not report loaded');
    assert(loadedCapabilities.backend === automaticBackend, 'automatic model load selected an unexpected backend');

    if (iteration === 0) {
      deterministicOutput = native.complete('Once upon a time', { maxTokens: 8 });
      stalledConsumer = await runStalledConsumer();
      assert(stalledConsumer.output === deterministicOutput, 'stalled pull stream output was not deterministic');
      const beforeFirst = await cancelBeforeFirstDemand();
      const pendingCancellation = await cancelWhileNextPending();
      duplicateGenerationError = await duplicateNext();
      assert(beforeFirst.metrics.cancelledGenerations < pendingCancellation.metrics.cancelledGenerations,
        'independent cancellation did not advance terminal accounting');
    } else {
      assert(native.complete('Once upon a time', { maxTokens: 8 }) === deterministicOutput,
        'repeat complete output was not deterministic');
      const cancellation = await cancelWhileNextPending();
      assert(cancellation.metrics.cancelledGenerations > cancellationCount,
        'independent pending-next cancellation did not terminalize generation');
      assert(cancellation.metrics.outputTokens < 64, 'cancellation did not stop generation early');
      cancellationCount = cancellation.metrics.cancelledGenerations;
    }

    native.unload();
    assert(!native.capabilities().loaded, 'unload did not release the model');
    native.reset();
    rssCheckpoints.push(process.memoryUsage().rss);
  }

  const warmCheckpoints = rssCheckpoints.slice(1);
  const rssPlateauBytes = Math.max(...warmCheckpoints) - Math.min(...warmCheckpoints);
  assert(rssPlateauBytes <= maxRssPlateauBytes,
    `post-warmup RSS plateau exceeded ${maxRssPlateauBytes} bytes: ${rssPlateauBytes}`);

  native.shutdown();
  const shutdownError = expectJavaScriptError(
    'complete after shutdown',
    () => native.complete('Once upon a time', { maxTokens: 8 }),
  );

  native.initialize({ forceCpu: true });
  const forcedCpuCapabilities = load({ forceCpu: true });
  assert(forcedCpuCapabilities.backend === 'cpu-accelerate', 'forced CPU/Accelerate path was not active');
  const forcedCpuOutput = native.complete('Once upon a time', { maxTokens: 8 });
  assert(forcedCpuOutput === deterministicOutput, 'forced CPU output was not deterministic');
  native.unload();
  native.reset();
  native.shutdown();

  let injectedFailureBackend = 'not-run';
  if (metalAvailable) {
    native.initialize();
    const probeBeforeInjectedFailure = native.capabilities();
    assert(probeBeforeInjectedFailure.metalInitialized,
      'injected-failure test did not begin after a successful Metal probe');
    const injectedFailureCapabilities = load({ injectMetalFailureForTest: true });
    assert(injectedFailureCapabilities.backend === 'cpu-accelerate',
      'injected Metal model-load failure did not use CPU/Accelerate fallback');
    const injectedFailureOutput = native.complete('Once upon a time', { maxTokens: 8 });
    assert(injectedFailureOutput === deterministicOutput,
      'injected-failure CPU output was not deterministic');
    injectedFailureBackend = injectedFailureCapabilities.backend;
    native.unload();
    native.reset();
    native.shutdown();
  }

  native.initialize({ forceCpu: true });
  load({ contextTokens: 6, forceCpu: true });
  const lengthLimited = await consume(native.stream('Once upon a time', { maxTokens: 256 }), 'length-limited stream');
  assert(lengthLimited.terminal.finishReason === 'length',
    'context-limited stream was not distinguishable from natural stop or cancellation');
  assert(lengthLimited.terminal.metrics.outputTokens < 256,
    'context-limited stream generated beyond its safe context budget');
  native.unload();
  native.shutdown();

  console.log(JSON.stringify({
    status: 'ok',
    pid: process.pid,
    cycles,
    metalAvailable,
    initialCapabilities,
    automaticBackends,
    deterministicOutput,
    boundaryErrors,
    duplicateGenerationError,
    cancellationCount,
    forcedCpuBackend: forcedCpuCapabilities.backend,
    injectedFailureBackend,
    stalledConsumer,
    lengthLimitedMetrics: lengthLimited.terminal.metrics,
    rssCheckpoints,
    rssPlateauBytes,
    teardownChecks,
    processExit: 'explicit-shutdown-and-ordinary-return-clean',
  }));
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
