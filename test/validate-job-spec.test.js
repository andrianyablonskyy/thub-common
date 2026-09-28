/**
 * @file        packages/shared/test/validate-job-spec.test.js
 * @description Tests: job spec schema validation (accepts/rejects)
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
  { validateJobSpec } = require('../src/validate-job-spec');

test('accepts a minimal valid spec and fills defaults', () => {
  const { valid, spec, errors } = validateJobSpec({
    target: { type: 'hw' },
    firmware: { url: 'https://artifactory.example.com/app.bin' },
    tests: { url: 'https://artifactory.example.com/tests.tar.gz' }
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
    tests: { url: 'https://x/tests.tar.gz' }
  });
  assert.equal(valid, false);
  assert.ok(errors.length > 0);
});

test('rejects unknown top-level fields (no shell commands, §4.3)', () => {
  const { valid, errors } = validateJobSpec({
    target: { type: 'sw' },
    firmware: { url: 'https://x/app.bin' },
    tests: { url: 'https://x/tests.tar.gz' },
    command: 'rm -rf /'
  });
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('additional')));
});

test('accepts an optional user label (`thub run --user`, §7.1)', () => {
  const { valid, spec, errors } = validateJobSpec({
    target: { type: 'sw' },
    firmware: { url: 'https://x/app.bin' },
    tests: { url: 'https://x/tests.tar.gz' },
    user: 'alice'
  });
  assert.equal(valid, true, errors.join('; '));
  assert.equal(spec.user, 'alice');
});

test('rejects an empty user label', () => {
  const { valid, errors } = validateJobSpec({
    target: { type: 'sw' },
    firmware: { url: 'https://x/app.bin' },
    tests: { url: 'https://x/tests.tar.gz' },
    user: ''
  });
  assert.equal(valid, false);
  assert.ok(errors.length > 0);
});

test('accepts an optional target.client (`thub run --client`, §7.1) and rejects an empty one', () => {
  const base = { firmware: { url: 'https://x/app.bin' }, tests: { url: 'https://x/tests.tar.gz' } };
  assert.equal(validateJobSpec({ ...base, target: { type: 'hw', client: 'lab-hw-01' } }).valid, true);
  assert.equal(validateJobSpec({ ...base, target: { type: 'hw', client: '' } }).valid, false);
});

test('firmware: a url, or for SW jobs a Docker image — never both, never neither', () => {
  const base = { tests: { url: 'https://x/t.tar.gz' } },
    check = (target, firmware) => validateJobSpec({ ...base, target, firmware });
  assert.equal(check({ type: 'sw' }, { image: 'alpine' }).valid, true);
  assert.equal(check({ type: 'sw' }, { image: 'registry.lab:5000/team/emu:1.2' }).valid, true);
  assert.equal(check({ type: 'sw' }, { image: `alpine@sha256:${'a'.repeat(64)}` }).valid, true);
  assert.equal(check({ type: 'hw' }, { url: 'https://x/app.bin' }).valid, true);

  assert.match(check({ type: 'hw' }, { image: 'alpine' }).errors.join(), /only works for SW jobs/);
  assert.match(check({ type: 'sw' }, { url: 'https://x/a', image: 'alpine' }).errors.join(), /not both/);
  assert.match(check({ type: 'sw' }, {}).errors.join(), /needs url .* or image/);
  assert.match(check({ type: 'sw' }).errors.join(), /firmware is required/);
  assert.match(check({ type: 'sw' }, { image: 'alpine', sha256: 'a'.repeat(64) }).errors.join(), /pin a Docker image by digest/);
  assert.equal(check({ type: 'sw' }, { image: 'Alpine; rm -rf /' }).valid, false);
  assert.match(check({ type: 'hw' }, { url: 'alpine' }).errors.join(), /format "uri"/);
});

test('tests: an archive url or a git repo (+ at most one ref), optional command; unsafe git input rejected', () => {
  const base = { target: { type: 'sw' }, firmware: { image: 'alpine' } },
    check = (tests) => validateJobSpec({ ...base, tests });
  assert.equal(check({ url: 'http://localhost/test-cases' }).valid, true);
  assert.equal(check({ git: { url: 'https://git.lab/team/tests.git', branch: 'release/1.2' } }).valid, true);
  assert.equal(check({ git: { url: 'git@github.com:team/tests.git', tag: 'v1.0.0' } }).valid, true);
  assert.equal(check({ git: { url: 'ssh://git@git.lab/tests', commit: 'a1b2c3d' }, command: 'make test' }).valid, true);

  assert.match(check({}).errors.join(), /needs url .* or git/);
  assert.match(check({ url: 'http://x/a.tgz', git: { url: 'https://x/r.git' } }).errors.join(), /not both/);
  assert.match(check({ git: { url: 'https://x/r.git', branch: 'a', tag: 'b' } }).errors.join(), /at most one of branch, tag or commit/);
  for (const url of ['ext::sh -c touch% /tmp/pwned', 'file:///etc', '/srv/repo.git', '--upload-pack=touch /tmp/x']){
    assert.equal(check({ git: { url } }).valid, false, url);
  }
  for (const branch of ['-b', '--upload-pack=x', 'a..b', 'a b', 'feature/', 'x.lock']){
    assert.equal(check({ git: { url: 'https://x/r.git', branch } }).valid, false, branch);
  }
  assert.equal(check({ git: { url: 'https://x/r.git', commit: 'xyz1234' } }).valid, false);
  assert.equal(check({ url: 'http://x/a.tgz', command: '' }).valid, false);
});
