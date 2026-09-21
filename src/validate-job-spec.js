'use strict';

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const { jobSpecSchema } = require('./job-spec.schema');

const ajv = new Ajv({ useDefaults: true, allErrors: true, strict: false });
addFormats(ajv);
const validateFn = ajv.compile(jobSpecSchema);

/**
 * Validates and normalizes (defaults applied in place) a job spec.
 * Returns { valid, spec, errors }.
 */
function validateJobSpec(spec) {
  const clone = JSON.parse(JSON.stringify(spec ?? {}));
  const valid = validateFn(clone);
  return {
    valid,
    spec: clone,
    errors: valid ? [] : (validateFn.errors || []).map((e) => `${e.instancePath || '/'} ${e.message}`),
  };
}

module.exports = { validateJobSpec };
