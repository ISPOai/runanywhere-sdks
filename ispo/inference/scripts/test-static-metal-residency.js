'use strict';

const addonPath = process.argv[2];
if (!addonPath || !addonPath.startsWith('/')) {
  throw new Error('usage: node test-static-metal-residency.js /absolute/path/test-addon.node');
}

const native = require(addonPath);

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

try {
  assert(Object.hasOwn(native, '__testStaticMetalResidencyDisabled'),
    'test-only static Metal residency export was unavailable');

  native.initialize();
  const capabilities = native.capabilities();
  assert(capabilities.metalCompiled, 'sealed addon did not compile Metal');
  assert(capabilities.metalInitialized, 'eligible host did not initialize Metal');
  assert(native.__testStaticMetalResidencyDisabled(),
    'sealed static Metal initialization retained a residency-set allocation');

  console.log(JSON.stringify({
    status: 'ok',
    test: 'static-metal-residency-disabled',
    backend: capabilities.backend,
  }));
} finally {
  native.shutdown();
}
