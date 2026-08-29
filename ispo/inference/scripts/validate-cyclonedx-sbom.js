'use strict';

const { createRequire } = require('node:module');
const fs = require('node:fs');
const path = require('node:path');

const [schemaPath, bomPath] = process.argv.slice(2);
if (!schemaPath || !bomPath) {
  throw new Error('usage: node validate-cyclonedx-sbom.js /absolute/path/bom-1.5.schema.json /absolute/path/sbom.json');
}

const nativeRequire = createRequire(path.join(__dirname, '../../../bindings/electron/native/package.json'));
const Ajv = nativeRequire('ajv');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const spdxSchemaPath = path.join(path.dirname(schemaPath), 'spdx.schema.json');
const jsfSchemaPath = path.join(path.dirname(schemaPath), 'jsf-0.82.schema.json');
const spdxSchema = JSON.parse(fs.readFileSync(spdxSchemaPath, 'utf8'));
const jsfSchema = JSON.parse(fs.readFileSync(jsfSchemaPath, 'utf8'));
const bom = JSON.parse(fs.readFileSync(bomPath, 'utf8'));
const validator = new Ajv({ allErrors: true, strict: false, validateFormats: false });
validator.addSchema(spdxSchema);
validator.addSchema(jsfSchema);
const valid = validator.validate(schema, bom);

if (!valid) {
  const errors = (validator.errors || []).map((error) => `${error.instancePath || '/'} ${error.message}`).join('; ');
  throw new Error(`CycloneDX 1.5 schema validation failed: ${errors}`);
}

process.stdout.write(`${JSON.stringify({
  schema: schema.$id,
  schemaSha256: require('node:crypto').createHash('sha256').update(fs.readFileSync(schemaPath)).digest('hex'),
  spdxSchemaSha256: require('node:crypto').createHash('sha256').update(fs.readFileSync(spdxSchemaPath)).digest('hex'),
  jsfSchemaSha256: require('node:crypto').createHash('sha256').update(fs.readFileSync(jsfSchemaPath)).digest('hex'),
  status: 'valid',
}, null, 2)}\n`);
