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
  { validateClientConfig, publicClientConfig, importClientConfigFile, shareableClientConfigFile } = require('../src/client-config');

test('hw: device lists, relays and power validate; bad entries are named', () => {
  const ok = validateClientConfig('hw', {
    stlinks: [{ index: 1, serial: '066DFF485457725187092834', devpath: '3.3.4.3.1' }, { serial: 'ABC123' }],
    uarts: [{ path: '/dev/thub/dut1-uart', baudRate: 115200, devpath: '3.3.3.2', vendorId: '0403', subsystem: 'tty' }],
    usbs: [{ index: 2 }],
    relays: [{ channel: 0, baseUrl: 'http://localhost:3000' }],
    power: { method: 'uhubctl', hub: '1-1', port: 2 }
  });
  assert.equal(ok.valid, true, ok.errors.join('; '));
  assert.equal(validateClientConfig('hw', { power: null }).valid, true);

  const bad = (section, re) => assert.match(validateClientConfig('hw', section).errors.join(), re);
  bad({ uarts: [{ path: '/tmp/x' }] }, /hw\.uarts\.0\.path must match/);
  bad({ uarts: [{ baudRate: 9600 }] }, /must match a schema in anyOf/); // neither index nor path
  bad({ stlinks: Array.from({ length: 9 }, (_, i) => ({ index: (i % 8) + 1 })) }, /must NOT have more than 8 items/);
  bad({ relays: [{ channel: 8 }] }, /relays\.0\.channel must be <= 7/);
  bad({ power: { method: 'magic' } }, /power\.method must be equal to one of/);
  bad({ usbs: [{ index: 1, devpath: '1.1", RUN+="x' }] }, /devpath must match/);
});

test('sw: image, registry, limits, flags and cmd; secrets are not editable', () => {
  const ok = validateClientConfig('sw', {
    image: 'dut-emulator:2026.08', registry: 'registry.lab:5000', allowDockerHub: true, allowJobImages: false, cpus: 1.5, memory: '512m',
    cmd: ['--firmware', '/downloads/app.bin']
  });
  assert.equal(ok.valid, true, ok.errors.join('; '));
  assert.match(validateClientConfig('sw', { memory: 'lots' }).errors.join(), /memory must match/);
  assert.match(validateClientConfig('sw', { cpus: 0 }).errors.join(), /cpus must be > 0/);
  assert.match(validateClientConfig('sw', { registryAuth: { username: 'u' } }).errors.join(), /additional properties/);
  assert.deepEqual(publicClientConfig('sw', { image: 'x', registryAuth: { password: 'p' } }), { image: 'x' });
  assert.match(validateClientConfig('xx', {}).errors.join(), /unknown Client type/);
});

test('config file import: joinKey, coordinatorUrl, name, the Client\'s id, paths and secrets ignored; sections checked', () => {
  const file = {
      coordinatorUrl: 'https://other', name: 'dut9', joinKey: 'k', clientId: 'c-9', type: 'sw',
      labels: ['board:x'], groups: ['g1'], heartbeatIntervalSec: 5, tokenFile: '/var/lib/thub/dut9.token', workDir: '/w',
      artifactory: { token: 'secret', tokenFile: '/etc/thub/a.token', allowedArtifactPrefixes: ['https://art/'] },
      sources: { allowedPrefixes: ['*'] },
      sw: { image: 'emu:1', registryAuth: { password: 'x' } },
      hw: { stlinks: [{ index: 1 }] }
    },
    { valid, section, fields, ignored } = importClientConfigFile('sw', file);
  assert.equal(valid, true);
  assert.deepEqual(section, { image: 'emu:1' });
  assert.deepEqual(fields, {
    labels: ['board:x'], groups: ['g1'], heartbeatIntervalSec: 5,
    artifactory: { allowedArtifactPrefixes: ['https://art/'] }, sources: { allowedPrefixes: ['*'] }, hw: { stlinks: [{ index: 1 }] }
  });
  assert.deepEqual(ignored.sort(), ['artifactory.tokenFile', 'clientId', 'coordinatorUrl', 'joinKey', 'name', 'tokenFile', 'workDir']);

  assert.match(importClientConfigFile('hw', file).errors.join(), /SW Client config, but this is a HW Client/);
  assert.match(importClientConfigFile('sw', { sw: { memory: 'lots' } }).errors.join(), /sw\.memory/);
  assert.match(importClientConfigFile('sw', { labels: 'x' }).errors.join(), /labels must be array/);
  assert.equal(importClientConfigFile('sw', []).valid, false);
  assert.deepEqual(shareableClientConfigFile(file).artifactory, { tokenFile: '/etc/thub/a.token', allowedArtifactPrefixes: ['https://art/'] });
  assert.deepEqual(shareableClientConfigFile(file).sw, { image: 'emu:1' });
});
