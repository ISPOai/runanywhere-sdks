'use strict';

const [addonPath, modelPath] = process.argv.slice(2);
if (!addonPath || !modelPath) {
  throw new Error('usage: node run-smoke.js /absolute/path/addon.node /absolute/path/model.gguf');
}

const native = require(addonPath);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

for (let iteration = 0; iteration < 3; iteration += 1) {
  native.initialize();
  native.loadExactLocalModel(modelPath, { contextTokens: 512, threads: 2 });
  const deltas = [];
  native.stream('Once upon a time', { maxTokens: 16 }, (delta) => deltas.push(delta));
  assert(deltas.length > 0, 'stream produced no token deltas');
  const metrics = native.metrics();
  assert(metrics.generatedTokens > 0, 'terminal metrics have no generated tokens');
  native.stream('Continue', { maxTokens: 256 }, () => native.cancel());
  assert(native.metrics().cancelledGenerations > 0, 'cancel did not terminalize generation');
  native.unload();
  native.reset();
}

native.initialize({ forceCpu: true });
native.loadExactLocalModel(modelPath, { contextTokens: 512, threads: 2, forceCpu: true });
assert(native.capabilities().backend === 'cpu-accelerate', 'forced CPU fallback was not active');
native.complete('Once upon a time', { maxTokens: 8 });
native.unload();
native.shutdown();
console.log(JSON.stringify({ status: 'ok', pid: process.pid }));
