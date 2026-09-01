'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const { verifyDeterministicDarwinStaticArchive } = require('./normalize-darwin-static-archive.js');

const staticArchives = Object.freeze([
  'ispo/inference/libispo_inference_core.a',
  '_deps/ispo_llamacpp-build/src/libllama.a',
  '_deps/ispo_llamacpp-build/ggml/src/libggml.a',
  '_deps/ispo_llamacpp-build/ggml/src/libggml-base.a',
  '_deps/ispo_llamacpp-build/ggml/src/libggml-cpu.a',
  '_deps/ispo_llamacpp-build/ggml/src/ggml-blas/libggml-blas.a',
  '_deps/ispo_llamacpp-build/ggml/src/ggml-metal/libggml-metal.a',
]);

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const regularFile = (filename, label) => {
  assert(path.isAbsolute(filename), `${label} path was not absolute`);
  const metadata = fs.lstatSync(filename);
  assert(metadata.isFile() && !metadata.isSymbolicLink(), `${label} was not a regular file`);
};

const verifyContentDerivedMachOUuid = (addon) => {
  const result = spawnSync('/usr/bin/otool', ['-l', addon], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  assert(result.error === undefined && result.status === 0, 'Mach-O load commands could not be read');
  const commands = result.stdout.match(/^\s*cmd LC_UUID$/gm) ?? [];
  assert(commands.length === 1, 'raw Mach-O did not retain one linker UUID');
};

const main = (argumentsList) => {
  if (argumentsList.length !== 2) throw new Error('usage: verify-deterministic-darwin-build-inputs.js /absolute/build /absolute/addon');
  const [buildDirectory, addon] = argumentsList;
  assert(path.isAbsolute(buildDirectory), 'build directory path was not absolute');
  regularFile(addon, 'native addon');
  for (const relativePath of staticArchives) {
    const archive = path.join(buildDirectory, relativePath);
    regularFile(archive, 'static archive');
    verifyDeterministicDarwinStaticArchive(fs.readFileSync(archive));
  }
  verifyContentDerivedMachOUuid(addon);
  process.stdout.write(`${JSON.stringify({
    archives: staticArchives.length,
    rawMachOUuid: 'content-derived',
    status: 'ok',
  })}\n`);
};

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch {
    process.stderr.write('deterministic Darwin build-input verification failed\n');
    process.exitCode = 1;
  }
}

module.exports = { staticArchives, verifyContentDerivedMachOUuid };
