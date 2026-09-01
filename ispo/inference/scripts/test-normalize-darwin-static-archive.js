'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  DarwinStaticArchiveError,
  canonicalArchiveMetadata,
  normalizeDarwinStaticArchive,
  normalizeDarwinStaticArchiveBytes,
  verifyDeterministicDarwinStaticArchive,
} = require('./normalize-darwin-static-archive.js');

const archiveMagic = Buffer.from('!<arch>\n', 'ascii');

const archiveField = (value, width) => Buffer.from(value.padEnd(width, ' '), 'ascii');

const archiveMember = ({ date, gid, mode, name, payload, uid }) => {
  const header = Buffer.alloc(60, 0x20);
  archiveField(name, 16).copy(header, 0);
  archiveField(date, 12).copy(header, 16);
  archiveField(uid, 6).copy(header, 28);
  archiveField(gid, 6).copy(header, 34);
  archiveField(mode, 8).copy(header, 40);
  archiveField(String(payload.byteLength), 10).copy(header, 48);
  header[58] = 0x60;
  header[59] = 0x0a;
  const padding = payload.byteLength % 2 === 0 ? Buffer.alloc(0) : Buffer.from('\n', 'ascii');
  return Buffer.concat([header, payload, padding]);
};

const variableArchive = () => Buffer.concat([
  archiveMagic,
  archiveMember({
    date: '1788213154',
    gid: '20',
    mode: '100755',
    name: '__.SYMDEF SORTED',
    payload: Buffer.from([1, 2, 3]),
    uid: '501',
  }),
  archiveMember({
    date: '1788218797',
    gid: '42',
    mode: '100600',
    name: 'inference_core.o',
    payload: Buffer.from([4, 5, 6, 7]),
    uid: '502',
  }),
]);

const expectedArchive = () => Buffer.concat([
  archiveMagic,
  archiveMember({
    ...canonicalArchiveMetadata,
    name: '__.SYMDEF SORTED',
    payload: Buffer.from([1, 2, 3]),
  }),
  archiveMember({
    ...canonicalArchiveMetadata,
    name: 'inference_core.o',
    payload: Buffer.from([4, 5, 6, 7]),
  }),
]);

const normalized = normalizeDarwinStaticArchiveBytes(variableArchive());
assert.deepEqual(normalized, expectedArchive(), 'archive normalization changed member contents');
verifyDeterministicDarwinStaticArchive(normalized);

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ispo-static-archive-'));
try {
  const archive = path.join(scratch, 'libfixture.a');
  fs.writeFileSync(archive, variableArchive());
  normalizeDarwinStaticArchive(archive);
  assert.deepEqual(fs.readFileSync(archive), expectedArchive(), 'file normalization was not stable');
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}

assert.throws(
  () => normalizeDarwinStaticArchiveBytes(Buffer.from('not an archive', 'ascii')),
  DarwinStaticArchiveError,
  'invalid archive magic was accepted',
);

process.stdout.write('Darwin static archive normalization contract passed\n');
