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
  const legacy = legacyShapeError(spec) || removedFieldsError(spec);
  if (legacy){
    return { valid: false, spec: JSON.parse(JSON.stringify(spec ?? {})), errors: [legacy] };
  }
  const clone = JSON.parse(JSON.stringify(spec ?? {})),
    schemaValid = validateFn(clone),
    errors = schemaValid ? [] : (validateFn.errors || []).map((e) => `${e.instancePath || '/'} ${e.message}`);
  errors.push(...crossFieldErrors(clone));
  return { valid: errors.length === 0, spec: clone, errors };
}

// Specs from an Agent older than --command (firmware/tests fields) can't be
// translated faithfully (they relied on the Client flashing and on
// run-tests.sh) — say what to do instead of listing unknown fields.
function legacyShapeError(spec){
  if (spec && typeof spec === 'object' && ('firmware' in spec || 'tests' in spec) && !('command' in spec)){
    return '/ this job spec is from an older Agent (firmware/tests fields) — update the Agent (thub self-update) ' +
      'and use --command and --download-file';
  }
  return null;
}

// `git` (--git-repo/--depth/--git-options) and `image` (--docker-image) are
// gone: the Client no longer clones or runs containers itself. Said plainly
// rather than as unknown properties.
function removedFieldsError(spec){
  const removed = ['git', 'image'].filter((k) => spec && typeof spec === 'object' && spec[k] !== undefined);
  if (!removed.length){
    return null;
  }
  return `/ ${removed.join(', ')}: --git-repo, --git-options, --depth and --docker-image are no longer supported — ` +
    'clone the repository or run docker in --command, passing credentials with --env (update the Agent: thub self-update)';
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
  return errors;
}

// A job's `env` with its values hidden — for anything but the Client that
// runs the job (Agent API, logs, dry-run output).
function maskEnv(env){
  return env && typeof env === 'object' ? Object.fromEntries(Object.keys(env).map((k) => [k, MASKED])) : env;
}

const MASKED = '***';

module.exports = { validateJobSpec, maskEnv, JOB_ENV_MASK: MASKED };
