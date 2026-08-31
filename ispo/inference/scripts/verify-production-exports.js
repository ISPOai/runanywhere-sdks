'use strict';

const expectedProductionExports = Object.freeze([
  'capabilities',
  'cancel',
  'complete',
  'initialize',
  'loadExactLocalModel',
  'metrics',
  'reset',
  'shutdown',
  'stream',
  'unload',
].sort());

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const exactExportDifference = (exported) => {
  const actual = Object.keys(exported).sort();
  return {
    missing: expectedProductionExports.filter((key) => !actual.includes(key)),
    extra: actual.filter((key) => !expectedProductionExports.includes(key)),
  };
};

const assertExactProductionExports = (exported) => {
  const difference = exactExportDifference(exported);
  if (difference.missing.length === 0 && difference.extra.length === 0) return;
  throw new Error(
    `production addon export set changed: missing=${difference.missing.join(',')} extra=${difference.extra.join(',')}`,
  );
};

const exportsFor = (keys) => Object.fromEntries(keys.map((key) => [key, true]));

const assertThrows = (operation, message) => {
  try {
    operation();
  } catch {
    return;
  }
  throw new Error(message);
};

const runSelfTest = () => {
  assertExactProductionExports(exportsFor(expectedProductionExports));
  assertThrows(
    () => assertExactProductionExports(exportsFor(expectedProductionExports.filter((key) => key !== 'stream'))),
    'missing production export was accepted',
  );
  assertThrows(
    () => assertExactProductionExports(exportsFor([...expectedProductionExports, '__testOnly'])),
    'extra production export was accepted',
  );
  process.stdout.write(`${JSON.stringify({ status: 'ok', test: 'production-export-set' })}\n`);
};

const addonPath = process.argv[2];
if (addonPath === '--self-test') {
  runSelfTest();
} else if (addonPath?.startsWith('/')) {
  assertExactProductionExports(require(addonPath));
} else {
  throw new Error('usage: node verify-production-exports.js /absolute/path/addon.node | --self-test');
}
