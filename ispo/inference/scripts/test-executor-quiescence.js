'use strict';

const addonPath = process.argv[2];
if (!addonPath || !addonPath.startsWith('/')) {
  throw new Error('usage: node test-executor-quiescence.js /absolute/path/test-addon.node');
}

const native = require(addonPath);
const requiredTestExports = [
  '__testArmPostAutoreleaseSettlementBarrier',
  '__testPostAutoreleaseSettlementBarrierReached',
  '__testPostAutoreleaseSettlementProbeReturned',
  '__testReleasePostAutoreleaseSettlementBarrier',
  '__testRunPostAutoreleaseSettlementProbe',
];

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

const waitForBarrier = async () => {
  for (let attempt = 0; attempt < 512; attempt += 1) {
    if (native.__testPostAutoreleaseSettlementBarrierReached()) return;
    await nextTurn();
  }
  throw new Error('post-autorelease settlement boundary was not reached');
};

const assertPromisePending = async (probe, message) => {
  let settled = false;
  void probe.then(
    () => { settled = true; },
    () => { settled = true; },
  );
  await nextTurn();
  assert(!settled, message);
};

(async () => {
  for (const key of requiredTestExports) {
    assert(Object.hasOwn(native, key), `test-only export ${key} was unavailable`);
  }

  native.initialize({ forceCpu: true });
  let barrierArmed = false;
  try {
    native.__testArmPostAutoreleaseSettlementBarrier();
    barrierArmed = true;
    const probe = native.__testRunPostAutoreleaseSettlementProbe();
    await waitForBarrier();

    assert(!native.__testPostAutoreleaseSettlementProbeReturned(),
      'next execution settled before the post-autorelease settlement boundary released');
    await assertPromisePending(
      probe,
      'next Promise resolved before the post-autorelease settlement boundary released',
    );

    native.cancel();
    native.reset();
    await assertPromisePending(
      probe,
      'cancellation or reset bypassed the post-autorelease completion boundary',
    );

    native.__testReleasePostAutoreleaseSettlementBarrier();
    barrierArmed = false;
    await probe;
    assert(native.__testPostAutoreleaseSettlementProbeReturned(),
      'next execution did not settle after the post-autorelease boundary released');

    native.__testArmPostAutoreleaseSettlementBarrier();
    barrierArmed = true;
    const shutdownProbe = native.__testRunPostAutoreleaseSettlementProbe();
    await waitForBarrier();
    await assertPromisePending(
      shutdownProbe,
      'shutdown probe resolved before lifecycle cleanup released the settlement boundary',
    );
    native.shutdown();
    barrierArmed = false;
    await shutdownProbe;
    assert(native.__testPostAutoreleaseSettlementProbeReturned(),
      'shutdown did not drain the post-autorelease settlement probe before exit');
  } finally {
    if (barrierArmed) {
      native.__testReleasePostAutoreleaseSettlementBarrier();
    }
    native.shutdown();
  }

  console.log(JSON.stringify({ status: 'ok', test: 'post-autorelease-settlement' }));
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
