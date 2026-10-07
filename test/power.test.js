/**
 * @file        packages/shared/test/power.test.js
 * @description Tests: checks on a USB port power request (action, reset delay, port)
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
  { powerRequestErrors, DEFAULT_RESET_DELAY_SEC } = require('../src/power');

test('power request: an action, a reset delay of 0-60 s for reset only, an optional port 1-8', () => {
  assert.equal(DEFAULT_RESET_DELAY_SEC, 1);
  assert.deepEqual(powerRequestErrors({ action: 'reset' }), []);
  assert.deepEqual(powerRequestErrors({ action: 'reset', delaySec: 0.5, port: 2 }), []);
  assert.deepEqual(powerRequestErrors({ action: 'off', port: null, delaySec: null }), []);
  assert.match(powerRequestErrors({ action: 'cycle' }).join(), /action must be one of on, off, reset/);
  assert.match(powerRequestErrors({}).join(), /action must be/);
  assert.match(powerRequestErrors({ action: 'reset', delaySec: 61 }).join(), /reset delay \(delaySec\) must be/);
  assert.match(powerRequestErrors({ action: 'reset', delaySec: '1' }).join(), /reset delay \(delaySec\) must be/);
  assert.match(powerRequestErrors({ action: 'on', delaySec: 1 }).join(), /reset only/);
  assert.match(powerRequestErrors({ action: 'on', port: 9 }).join(), /port must be/);
  assert.match(powerRequestErrors({ action: 'on', port: 1.5 }).join(), /port must be/);
});
