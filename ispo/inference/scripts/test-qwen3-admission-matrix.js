'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  expectedQwen3ChatPrompt,
  matrixCycles,
  qwen3ContextTokens,
  qwen3Prompt,
} = require('./run-qwen3-admission-matrix.js');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(qwen3ContextTokens === 2048, 'Qwen3 context admission changed');
assert(matrixCycles === 6, 'Qwen3 lifecycle matrix cycle count changed');
assert(expectedQwen3ChatPrompt ===
  '<|im_start|>user\nReply with exactly one word.<|im_end|>\n<|im_start|>assistant\n',
  'Qwen3 ChatML template changed');
assert(qwen3Prompt === 'Reply with exactly one word.', 'Qwen3 bounded prompt changed');

const receiptDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ispo-qwen3-admission-matrix-'));
try {
  const receipt = path.join(receiptDirectory, 'failure.json');
  const result = spawnSync(process.execPath, [
    path.join(__dirname, 'run-qwen3-admission-matrix.js'),
    path.join(receiptDirectory, 'missing-addon.node'),
    path.join(receiptDirectory, 'missing-test-addon.node'),
    path.join(receiptDirectory, 'missing-model.gguf'),
    receipt,
  ], { encoding: 'utf8' });
  assert(result.status === 1, 'matrix failure did not retain its exit status');
  assert(result.stdout === '', 'matrix failure wrote unbounded stdout');
  assert(result.stderr === 'Qwen3 admission matrix failed\n', 'matrix failure output changed');
  const failureReceipt = JSON.parse(fs.readFileSync(receipt, 'utf8'));
  assert(JSON.stringify(failureReceipt) === JSON.stringify({
    schemaVersion: 1,
    status: 'failed',
    failureStage: 'internal',
  }), 'matrix failure did not retain the bounded receipt');
} finally {
  fs.rmSync(receiptDirectory, { recursive: true, force: true });
}

process.stdout.write('Qwen3 admission matrix contract passed\n');
