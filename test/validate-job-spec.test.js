'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateJobSpec } = require('../src/validate-job-spec');

test('accepts a minimal valid spec and fills defaults', () => {
  const { valid, spec, errors } = validateJobSpec({
    target: { type: 'hw' },
    firmware: { url: 'https://artifactory.example.com/app.bin' },
    tests: { url: 'https://artifactory.example.com/tests.tar.gz' },
  });
  assert.equal(valid, true, errors.join('; '));
  assert.equal(spec.timeoutSec, 1800);
  assert.equal(spec.priority, 50);
  assert.deepEqual(spec.target.labels, []);
});

test('rejects a spec with no target type', () => {
  const { valid, errors } = validateJobSpec({
    target: {},
    firmware: { url: 'https://x/app.bin' },
    tests: { url: 'https://x/tests.tar.gz' },
  });
  assert.equal(valid, false);
  assert.ok(errors.length > 0);
});

test('rejects unknown top-level fields (no shell commands, §4.3)', () => {
  const { valid, errors } = validateJobSpec({
    target: { type: 'sw' },
    firmware: { url: 'https://x/app.bin' },
    tests: { url: 'https://x/tests.tar.gz' },
    command: 'rm -rf /',
  });
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('additional')));
});
