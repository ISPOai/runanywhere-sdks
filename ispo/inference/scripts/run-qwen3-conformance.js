'use strict';

const fs = require('node:fs');
const path = require('node:path');

const qwen3ContextTokens = 2048;
const qwen3Prompt = 'Reply with exactly one word.';
const expectedQwen3ChatPrompt =
  '<|im_start|>user\nReply with exactly one word.<|im_end|>\n<|im_start|>assistant\n';
const allowedBackends = new Set(['metal', 'cpu-accelerate']);

class Qwen3ConformanceError extends Error {
  constructor(stage) {
    super('Qwen3 conformance failed');
    this.stage = stage;
  }
}

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const runStage = (stage, operation) => {
  try {
    return operation();
  } catch (error) {
    throw new Qwen3ConformanceError(stage);
  }
};

const assertLoaded = (native, label) => {
  const capabilities = native.capabilities();
  assert(capabilities?.loaded === true, `${label} did not retain the loaded model`);
  assert(allowedBackends.has(capabilities?.backend), `${label} selected an unknown backend`);
  return capabilities.backend;
};

const releaseNative = (native) => {
  try {
    native.unload();
  } finally {
    native.shutdown();
  }
};

const loadExactQwen3 = (native, modelPath, label) => {
  native.loadExactLocalModel(modelPath, {
    contextTokens: qwen3ContextTokens,
    threads: 2,
  });
  return assertLoaded(native, label);
};

const runQwen3Conformance = ({ testNative, generationNative, modelPath }) => {
  let templateBackend;
  try {
    templateBackend = runStage('template-load', () => loadExactQwen3(testNative, modelPath, 'template addon'));
    runStage('template-render', () => {
      assert(testNative.__testRenderChatTemplate(qwen3Prompt) === expectedQwen3ChatPrompt,
        'Qwen3 ChatML template output was not exact');
    });
  } finally {
    releaseNative(testNative);
  }

  let generationBackend;
  let completion;
  try {
    generationBackend = runStage('generation-load', () => loadExactQwen3(generationNative, modelPath, 'generation addon'));
    completion = runStage('generation-completion', () => {
      const result = generationNative.complete(qwen3Prompt, { maxTokens: 2 });
      const completionText = String.prototype.valueOf.call(result);
      assert(Buffer.byteLength(completionText, 'utf8') > 0,
        'Qwen3 completion did not generate output');
      return completionText;
    });
  } finally {
    releaseNative(generationNative);
  }

  return {
    schemaVersion: 1,
    status: 'passed',
    template: 'qwen3-chatml-single-user',
    contextTokens: qwen3ContextTokens,
    templateBackend,
    generationBackend,
    completionBytes: Buffer.byteLength(completion, 'utf8'),
  };
};

const parseArguments = (argumentsList) => {
  if (argumentsList.length !== 4) {
    throw new Error('Qwen3 conformance arguments are invalid');
  }
  const [addonPath, testAddonPath, modelPath, outputPath] = argumentsList;
  for (const candidate of [addonPath, testAddonPath, modelPath, outputPath]) {
    if (!path.isAbsolute(candidate)) {
      throw new Error('Qwen3 conformance arguments are invalid');
    }
  }
  return { addonPath, testAddonPath, modelPath, outputPath };
};

const writeReport = (outputPath, report) => {
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
};

const main = () => {
  let outputPath;
  try {
    const options = parseArguments(process.argv.slice(2));
    outputPath = options.outputPath;
    const report = runQwen3Conformance({
      testNative: require(options.testAddonPath),
      generationNative: require(options.addonPath),
      modelPath: options.modelPath,
    });
    writeReport(outputPath, report);
  } catch (error) {
    if (outputPath) {
      const failureStage = error instanceof Qwen3ConformanceError ? error.stage : 'internal';
      writeReport(outputPath, { schemaVersion: 1, status: 'failed', failureStage });
    }
    process.stderr.write('Qwen3 conformance failed\n');
    process.exitCode = 1;
  }
};

if (require.main === module) {
  main();
}

module.exports = {
  expectedQwen3ChatPrompt,
  qwen3ContextTokens,
  qwen3Prompt,
  runQwen3Conformance,
};
