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
  errors.push(...firmwareErrors(clone), ...testsErrors(clone));
  return { valid: errors.length === 0, spec: clone, errors };
}

// Git transports a Client may fetch test sources over. Never `ext::` (runs
// a command), `file://` or a local path: the Client also sets
// GIT_ALLOW_PROTOCOL to the same list (downloader.js).
const GIT_URL = /^(?:(?:https?|ssh|git):\/\/[^\s]+|[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[^\s]+)$/;

// tests.url (archive) vs tests.git (repo + at most one of branch/tag/commit).
function testsErrors(spec){
  const tests = spec.tests;
  if (!tests || typeof tests !== 'object'){
    return [];
  }
  if (tests.url && tests.git){
    return ['/tests give either url (an archive) or git (a repository), not both'];
  }
  if (!tests.url && !tests.git){
    return ['/tests needs url (an archive: tar/tar.gz/zip) or git (a repository)'];
  }
  if (tests.git){
    if (!GIT_URL.test(tests.git.url || '')){
      return ['/tests/git/url must be an https://, http://, ssh:// or git:// URL, or user@host:path'];
    }
    const refs = ['branch', 'tag', 'commit'].filter((k) => tests.git[k]);
    if (refs.length > 1){
      return [`/tests/git give at most one of branch, tag or commit (got ${refs.join(', ')})`];
    }
  }
  return [];
}

// firmware.url vs firmware.image — spelled out here rather than as schema
// oneOf/if-then, whose errors ("must match exactly one schema") say little.
function firmwareErrors(spec){
  const fw = spec.firmware;
  if (!fw || typeof fw !== 'object'){
    return ['/firmware is required'];
  }
  if (fw.url && fw.image){
    return ['/firmware give either url (a firmware file) or image (a Docker image), not both'];
  }
  if (!fw.url && !fw.image){
    return ['/firmware needs url (a firmware file) or image (a Docker image, SW jobs only)'];
  }
  if (fw.image && spec.target?.type === 'hw'){
    return ['/firmware/image a Docker image only works for SW jobs (target.type "sw") — an HW job flashes a firmware file: use firmware.url'];
  }
  if (fw.image && fw.sha256){
    return ['/firmware/sha256 applies to a firmware file (url) only — pin a Docker image by digest instead (image@sha256:...)'];
  }
  return [];
}

module.exports = { validateJobSpec };
