/**
 * @file        packages/shared/test/states.test.js
 * @description Tests: state enum and exit-code mapping
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
  { exitCodeForJobState, EXIT_CODES, JOB_STATES } = require('../src/states');

test('exit codes match README §7', () => {
  assert.equal(exitCodeForJobState(JOB_STATES.PASSED), EXIT_CODES.PASSED);
  assert.equal(exitCodeForJobState(JOB_STATES.FAILED), EXIT_CODES.FAILED);
  assert.equal(exitCodeForJobState(JOB_STATES.ERROR), EXIT_CODES.INFRA);
  assert.equal(exitCodeForJobState(JOB_STATES.TIMEOUT), EXIT_CODES.INFRA);
  assert.equal(exitCodeForJobState(JOB_STATES.LOST), EXIT_CODES.INFRA);
  assert.equal(exitCodeForJobState(JOB_STATES.CANCELED), EXIT_CODES.CANCELED);
});
