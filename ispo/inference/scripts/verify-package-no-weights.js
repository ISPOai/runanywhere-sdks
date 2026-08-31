'use strict';

const fs = require('node:fs');
const path = require('node:path');

const modelExtensions = new Set(['.bin', '.ckpt', '.gguf', '.onnx', '.pt', '.pth', '.safetensors']);
const modelMagic = new Set(['GGUF', 'ggml']);

const assertPackageStageDirectory = (stageDirectory) => {
  if (!path.isAbsolute(stageDirectory)) {
    throw new Error('package stage directory must be absolute');
  }
  const info = fs.lstatSync(stageDirectory);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error('package stage directory is invalid');
  }
  return path.resolve(stageDirectory);
};

const hasModelMagic = (filename) => {
  const prefix = Buffer.alloc(4);
  const descriptor = fs.openSync(filename, 'r');
  try {
    const bytesRead = fs.readSync(descriptor, prefix, 0, prefix.length, 0);
    return modelMagic.has(prefix.subarray(0, bytesRead).toString('ascii'));
  } finally {
    fs.closeSync(descriptor);
  }
};

const verifyPackageNoWeights = (stageDirectory) => {
  const pending = [assertPackageStageDirectory(stageDirectory)];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const filename = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(filename);
        continue;
      }
      if (!entry.isFile() || entry.isSymbolicLink()) {
        throw new Error('package stage contains a non-regular file');
      }
      if (modelExtensions.has(path.extname(entry.name).toLowerCase()) || hasModelMagic(filename)) {
        throw new Error('packaged model weight detected');
      }
    }
  }
};

const main = () => {
  if (process.argv.length !== 3) {
    throw new Error('usage: node verify-package-no-weights.js /absolute/package-stage');
  }
  verifyPackageNoWeights(process.argv[2]);
};

if (require.main === module) {
  main();
}

module.exports = { verifyPackageNoWeights };
