'use strict';

const {
  expectedQwen3ChatPrompt,
  qwen3ContextTokens,
  runQwen3Conformance,
} = require('./run-qwen3-conformance.js');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const createNative = ({ template, completion, backend = 'metal' }) => {
  const calls = [];
  let loaded = false;
  return {
    calls,
    capabilities() {
      return { loaded, backend };
    },
    complete() {
      calls.push('complete');
      return completion;
    },
    loadExactLocalModel(_modelPath, options) {
      calls.push(['load', options]);
      loaded = true;
    },
    shutdown() {
      calls.push('shutdown');
    },
    unload() {
      calls.push('unload');
      loaded = false;
    },
    __testRenderChatTemplate() {
      calls.push('template');
      return template;
    },
  };
};

const exactTemplateNative = createNative({
  template: expectedQwen3ChatPrompt,
  completion: '',
});
const generationNative = createNative({
  template: '',
  completion: 'yes',
  backend: 'cpu-accelerate',
});
const report = runQwen3Conformance({
  testNative: exactTemplateNative,
  generationNative,
  modelPath: '/private/tmp/verified-qwen3.gguf',
});

assert(report.status === 'passed', 'bounded Qwen3 conformance did not pass');
assert(report.contextTokens === qwen3ContextTokens, 'Qwen3 context admission changed');
assert(report.templateBackend === 'metal', 'template backend was not retained');
assert(report.generationBackend === 'cpu-accelerate', 'generation backend was not retained');
assert(report.completionBytes === 3, 'completion byte count was not retained');
assert(JSON.stringify(exactTemplateNative.calls) === JSON.stringify([
  ['load', { contextTokens: 2048, threads: 2 }],
  'template',
  'unload',
  'shutdown',
]), 'template addon lifecycle changed');
assert(JSON.stringify(generationNative.calls) === JSON.stringify([
  ['load', { contextTokens: 2048, threads: 2 }],
  'complete',
  'unload',
  'shutdown',
]), 'generation addon lifecycle changed');

const malformedTemplateNative = createNative({
  template: '<|im_start|>user\nchanged',
  completion: '',
});
let rejectedMalformedTemplate = false;
let malformedTemplateFailureStage;
try {
  runQwen3Conformance({
    testNative: malformedTemplateNative,
    generationNative: createNative({ template: '', completion: 'yes' }),
    modelPath: '/private/tmp/verified-qwen3.gguf',
  });
} catch (error) {
  rejectedMalformedTemplate = error instanceof Error;
  malformedTemplateFailureStage = error.stage;
}
assert(rejectedMalformedTemplate, 'malformed Qwen3 template was accepted');
assert(malformedTemplateFailureStage === 'template-render',
  'malformed Qwen3 template did not retain its bounded failure stage');
assert(JSON.stringify(malformedTemplateNative.calls.slice(-2)) === JSON.stringify(['unload', 'shutdown']),
  'template failure did not release the test addon');

process.stdout.write('Qwen3 conformance contract passed\n');
