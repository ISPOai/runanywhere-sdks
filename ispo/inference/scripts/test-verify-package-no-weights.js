'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { verifyPackageNoWeights } = require('./verify-package-no-weights.js');

const assertThrows = (operation, message) => {
  try {
    operation();
  } catch {
    return;
  }
  throw new Error(message);
};

const withStage = (operation) => {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'ispo-package-no-weights-'));
  try {
    operation(stage);
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
};

withStage((stage) => {
  fs.mkdirSync(path.join(stage, 'metadata'));
  fs.writeFileSync(path.join(stage, 'metadata', 'manifest.json'), '{"schemaVersion":1}\n', 'utf8');
  verifyPackageNoWeights(stage);
});

withStage((stage) => {
  fs.writeFileSync(path.join(stage, 'model.gguf'), '', 'utf8');
  assertThrows(() => verifyPackageNoWeights(stage), 'GGUF model filename was accepted');
});

withStage((stage) => {
  fs.writeFileSync(path.join(stage, 'native.bin'), Buffer.from('GGUF'));
  assertThrows(() => verifyPackageNoWeights(stage), 'GGUF model signature was accepted');
});

withStage((stage) => {
  fs.writeFileSync(path.join(stage, 'native.bin'), Buffer.from('ggml'));
  assertThrows(() => verifyPackageNoWeights(stage), 'ggml model signature was accepted');
});

process.stdout.write('package no-weight verification passed\n');
