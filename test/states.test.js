'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { exitCodeForJobState, EXIT_CODES, JOB_STATES } = require('../src/states');

test('exit codes match README §7', () => {
  assert.equal(exitCodeForJobState(JOB_STATES.PASSED), EXIT_CODES.PASSED);
  assert.equal(exitCodeForJobState(JOB_STATES.FAILED), EXIT_CODES.FAILED);
  assert.equal(exitCodeForJobState(JOB_STATES.ERROR), EXIT_CODES.INFRA);
  assert.equal(exitCodeForJobState(JOB_STATES.TIMEOUT), EXIT_CODES.INFRA);
  assert.equal(exitCodeForJobState(JOB_STATES.LOST), EXIT_CODES.INFRA);
  assert.equal(exitCodeForJobState(JOB_STATES.CANCELED), EXIT_CODES.CANCELED);
});
