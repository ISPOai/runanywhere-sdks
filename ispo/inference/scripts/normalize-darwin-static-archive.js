'use strict';

const fs = require('node:fs');
const path = require('node:path');

const archiveMagic = Buffer.from('!<arch>\n', 'ascii');
const archiveHeaderBytes = 60;
const archiveHeaderLayout = Object.freeze({
  date: Object.freeze({ offset: 16, width: 12 }),
  gid: Object.freeze({ offset: 34, width: 6 }),
  mode: Object.freeze({ offset: 40, width: 8 }),
  size: Object.freeze({ offset: 48, width: 10 }),
  uid: Object.freeze({ offset: 28, width: 6 }),
});
const canonicalArchiveMetadata = Object.freeze({
  date: '0',
  gid: '0',
  mode: '100644',
  uid: '0',
});

class DarwinStaticArchiveError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DarwinStaticArchiveError';
  }
}

const assert = (condition, message) => {
  if (!condition) throw new DarwinStaticArchiveError(message);
};

const archiveField = (value, width) => {
  assert(value.length <= width, 'archive field exceeded its fixed width');
  return Buffer.from(value.padEnd(width, ' '), 'ascii');
};

const readArchiveNumber = (buffer, offset, width) => {
  const encoded = buffer.toString('ascii', offset, offset + width).trim();
  assert(/^[0-9]+$/.test(encoded), 'archive member size was malformed');
  const value = Number(encoded);
  assert(Number.isSafeInteger(value) && value >= 0, 'archive member size was invalid');
  return value;
};

const visitArchiveMembers = (bytes, visit) => {
  assert(bytes.byteLength >= archiveMagic.byteLength, 'archive was shorter than its magic');
  assert(bytes.subarray(0, archiveMagic.byteLength).equals(archiveMagic), 'archive magic was invalid');

  let offset = archiveMagic.byteLength;
  while (offset < bytes.byteLength) {
    assert(offset + archiveHeaderBytes <= bytes.byteLength, 'archive member header was truncated');
    assert(bytes[offset + 58] === 0x60 && bytes[offset + 59] === 0x0a,
      'archive member terminator was invalid');
    const size = readArchiveNumber(bytes, offset + archiveHeaderLayout.size.offset,
      archiveHeaderLayout.size.width);
    const memberEnd = offset + archiveHeaderBytes + size;
    assert(memberEnd <= bytes.byteLength, 'archive member payload was truncated');
    visit(offset);
    offset = memberEnd + (size % 2);
  }
  assert(offset === bytes.byteLength, 'archive member padding was invalid');
};

const normalizeDarwinStaticArchiveBytes = (bytes) => {
  const normalized = Buffer.from(bytes);
  visitArchiveMembers(normalized, (offset) => {
    for (const [field, value] of Object.entries(canonicalArchiveMetadata)) {
      const layout = archiveHeaderLayout[field];
      archiveField(value, layout.width).copy(normalized, offset + layout.offset);
    }
  });
  return normalized;
};

const verifyDeterministicDarwinStaticArchive = (bytes) => {
  visitArchiveMembers(bytes, (offset) => {
    for (const [field, value] of Object.entries(canonicalArchiveMetadata)) {
      const layout = archiveHeaderLayout[field];
      assert(
        bytes.subarray(offset + layout.offset, offset + layout.offset + layout.width)
          .equals(archiveField(value, layout.width)),
        `archive ${field} metadata was not canonical`,
      );
    }
  });
};

const normalizeDarwinStaticArchive = (filename) => {
  assert(path.isAbsolute(filename), 'archive path was not absolute');
  const metadata = fs.lstatSync(filename);
  assert(metadata.isFile() && !metadata.isSymbolicLink(), 'archive was not a regular file');
  const original = fs.readFileSync(filename);
  const normalized = normalizeDarwinStaticArchiveBytes(original);
  if (!normalized.equals(original)) fs.writeFileSync(filename, normalized);
  verifyDeterministicDarwinStaticArchive(normalized);
};

const main = (argumentsList) => {
  assert(argumentsList.length > 0, 'at least one archive path is required');
  for (const filename of argumentsList) normalizeDarwinStaticArchive(filename);
};

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch {
    process.stderr.write('Darwin static archive normalization failed\n');
    process.exitCode = 1;
  }
}

module.exports = {
  DarwinStaticArchiveError,
  canonicalArchiveMetadata,
  normalizeDarwinStaticArchive,
  normalizeDarwinStaticArchiveBytes,
  verifyDeterministicDarwinStaticArchive,
};
