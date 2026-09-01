'use strict';

const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const {
  parseQwen3PreMatrixReceipt,
  parseRawLinkerIdentity,
} = require('./run-qwen3-admission-matrix.js');
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
const canonicalProducer = Object.freeze({
  cmakeGenerator: 'Ninja',
  finalLinkOutputPath: 'ispo/inference/ispo_local_inference_native.node',
  preset: 'ispo-darwin-arm64-inference-release',
});
const buildArtifacts = Object.freeze({
  'addon-object': 'ispo/inference/CMakeFiles/ispo_local_inference_native.dir/native/addon.cpp.o',
  'core-object': 'ispo/inference/CMakeFiles/ispo_inference_core.dir/core/inference_core.cpp.o',
  'ggml-archive': '_deps/ispo_llamacpp-build/ggml/src/libggml.a',
  'ggml-base-archive': '_deps/ispo_llamacpp-build/ggml/src/libggml-base.a',
  'ggml-blas-archive': '_deps/ispo_llamacpp-build/ggml/src/ggml-blas/libggml-blas.a',
  'ggml-cpu-archive': '_deps/ispo_llamacpp-build/ggml/src/libggml-cpu.a',
  'ggml-metal-archive': '_deps/ispo_llamacpp-build/ggml/src/ggml-metal/libggml-metal.a',
  'inference-core-archive': 'ispo/inference/libispo_inference_core.a',
  'llama-archive': '_deps/ispo_llamacpp-build/src/libllama.a',
  'metal-executor-object': 'ispo/inference/CMakeFiles/ispo_local_inference_native.dir/native/metal-executor-scope.mm.o',
  'raw-addon': 'ispo/inference/ispo_local_inference_native.node',
});
const subprocessEnvironment = Object.freeze({ PATH: '/usr/bin:/bin:/usr/sbin:/sbin' });

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const regularFile = (filename, label) => {
  assert(path.isAbsolute(filename), `${label} path was not absolute`);
  const metadata = fs.lstatSync(filename);
  assert(metadata.isFile() && !metadata.isSymbolicLink(), `${label} was not a regular file`);
};

const executableFile = (filename, label) => {
  assert(path.isAbsolute(filename), `${label} path was not absolute`);
  const resolved = fs.realpathSync(filename);
  const metadata = fs.statSync(resolved);
  assert(metadata.isFile(), `${label} did not resolve to a regular file`);
  return resolved;
};

const fileIdentity = (filename) => {
  const bytes = fs.readFileSync(filename);
  return {
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
};

const cacheValue = (cache, key) => {
  const match = new RegExp(`^${key}:[^=]*=(.*)$`, 'm').exec(cache);
  assert(match !== null, `CMake cache omitted ${key}`);
  return match[1];
};

const linkOutputPath = (linkCommand) => {
  const outputs = [...linkCommand.matchAll(/(?:^|\s)-o\s+([^\s]+)/g)].map((match) => match[1]);
  assert(outputs.length === 1, 'Ninja link command did not retain one output path');
  return outputs[0];
};

const toolVersion = (executable, label) => {
  const result = spawnSync(executable, ['--version'], {
    encoding: 'utf8',
    env: subprocessEnvironment,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  assert(result.error === undefined && result.status === 0, `${label} could not report its version`);
  const version = result.stdout.split('\n').find(Boolean);
  assert(version !== undefined, `${label} omitted its version`);
  return version;
};

const normalizeFinalLinkCommand = (linkCommand, buildDirectory, sourceDirectory) =>
  linkCommand.split(buildDirectory).join('<build>').split(sourceDirectory).join('<source>');

const validateCanonicalProducerEvidence = (evidence) => {
  assert(evidence !== null && typeof evidence === 'object', 'build producer evidence was invalid');
  assert(evidence.cmakeGenerator === canonicalProducer.cmakeGenerator,
    'build did not use the canonical Ninja generator');
  assert(evidence.preset === canonicalProducer.preset,
    'build did not use the canonical inference preset');
  assert(evidence.finalLinkOutputPath === canonicalProducer.finalLinkOutputPath,
    'native addon did not occupy the canonical final output path');
  assert(evidence.linkOutputPath === canonicalProducer.finalLinkOutputPath,
    'Ninja link command used a noncanonical output-path spelling');
  assert(/^[0-9a-f]{64}$/.test(evidence.normalizedFinalLinkCommandSha256),
    'Ninja link command did not retain a normalized identity');
  return evidence;
};

const inspectCanonicalProducer = (buildDirectory, addon) => {
  const cachePath = path.join(buildDirectory, 'CMakeCache.txt');
  regularFile(cachePath, 'CMake cache');
  const cache = fs.readFileSync(cachePath, 'utf8');
  const finalLinkOutputPath = path.relative(buildDirectory, addon);
  assert(finalLinkOutputPath !== '' && !finalLinkOutputPath.startsWith(`..${path.sep}`),
    'native addon was outside the declared build directory');
  const makeProgram = executableFile(cacheValue(cache, 'CMAKE_MAKE_PROGRAM'), 'CMake Ninja program');
  assert(path.basename(makeProgram) === 'ninja', 'CMake cache did not select Ninja');
  const commandResult = spawnSync(makeProgram, [
    '-C',
    buildDirectory,
    '-t',
    'commands',
    finalLinkOutputPath,
  ], {
    encoding: 'utf8',
    env: subprocessEnvironment,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  assert(commandResult.error === undefined && commandResult.status === 0,
    'Ninja could not report the final native link command');
  const commandLines = commandResult.stdout.split('\n').filter(Boolean);
  const finalLinkCommand = commandLines.find((command) =>
    command.includes(' -bundle ') && command.includes(' -o '));
  assert(finalLinkCommand !== undefined, 'Ninja did not report a final native link command');
  const sourceDirectory = cacheValue(cache, 'CMAKE_HOME_DIRECTORY');
  return {
    cmakeGenerator: cacheValue(cache, 'CMAKE_GENERATOR'),
    finalLinkOutputPath,
    linkOutputPath: linkOutputPath(finalLinkCommand),
    normalizedFinalLinkCommandSha256: createHash('sha256')
      .update(normalizeFinalLinkCommand(finalLinkCommand, buildDirectory, sourceDirectory), 'utf8')
      .digest('hex'),
    preset: cacheValue(cache, 'ISPO_INFERENCE_CANONICAL_PRESET'),
  };
};

const inspectToolchain = (buildDirectory) => {
  const cachePath = path.join(buildDirectory, 'CMakeCache.txt');
  regularFile(cachePath, 'CMake cache');
  const cache = fs.readFileSync(cachePath, 'utf8');
  const cCompiler = cacheValue(cache, 'CMAKE_C_COMPILER');
  const cxxCompiler = cacheValue(cache, 'CMAKE_CXX_COMPILER');
  const ninja = executableFile(cacheValue(cache, 'CMAKE_MAKE_PROGRAM'), 'CMake Ninja program');
  return {
    architecture: cacheValue(cache, 'CMAKE_OSX_ARCHITECTURES'),
    cCompiler,
    cxxCompiler,
    cxxCompilerVersion: toolVersion(executableFile(cxxCompiler, 'C++ compiler'), 'C++ compiler'),
    deploymentTarget: cacheValue(cache, 'CMAKE_OSX_DEPLOYMENT_TARGET'),
    ninjaVersion: toolVersion(ninja, 'Ninja'),
  };
};

const verifyContentDerivedMachOUuid = (addon) => {
  const result = spawnSync('/usr/bin/otool', ['-l', addon], {
    encoding: 'utf8',
    env: subprocessEnvironment,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  assert(result.error === undefined && result.status === 0, 'Mach-O load commands could not be read');
  const commands = result.stdout.match(/^\s*cmd LC_UUID$/gm) ?? [];
  assert(commands.length === 1, 'raw Mach-O did not retain one linker UUID');
  const uuid = /^\s*uuid ([0-9A-F-]+)$/m.exec(result.stdout)?.[1];
  assert(uuid !== undefined, 'raw Mach-O did not retain the linker UUID value');
  return uuid;
};

const readJson = (filename, label) => {
  regularFile(filename, label);
  try {
    return JSON.parse(fs.readFileSync(filename, 'utf8'));
  } catch {
    throw new Error(`${label} was not valid JSON`);
  }
};

const receiptArtifact = (artifacts, label) => {
  const artifact = artifacts.find((candidate) => candidate.label === label);
  assert(artifact !== undefined, `public receipt omitted ${label}`);
  return artifact.identity;
};

const artifactKindForBuild = (buildDirectory) => {
  const cache = fs.readFileSync(path.join(buildDirectory, 'CMakeCache.txt'), 'utf8');
  return cacheValue(cache, 'ISPO_INFERENCE_TESTING') === 'ON' ? 'test' : 'production';
};

const verifyReceiptArtifacts = (buildDirectory, addon, artifacts) => {
  for (const [label, relativePath] of Object.entries(buildArtifacts)) {
    const filename = label === 'raw-addon' ? addon : path.join(buildDirectory, relativePath);
    regularFile(filename, `receipt ${label}`);
    assert(JSON.stringify(fileIdentity(filename)) === JSON.stringify(receiptArtifact(artifacts, label)),
      `receipt ${label} did not match the built input`);
  }
};

const verifyDeclaredPublicReceipt = (buildDirectory, addon, rawLinkerIdentityPath, receiptPath) => {
  const rawLinker = parseRawLinkerIdentity(readJson(rawLinkerIdentityPath, 'raw linker identity'));
  const receipt = parseQwen3PreMatrixReceipt(readJson(receiptPath, 'public pre-matrix receipt'));
  const producer = inspectCanonicalProducer(buildDirectory, addon);
  const toolchain = inspectToolchain(buildDirectory);
  assert(JSON.stringify(rawLinker) === JSON.stringify(receipt.rawLinkerIdentity),
    'raw linker identity did not match the declared public receipt');
  assert(JSON.stringify(producer) === JSON.stringify(receipt.producer),
    'Ninja producer evidence did not match the declared public receipt');
  assert(JSON.stringify(toolchain) === JSON.stringify(receipt.toolchain),
    'toolchain evidence did not match the declared public receipt');
  verifyReceiptArtifacts(buildDirectory, addon, receipt.artifacts[artifactKindForBuild(buildDirectory)]);
  assert(verifyContentDerivedMachOUuid(addon) === receipt.linker.uuid,
    'raw Mach-O UUID did not match the declared public receipt');
};

const main = (argumentsList) => {
  if (argumentsList.length !== 2 && argumentsList.length !== 4) {
    throw new Error('usage: verify-deterministic-darwin-build-inputs.js /absolute/build /absolute/addon [/absolute/raw-linker-identity.json /absolute/pre-matrix-receipt.json]');
  }
  const [buildDirectory, addon, rawLinkerIdentityPath, receiptPath] = argumentsList;
  assert(path.isAbsolute(buildDirectory), 'build directory path was not absolute');
  regularFile(addon, 'native addon');
  const producer = inspectCanonicalProducer(buildDirectory, addon);
  validateCanonicalProducerEvidence(producer);
  for (const relativePath of staticArchives) {
    const archive = path.join(buildDirectory, relativePath);
    regularFile(archive, 'static archive');
    verifyDeterministicDarwinStaticArchive(fs.readFileSync(archive));
  }
  const rawMachOUuid = verifyContentDerivedMachOUuid(addon);
  if (rawLinkerIdentityPath !== undefined && receiptPath !== undefined) {
    verifyDeclaredPublicReceipt(buildDirectory, addon, rawLinkerIdentityPath, receiptPath);
  }
  process.stdout.write(`${JSON.stringify({
    archives: staticArchives.length,
    producer,
    rawMachOUuid,
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

module.exports = {
  canonicalProducer,
  buildArtifacts,
  inspectToolchain,
  inspectCanonicalProducer,
  linkOutputPath,
  normalizeFinalLinkCommand,
  staticArchives,
  validateCanonicalProducerEvidence,
  verifyContentDerivedMachOUuid,
};
