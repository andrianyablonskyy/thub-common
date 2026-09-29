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

module.exports = { validateClientConfig, publicClientConfig, CLIENT_CONFIG_PRIVATE_FIELDS: PRIVATE_FIELDS };
