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
  { jobSpecSchema } = require('./job-spec.schema'),
  { splitArgs } = require('./split-args');

const ajv = new Ajv({ useDefaults: true, allErrors: true, strict: false });
addFormats(ajv);
const validateFn = ajv.compile(jobSpecSchema);

/**
 * Validates and normalizes (defaults applied in place) a job spec.
 * Returns { valid, spec, errors }.
 */
function validateJobSpec(spec){
  const legacy = legacyShapeError(spec);
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
      'and use --command, --download-file, --docker-image and --git-repo';
  }
  return null;
}

// Git transports a Client may fetch sources over. Never `ext::` (runs a
// command), `file://` or a local path: the Client also sets
// GIT_ALLOW_PROTOCOL to the same list (downloader.js).
const GIT_URL = /^(?:(?:https?|ssh|git):\/\/[^\s]+|[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[^\s]+)$/,

  // Job env names the Client sets itself for a job's commands (besides
  // THUB_* and JOB_* — the job's own parameters): git's safety settings.
  RESERVED_ENV = ['GIT_TERMINAL_PROMPT', 'GIT_ALLOW_PROTOCOL'];

// Rules across fields, spelled out here rather than as schema if/then,
// whose errors ("must match a schema in then") say little.
function crossFieldErrors(spec){
  const errors = [];
  if (spec.image && spec.target?.type === 'hw'){
    errors.push('/image a Docker image only works for SW jobs (target.type "sw")');
  }
  if (spec.git && !GIT_URL.test(spec.git.url || '')){
    errors.push('/git/url must be an https://, http://, ssh:// or git:// URL, or user@host:path');
  }
  const envNames = Object.keys(spec.env && typeof spec.env === 'object' ? spec.env : {}),
    reserved = envNames.filter((n) => /^(THUB|JOB)_/.test(n) || RESERVED_ENV.includes(n));
  if (reserved.length){
    errors.push(`/env ${reserved.join(', ')}: set by the Client itself (THUB_*, JOB_*, ${RESERVED_ENV.join(', ')}) — use other names`);
  }
  if (spec.git?.options){
    try {
      splitArgs(spec.git.options);
    }
    catch (err){
      errors.push(`/git/options can't be split into arguments: ${err.message}`);
    }
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
