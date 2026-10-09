/**
 * @file        packages/shared/src/validate-job-spec.js
 * @description Validates a job spec object against the Ajv schema
 *
 * @author      Andrian Yablonskyy
 * @copyright   Copyright (c) 2026 Andrian Yablonskyy. All rights reserved.
 *
 * This file is part of TestHub and is proprietary and confidential.
 * Unauthorized copying, modification, distribution, or use of this file,
 * via any medium, is strictly prohibited without prior written permission
 * from AdSystem.PRO.
 */

'use strict';

const Ajv = require('ajv'),
  addFormats = require('ajv-formats'),
  { jobSpecSchema } = require('./job-spec.schema');

const ajv = new Ajv({ useDefaults: true, allErrors: true, strict: false });
addFormats(ajv);
const validateFn = ajv.compile(jobSpecSchema);

/**
 * Validates and normalizes (defaults applied in place) a job spec.
 * Returns { valid, spec, errors }.
 */
function validateJobSpec(spec){
  const clone = JSON.parse(JSON.stringify(spec ?? {})),
    schemaValid = validateFn(clone),
    errors = schemaValid ? [] : (validateFn.errors || []).map((e) => `${e.instancePath || '/'} ${e.message}`);
  errors.push(...crossFieldErrors(clone));
  return { valid: errors.length === 0, spec: clone, errors };
}

// Rules across fields, spelled out here rather than as schema if/then,
// whose errors ("must match a schema in then") say little.
function crossFieldErrors(spec){
  const errors = [],
    envNames = Object.keys(spec.env && typeof spec.env === 'object' ? spec.env : {}),
    reserved = envNames.filter((n) => /^(THUB|JOB)_/.test(n));
  if (reserved.length){
    errors.push(`/env ${reserved.join(', ')}: set by the Client itself (THUB_*, JOB_*) — use other names`);
  }
  // USB power is an HW Client's (its hw-devices.usbPower ports).
  if (spec.power && spec.target?.type !== 'hw'){
    errors.push('/power USB port power is for HW jobs only (--type hw)');
  }
  return errors;
}

// A job's `env` with its values hidden — for anything but the Client that
// runs the job (Agent API, logs, dry-run output).
function maskEnv(env){
  return env && typeof env === 'object' ? Object.fromEntries(Object.keys(env).map((k) => [k, MASKED])) : env;
}

const MASKED = '***';

module.exports = { validateJobSpec, maskEnv, JOB_ENV_MASK: MASKED };
