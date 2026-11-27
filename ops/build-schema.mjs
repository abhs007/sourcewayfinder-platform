import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import standaloneCode from 'ajv/dist/standalone/index.js';
import { readFile, writeFile } from 'node:fs/promises';
const ajv = new Ajv({ allErrors: true, strict: false, code: { source: true } });
addFormats(ajv);
const schema = JSON.parse(
  await readFile(new URL('../packages/core/bundle.schema.json', import.meta.url), 'utf8'),
);
const validate = ajv.compile(schema);
await writeFile(
  new URL('../packages/core/generated-validator.cjs', import.meta.url),
  standaloneCode(ajv, validate),
);
