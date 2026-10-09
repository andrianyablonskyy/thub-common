/**
 * @file        packages/shared/test/client-config.test.js
 * @description Tests: validation of the dashboard-editable Client config (hw / sw capabilities)
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

const test = require('node:test'),
  assert = require('node:assert/strict'),
  { validateClientConfig, importClientConfigFile, shareableClientConfigFile, hwDevicesOf } = require('../src/client-config');

test('hw-devices: device lists validate; bad entries and power control (relays, power) are refused', () => {
  const ok = validateClientConfig('hw', {
    stlinks: [{ index: 1, serial: '066DFF485457725187092834', devpath: '3.3.4.3.1' }, { serial: 'ABC123' }],
    uarts: [{ path: '/dev/thub/dut1-uart', baudRate: 115200, devpath: '3.3.3.2', vendorId: '0403', subsystem: 'tty' }],
    usbs: [{ index: 2 }]
  });
  assert.equal(ok.valid, true, ok.errors.join('; '));

  const bad = (section, re) => assert.match(validateClientConfig('hw', section).errors.join(), re);
  bad({ uarts: [{ path: '/tmp/x' }] }, /hw-devices\.uarts\.0\.path must match/);
  bad({ uarts: [{ baudRate: 9600 }] }, /must match a schema in anyOf/); // neither index nor path
  bad({ stlinks: Array.from({ length: 17 }, (_, i) => ({ index: (i % 8) + 1 })) }, /must NOT have more than 16 items/);
  bad({ uarts: [{ index: 9 }] }, /index must be <= 8/); // /dev/thub/dut1..8
  assert.equal(validateClientConfig('hw', { uarts: Array.from({ length: 10 }, (_, i) => ({ path: `/dev/thub/x${i}`, label: `dut${i}-uart` })) }).valid, true);
  bad({ uarts: [{ index: 1, label: 'has space' }] }, /label must match/);
  bad({ relays: [{ channel: 0 }] }, /must NOT have additional properties/);
  bad({ power: { method: 'uhubctl', hub: '1-1', port: 2 } }, /must NOT have additional properties/);
  bad({ usbs: [{ index: 1, devpath: '1.1", RUN+="x' }] }, /devpath must match/);
});

test('sw: an SW Client has no settings — only an empty section validates', () => {
  assert.equal(validateClientConfig('sw', {}).valid, true);
  assert.match(validateClientConfig('sw', { image: 'emu:1' }).errors.join(), /SW Client has no settings of its own/);
  assert.match(validateClientConfig('xx', {}).errors.join(), /unknown Client type/);
});

test('hw-devices: read under that name only; shared as a copy', () => {
  assert.deepEqual(hwDevicesOf({ 'hw-devices': { uarts: [] } }), { uarts: [] });
  assert.equal(hwDevicesOf({ hw: { usbs: [] } }), undefined);
  const file = { type: 'hw', 'hw-devices': { usbs: [] } };
  assert.deepEqual(shareableClientConfigFile(file), file);
  assert.notEqual(shareableClientConfigFile(file), file);
});

test('config file import: joinKey, coordinatorUrl, name, the Client\'s id and paths ignored; devices checked', () => {
  const file = {
      coordinatorUrl: 'https://other', name: 'dut9', joinKey: 'k', clientId: 'c-9', type: 'hw',
      labels: ['board:x'], groups: ['g1'], heartbeatIntervalSec: 5, tokenFile: '/var/lib/thub/dut9.token', workDir: '/w',
      'hw-devices': { stlinks: [{ index: 1 }] }
    },
    { valid, section, fields, ignored } = importClientConfigFile('hw', file);
  assert.equal(valid, true);
  assert.deepEqual(section, { stlinks: [{ index: 1 }] });
  assert.deepEqual(fields, { labels: ['board:x'], groups: ['g1'], heartbeatIntervalSec: 5 });
  assert.deepEqual(ignored.sort(), ['clientId', 'coordinatorUrl', 'joinKey', 'name', 'tokenFile', 'workDir']);
  // An SW Client: an empty section; any devices ignored.
  const sw = importClientConfigFile('sw', { ...file, type: 'sw' });
  assert.deepEqual([sw.valid, sw.section, sw.ignored.includes('hw-devices')], [true, {}, true]);

  assert.match(importClientConfigFile('sw', file).errors.join(), /HW Client config, but this is a SW Client/);
  assert.match(importClientConfigFile('hw', { 'hw-devices': { uarts: [{ path: '/tmp/x' }] } }).errors.join(), /hw-devices\.uarts/);
  assert.match(importClientConfigFile('hw', { labels: 'x' }).errors.join(), /labels must be array/);
  assert.equal(importClientConfigFile('hw', []).valid, false);
  // Power control of long-gone versions (relays, power) is no device setting.
  assert.match(importClientConfigFile('hw', { 'hw-devices': { usbs: [], relays: [{ channel: 0 }] } }).errors.join(), /must NOT have additional properties/);
});

test('hw-devices.usbPower: uhubctl ports by hub location and port number', () => {
  const ok = validateClientConfig('hw', { usbPower: { ports: [{ hub: '1-1.4', port: 2 }, { hub: '3', port: 1 }] } });
  assert.equal(ok.valid, true, ok.errors.join('; '));
  const bad = (section, re) => assert.match(validateClientConfig('hw', { usbPower: section }).errors.join(), re);
  bad({ ports: [{ hub: '1-1.4' }] }, /must have required property 'port'/);
  bad({ ports: [{ hub: '1-1; reboot', port: 1 }] }, /hub must match/);
  bad({ ports: [{ hub: '1-1', port: 0 }] }, /port must be >= 1/);
  bad({ ports: Array.from({ length: 9 }, (_, i) => ({ hub: '1-1', port: i + 1 })) }, /must NOT have more than 8 items/);
});
