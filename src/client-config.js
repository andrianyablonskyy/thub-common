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
  { MAX_POWER_PORTS } = require('./power');

// The config file's key for an HW Client's devices. Older files call it
// `hw`, still read (and rewritten as `hw-devices` on the next save).
const HW_DEVICES = 'hw-devices',
  MAX_DEVICES = 8,
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
      // USB port power switched with uhubctl (README §8.7): each port by its
      // hub's location and port number, as `uhubctl` lists them
      // ("Current status for hub 1-1.4" … "Port 2").
      usbPower: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ports: {
            type: 'array',
            maxItems: MAX_POWER_PORTS,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['hub', 'port'],
              properties: {
                hub: { type: 'string', pattern: '^[0-9]+(-[0-9]+(\\.[0-9]+)*)?$', maxLength: 64 },
                port: { type: 'integer', minimum: 1, maximum: 255 }
              }
            }
          }
        }
      }
    }
  },
  // An SW Client has no settings of its own: its editable section is empty.
  swSchema = { type: 'object', additionalProperties: false, properties: {} },
  ajv = new Ajv({ allErrors: true, strict: false }),
  validators = { hw: null, sw: null };
addFormats(ajv);
validators.hw = ajv.compile(hwSchema);
validators.sw = ajv.compile(swSchema);

// The hw-devices section of a config file (or its older name, `hw`).
function hwDevicesOf(file){
  return file?.[HW_DEVICES] !== undefined ? file[HW_DEVICES] : file?.hw;
}

// An hw-devices section without the older power control Clients no longer
// have (relays, power — relay boards, and uhubctl before usbPower), so a config file that still
// has them reports, saves and imports without them. Returns
// { section, dropped } (dropped: the names left out).
function withoutPowerControl(hw){
  if (!hw || typeof hw !== 'object' || Array.isArray(hw)){
    return { section: hw, dropped: [] };
  }
  const { relays, power, ...section } = hw;
  return {
    section,
    dropped: [...(relays !== undefined ? [`${HW_DEVICES}.relays`] : []), ...(power !== undefined ? [`${HW_DEVICES}.power`] : [])]
  };
}

// { valid, errors } for a Client's editable section: an HW Client's
// hw-devices; an SW Client's is always empty ({}).
function validateClientConfig(type, section){
  const validate = validators[type];
  if (!validate){
    return { valid: false, errors: [`unknown Client type "${type}"`] };
  }
  if (!section || typeof section !== 'object' || Array.isArray(section)){
    return { valid: false, errors: [`the ${type === 'hw' ? HW_DEVICES : type} section must be an object`] };
  }
  const valid = validate(section);
  return {
    valid,
    errors: valid
      ? []
      : validate.errors.map((e) => (type === 'sw'
        ? 'an SW Client has no settings of its own (the sw section is gone)'
        : `${HW_DEVICES}${e.instancePath.replace(/\//g, '.')} ${e.message}`))
  };
}

// ── The whole config file: dashboard Export / Import (README §10) ──────────

// Never taken from an imported file: how this Client reaches and joins its
// Coordinator, and its name (the dashboard renames it instead).
const IMPORT_IGNORED_FIELDS = ['joinKey', 'coordinatorUrl', 'name'],
  // Top-level fields a config file may carry, checked on import (anything
  // else is passed through as is).
  strings = { type: 'array', maxItems: 64, items: { type: 'string', minLength: 1, maxLength: 1024 } },
  fileSchema = {
    type: 'object',
    properties: {
      type: { enum: ['hw', 'sw'] },
      labels: strings,
      groups: strings,
      heartbeatIntervalSec: { type: 'integer', minimum: 1, maximum: 3600 },
      longPollWaitSec: { type: 'integer', minimum: 1, maximum: 3600 }
    }
  },
  validateFile = ajv.compile(fileSchema),

  // Also never imported: what ties a config to its host and instance — the
  // Client's identity (clientId) and every file or directory path (tokenFile,
  // socketPath, workDir, varDir, …): taken from another Client they'd share
  // its token, socket or state.
  isHostBound = (key) => key === 'clientId' || /(File|Path|Dir)$/.test(key),

  // Sections older Clients had and current ones ignore — dropped from
  // Export (`artifactory` held a token, `sw` a registry password) and
  // listed as ignored on Import.
  LEGACY_SECTIONS = ['artifactory', 'sources', 'sw'];

// A config file as it's shared (Export, and what an Import may carry): the
// legacy sections dropped, an older `hw` section under its new name.
function shareableClientConfigFile(file){
  const out = JSON.parse(JSON.stringify(file || {})),
    hw = hwDevicesOf(out);
  for (const key of [...LEGACY_SECTIONS, 'hw']){
    delete out[key];
  }
  if (hw !== undefined){
    out[HW_DEVICES] = hw;
  }
  return out;
}

// Checks an imported config file for a `type` Client and splits it into
// what gets applied: { valid, errors, section (an HW Client's hw-devices, or
// null; an SW Client's is always {}), fields (the other top-level fields),
// ignored (names left out) }.
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
  ignored.push(...LEGACY_SECTIONS.filter((key) => file[key] !== undefined));
  let section = type === 'sw' ? {} : null;
  if (shared[HW_DEVICES] !== undefined){
    if (type === 'hw'){
      const { section: hw, dropped } = withoutPowerControl(shared[HW_DEVICES]);
      section = hw;
      ignored.push(...dropped);
      errors.push(...validateClientConfig('hw', section).errors);
    }
    else {
      ignored.push(HW_DEVICES); // an SW Client has no devices
    }
  }
  for (const [key, value]of Object.entries(shared)){
    if (IMPORT_IGNORED_FIELDS.includes(key) || isHostBound(key)){
      ignored.push(key);
    }
    else if (key !== 'type' && key !== HW_DEVICES){
      fields[key] = value;
    }
  }
  return { valid: errors.length === 0, errors, section, fields, ignored };
}

module.exports = {
  validateClientConfig,
  shareableClientConfigFile,
  importClientConfigFile,
  withoutPowerControl,
  hwDevicesOf,
  HW_DEVICES_SECTION: HW_DEVICES,
  CLIENT_CONFIG_IMPORT_IGNORED: IMPORT_IGNORED_FIELDS
};
