'use strict';

const addonPath = process.argv[2];
if (!addonPath || !addonPath.startsWith('/')) {
  throw new Error('usage: node test-executor-quiescence.js /absolute/path/test-addon.node');
}

const native = require(addonPath);
const requiredTestExports = [
  '__testArmExecutorQuiescenceBarrier',
  '__testExecutorQuiescenceBarrierReached',
  '__testExecutorQuiescenceProbeReturned',
  '__testReleaseExecutorQuiescenceBarrier',
  '__testRunExecutorQuiescenceProbe',
];

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

const waitForBarrier = async () => {
  for (let attempt = 0; attempt < 512; attempt += 1) {
    if (native.__testExecutorQuiescenceBarrierReached()) return;
    await nextTurn();
  }
  throw new Error('generation executor did not reach the test barrier');
};

(async () => {
  for (const key of requiredTestExports) {
    assert(typeof native[key] === 'function', `test-only export ${key} was unavailable`);
  }

  native.initialize({ forceCpu: true });
  let barrierArmed = false;
  try {
    native.__testArmExecutorQuiescenceBarrier();
    barrierArmed = true;
    const probe = native.__testRunExecutorQuiescenceProbe();
    await waitForBarrier();

    assert(!native.__testExecutorQuiescenceProbeReturned(),
      'next execution settled before the executor re-entered its quiescent wait boundary');

    native.__testReleaseExecutorQuiescenceBarrier();
    barrierArmed = false;
    await probe;
    assert(native.__testExecutorQuiescenceProbeReturned(),
      'next execution did not settle after the executor quiescence acknowledgement');
  } finally {
    if (barrierArmed) {
      native.__testReleaseExecutorQuiescenceBarrier();
    }
    native.shutdown();
  }

  console.log(JSON.stringify({ status: 'ok', test: 'generation-executor-quiescence' }));
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
