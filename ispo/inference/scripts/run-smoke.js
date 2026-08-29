'use strict';

const { spawnSync } = require('node:child_process');

const [addonPath, modelPath] = process.argv.slice(2);
if (!addonPath || !modelPath || !addonPath.startsWith('/') || !modelPath.startsWith('/')) {
  throw new Error('usage: node run-smoke.js /absolute/path/addon.node /absolute/path/model.gguf');
}

const native = require(addonPath);
const cycles = Number.parseInt(process.env.ISPO_SMOKE_CYCLES || '20', 10);
const maxRssPlateauBytes = 8 * 1024 * 1024;

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const ordinaryReturn = (label, source) => {
  const result = spawnSync(process.execPath, ['-e', source], {
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

const lifecycleSubprocesses = () => {
  const native = `const native = require(${JSON.stringify(addonPath)});`;
  const model = JSON.stringify(modelPath);
  return [
    ordinaryReturn('initialize then ordinary return', `${native}
      native.initialize({ forceCpu: true });`),
    ordinaryReturn('load and generate then ordinary return', `${native}
      native.initialize({ forceCpu: true });
      native.loadExactLocalModel(${model}, { contextTokens: 256, threads: 2, forceCpu: true });
      const completion = native.complete('Once upon a time', { maxTokens: 8 });
      if (typeof completion !== 'string' || completion.length === 0) throw new Error('missing completion');`),
    ordinaryReturn('controlled error then ordinary return', `${native}
      native.initialize({ forceCpu: true });
      try {
        native.loadExactLocalModel('/private/tmp/ispo-missing-model.gguf');
      } catch (error) {
        if (!(error instanceof Error)) throw new Error('controlled error was not an Error');
      }`),
    ordinaryReturn('explicit shutdown then ordinary return', `${native}
      native.initialize({ forceCpu: true });
      native.shutdown();
      native.shutdown();`),
    ordinaryReturn('in-flight stream environment cleanup', `${native}
      native.initialize({ forceCpu: true });
      native.loadExactLocalModel(${model}, { contextTokens: 256, threads: 2, forceCpu: true });
      native.stream('Continue', { maxTokens: 256 }, () => {}, () => {});
      process.exit(0);`),
  ];
};

const expectJavaScriptError = (label, callback) => {
  try {
    callback();
  } catch (error) {
    assert(error instanceof Error, `${label} did not produce a JavaScript Error`);
    return { label, name: error.name, message: error.message };
  }
  throw new Error(`${label} unexpectedly succeeded`);
};

const stream = (prompt, maxTokens, options = {}) => new Promise((resolve, reject) => {
  const deltas = [];
  let timer;
  let callbackError;
  native.stream(
    prompt,
    { maxTokens },
    (delta) => {
      deltas.push(delta);
      if (options.onFirstDelta && deltas.length === 1) {
        try {
          options.onFirstDelta();
        } catch (error) {
          callbackError = error;
        }
      }
    },
    (error, metrics) => {
      if (timer) clearTimeout(timer);
      if (callbackError) {
        reject(callbackError);
      } else if (error) {
        reject(new Error(error));
      } else {
        resolve({ deltas, metrics });
      }
    },
  );
  if (options.cancelAfterMs !== undefined) {
    timer = setTimeout(() => native.cancel(), options.cancelAfterMs);
  }
});

const load = (options = {}) => native.loadExactLocalModel(modelPath, {
  contextTokens: 256,
  threads: 2,
  ...options,
});

const completeAndStream = async () => {
  const complete = native.complete('Once upon a time', { maxTokens: 8 });
  const streamed = await stream('Once upon a time', 8);
  const streamedOutput = streamed.deltas.join('');
  assert(complete === streamedOutput, 'complete and stream output differ');
  assert(streamed.metrics.generatedTokens > 0, 'terminal stream metrics reported no generated tokens');
  return { complete, streamed, streamedOutput };
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
    expectJavaScriptError('stream missing callbacks', () => native.stream('Once upon a time', { maxTokens: 8 })),
  ];

  native.initialize();
  const initialCapabilities = native.capabilities();
  assert(initialCapabilities.metalCompiled, 'Metal was not compiled into the addon');
  assert(initialCapabilities.metalInitialized, 'Metal initialization probe did not succeed on this supported host');

  const rssCheckpoints = [];
  const automaticBackends = [];
  let deterministicOutput;
  let duplicateGenerationError;
  let cancellationCount = 0;

  for (let iteration = 0; iteration < cycles; iteration += 1) {
    const loadedCapabilities = load();
    automaticBackends.push(loadedCapabilities.backend);
    assert(loadedCapabilities.loaded, 'model did not report loaded');
    assert(loadedCapabilities.backend === 'metal', 'automatic model load did not execute on Metal');

    if (iteration === 0) {
      const deterministic = await completeAndStream();
      deterministicOutput = deterministic.complete;
      const duplicate = await stream('Continue', 64, {
        onFirstDelta: () => {
          duplicateGenerationError = expectJavaScriptError(
            'duplicate generation',
            () => native.complete('competing request', { maxTokens: 8 }),
          );
          native.cancel();
        },
      });
      assert(duplicate.metrics.cancelledGenerations > 0, 'duplicate-generation stream did not terminalize as cancelled');
    } else {
      assert(native.complete('Once upon a time', { maxTokens: 8 }) === deterministicOutput,
        'repeat complete output was not deterministic');
    }

    const cancellation = await stream('Continue', 256, { cancelAfterMs: 1 });
    assert(cancellation.metrics.cancelledGenerations > cancellationCount,
      'independent timer cancellation did not terminalize generation');
    assert(cancellation.metrics.generatedTokens < 256, 'cancellation did not stop generation early');
    cancellationCount = cancellation.metrics.cancelledGenerations;

    native.unload();
    assert(!native.capabilities().loaded, 'unload did not release the model');
    native.reset();
    rssCheckpoints.push(process.memoryUsage().rss);
  }

  assert(duplicateGenerationError, 'duplicate-generation error was not observed');
  const warmCheckpoints = rssCheckpoints.slice(5);
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

  native.initialize();
  const probeBeforeInjectedFailure = native.capabilities();
  assert(probeBeforeInjectedFailure.metalInitialized, 'injected-failure test did not begin after a successful Metal probe');
  const injectedFailureCapabilities = load({ injectMetalFailureForTest: true });
  assert(injectedFailureCapabilities.backend === 'cpu-accelerate',
    'injected Metal model-load failure did not use CPU/Accelerate fallback');
  const injectedFailureOutput = native.complete('Once upon a time', { maxTokens: 8 });
  assert(injectedFailureOutput === deterministicOutput, 'injected-failure CPU output was not deterministic');
  native.unload();
  native.reset();
  native.shutdown();
  native.shutdown();

  console.log(JSON.stringify({
    status: 'ok',
    pid: process.pid,
    cycles,
    initialCapabilities,
    automaticBackends,
    deterministicOutput,
    boundaryErrors,
    duplicateGenerationError,
    cancellationCount,
    forcedCpuBackend: forcedCpuCapabilities.backend,
    injectedFailureBackend: injectedFailureCapabilities.backend,
    rssCheckpoints,
    rssPlateauBytes,
    teardownChecks,
    processExit: 'explicit-shutdown-and-ordinary-return-clean',
  }));
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
