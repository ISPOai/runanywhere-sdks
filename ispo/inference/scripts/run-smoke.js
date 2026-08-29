'use strict';

const [addonPath, modelPath] = process.argv.slice(2);
if (!addonPath || !modelPath) {
  throw new Error('usage: node run-smoke.js /absolute/path/addon.node /absolute/path/model.gguf');
}

const native = require(addonPath);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const stream = (prompt, maxTokens, cancelAfterMs) => new Promise((resolve, reject) => {
  const deltas = [];
  let timer;
  native.stream(prompt, { maxTokens }, (delta) => deltas.push(delta), (error, metrics) => {
    if (timer) clearTimeout(timer);
    if (error) reject(new Error(error));
    else resolve({ deltas, metrics });
  });
  if (cancelAfterMs !== undefined) {
    timer = setTimeout(() => native.cancel(), cancelAfterMs);
  }
});

(async () => {
  const automaticBackends = [];
  for (let iteration = 0; iteration < 3; iteration += 1) {
    native.initialize();
    native.loadExactLocalModel(modelPath, { contextTokens: 512, threads: 2 });
    automaticBackends.push(native.capabilities().backend);
    const result = await stream('Once upon a time', 16);
    assert(result.deltas.length > 0, 'stream produced no token deltas');
    assert(result.metrics.generatedTokens > 0, 'terminal metrics have no generated tokens');
    const cancelled = await stream('Continue', 256, 1);
    assert(cancelled.metrics.cancelledGenerations > 0, 'independent timer cancellation did not terminalize generation');
    assert(cancelled.metrics.generatedTokens < 256, 'cancellation did not stop generation early');
    native.unload();
    native.reset();
  }

  native.initialize({ forceCpu: true });
  native.loadExactLocalModel(modelPath, { contextTokens: 512, threads: 2, forceCpu: true });
  assert(native.capabilities().backend === 'cpu-accelerate', 'forced CPU fallback was not active');
  const forcedCpu = await stream('Once upon a time', 8);
  native.unload();
  native.shutdown();
  console.log(JSON.stringify({
    status: 'ok',
    pid: process.pid,
    automaticBackends,
    forcedCpuBackend: forcedCpu.metrics.backend,
    forcedCpuTokens: forcedCpu.metrics.generatedTokens,
  }));
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
