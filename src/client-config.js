/**
 * @file        packages/shared/src/client-config.js
 * @description Schema and validation for the part of a Client's config that can be edited from the dashboard
 *              (its capabilities: the `hw` or `sw` section) — used by the Coordinator on Save and by the Client
 *              before applying it
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
  { DOCKER_IMAGE_PATTERN } = require('./job-spec.schema');

const MAX_DEVICES = 8,
  device = (extra = {}) => ({
    type: 'object',
    additionalProperties: false,
    properties: {
      // udev index N -> /dev/thub/dut<N>-<kind>, or an explicit path.
      index: { type: 'integer', minimum: 1, maximum: MAX_DEVICES },
      path: { type: 'string', pattern: '^/dev/[A-Za-z0-9._/+-]+$', maxLength: 128 },
      // udev rule for the symlink (README §8.2): the USB port path, plus
      // optional id/subsystem overrides.
      devpath: { type: 'string', pattern: '^[A-Za-z0-9.:+/-]+$', maxLength: 64 },
      vendorId: { type: 'string', pattern: '^[0-9a-fA-F]{4}$' },
      productId: { type: 'string', pattern: '^[0-9a-fA-F]{4}$' },
      subsystem: { enum: ['usb', 'tty'] },
      ...extra
    },
    anyOf: [{ required: ['index'] }, { required: ['path'] }, ...(extra.serial ? [{ required: ['serial'] }] : [])]
  }),
  list = (item) => ({ type: 'array', maxItems: MAX_DEVICES, items: item }),
  hwSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      stlinks: list(device({ serial: { type: 'string', pattern: '^[A-Za-z0-9]{1,64}$' } })),
      uarts: list(device({ baudRate: { type: 'integer', minimum: 50, maximum: 4000000 } })),
      usbs: list(device()),
      relays: list({
        type: 'object',
        additionalProperties: false,
        required: ['channel'],
        properties: {
          channel: { type: 'integer', minimum: 0, maximum: 7 },
          baseUrl: { type: 'string', format: 'uri', pattern: '^https?://' }
        }
      }),
      power: {
        type: ['object', 'null'],
        additionalProperties: false,
        properties: {
          method: { enum: ['uhubctl', 'relay'] },
          hub: { type: 'string', pattern: '^[A-Za-z0-9.:-]{1,32}$' },
          port: { type: 'integer', minimum: 1, maximum: 64 },
          baseUrl: { type: 'string', format: 'uri', pattern: '^https?://' }
        }
      }
    }
  },
  swSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      image: { type: 'string', maxLength: 255, pattern: DOCKER_IMAGE_PATTERN },
      registry: { type: 'string', pattern: '^(https?://)?[A-Za-z0-9.-]+(:[0-9]+)?/?$', maxLength: 255 },
      allowDockerHub: { type: 'boolean' },
      allowJobImages: { type: 'boolean' },
      cpus: { type: 'number', exclusiveMinimum: 0, maximum: 256 },
      memory: { type: 'string', pattern: '^[0-9]+[kmgKMG]?$' },
      cmd: { type: 'array', maxItems: 32, items: { type: 'string', maxLength: 1024 } }
    }
  },
  ajv = new Ajv({ allErrors: true, strict: false }),
  validators = { hw: null, sw: null };
addFormats(ajv);
validators.hw = ajv.compile(hwSchema);
validators.sw = ajv.compile(swSchema);

// Fields of a section that never leave the Client (secrets) — kept on the
// Client when a dashboard edit is applied, never reported or accepted.
const PRIVATE_FIELDS = { hw: [], sw: ['registryAuth'] };

// { valid, errors } for a Client's `type` ('hw' | 'sw') config section.
function validateClientConfig(type, section){
  const validate = validators[type];
  if (!validate){
    return { valid: false, errors: [`unknown Client type "${type}"`] };
  }
  if (!section || typeof section !== 'object' || Array.isArray(section)){
    return { valid: false, errors: [`the ${type} section must be an object`] };
  }
  const valid = validate(section);
  return {
    valid,
    errors: valid ? [] : validate.errors.map((e) => `${type}${e.instancePath.replace(/\//g, '.')} ${e.message}`)
  };
}

// The editable view of a section: without its private fields.
function publicClientConfig(type, section){
  const out = { ...(section || {}) };
  for (const key of PRIVATE_FIELDS[type] || []){
    delete out[key];
  }
  return out;
}

// ── The whole config file: dashboard Export / Import (README §10) ──────────

// Never taken from an imported file: how this Client reaches and joins its
// Coordinator, and its name (the dashboard renames it instead).
const IMPORT_IGNORED_FIELDS = ['joinKey', 'coordinatorUrl', 'name'],
  // Top-level fields a config file may carry, checked on import (anything
  // else is passed through as is). Nested secrets (artifactory.token,
  // sw.registryAuth) never leave the Client and are never imported.
  strings = { type: 'array', maxItems: 64, items: { type: 'string', minLength: 1, maxLength: 1024 } },
  fileSchema = {
    type: 'object',
    properties: {
      type: { enum: ['hw', 'sw'] },
      labels: strings,
      groups: strings,
      heartbeatIntervalSec: { type: 'integer', minimum: 1, maximum: 3600 },
      longPollWaitSec: { type: 'integer', minimum: 1, maximum: 3600 },
      sources: { type: 'object', properties: { allowedPrefixes: strings } },
      artifactory: { type: 'object', properties: { allowedArtifactPrefixes: strings } }
    }
  },
  validateFile = ajv.compile(fileSchema),

  // Also never imported: what ties a config to its host and instance — the
  // Client's identity (clientId) and every file or directory path (tokenFile,
  // socketPath, workDir, varDir, …): taken from another Client they'd share
  // its token, socket or state.
  isHostBound = (key) => key === 'clientId' || /(File|Path|Dir)$/.test(key);

// A config file with the Client-only secrets removed — what a Client
// reports for Export, and what an import may carry.
function shareableClientConfigFile(file){
  const out = JSON.parse(JSON.stringify(file || {}));
  if (out.artifactory && typeof out.artifactory === 'object'){
    delete out.artifactory.token;
  }
  for (const [type, keys]of Object.entries(PRIVATE_FIELDS)){
    for (const key of out[type] && typeof out[type] === 'object' ? keys : []){
      delete out[type][key];
    }
  }
  return out;
}

// Checks an imported config file for a `type` Client and splits it into
// what gets applied: { valid, errors, section (its hw/sw section, or null),
// fields (the other top-level fields), ignored (names left out) }.
function importClientConfigFile(type, file){
  const fail = (...errors) => ({ valid: false, errors, section: null, fields: {}, ignored: [] });
  if (!file || typeof file !== 'object' || Array.isArray(file)){
    return fail('the file must hold a JSON object — a Client config');
  }
  if (file.type !== undefined && file.type !== type){
    return fail(`it's a ${String(file.type).toUpperCase()} Client config, but this is a ${type.toUpperCase()} Client`);
  }
  if (!validateFile(file)){
    return fail(...validateFile.errors.map((e) => `${e.instancePath.replace(/^\//, '').replace(/\//g, '.') || 'config'} ${e.message}`));
  }
  const shared = shareableClientConfigFile(file),
    ignored = [],
    fields = {},
    errors = [];
  for (const [key, value]of Object.entries(shared)){
    if (IMPORT_IGNORED_FIELDS.includes(key) || isHostBound(key)){
      ignored.push(key);
    }
    else if (key === 'artifactory'){
      // Its tokenFile is a path on the Client's host: kept from there.
      const { tokenFile, ...rest } = value;
      if (tokenFile !== undefined){
        ignored.push('artifactory.tokenFile');
      }
      fields.artifactory = rest;
    }
    else if (key !== 'type' && key !== type){
      fields[key] = value;
    }
  }
  // Both sections are checked: the other type's one is kept in the file too.
  const section = shared[type] === undefined ? null : shared[type],
    other = type === 'hw' ? 'sw' : 'hw';
  if (section !== null){
    errors.push(...validateClientConfig(type, section).errors);
  }
  if (fields[other] !== undefined){
    errors.push(...validateClientConfig(other, fields[other]).errors);
  }
  return { valid: errors.length === 0, errors, section, fields, ignored };
}

module.exports = {
  validateClientConfig,
  publicClientConfig,
  shareableClientConfigFile,
  importClientConfigFile,
  CLIENT_CONFIG_PRIVATE_FIELDS: PRIVATE_FIELDS,
  CLIENT_CONFIG_IMPORT_IGNORED: IMPORT_IGNORED_FIELDS
};
