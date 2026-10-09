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
  { validateJobSpec, maskEnv } = require('../src/validate-job-spec'),
  { parseEnvList } = require('../src/env-list');

const minimal = (extra = {}) => ({ target: { type: 'hw' }, command: './ci/run.sh', ...extra });

test('accepts a minimal valid spec (target + command) and fills defaults', () => {
  const { valid, spec, errors } = validateJobSpec(minimal());
  assert.equal(valid, true, errors.join('; '));
  assert.equal(spec.timeoutSec, 1800);
  assert.equal(spec.priority, 50);
  assert.deepEqual(spec.target.labels, []);
  assert.deepEqual(spec.downloads, []);
  assert.deepEqual(spec.args, []);
  assert.equal(spec.suite, 'default');
});

test('the command is mandatory and non-empty', () => {
  assert.match(validateJobSpec({ target: { type: 'hw' } }).errors.join(), /command/);
  assert.equal(validateJobSpec(minimal({ command: '' })).valid, false);
});

test('rejects a spec with no target type, and unknown top-level fields', () => {
  assert.equal(validateJobSpec({ target: {}, command: 'x' }).valid, false);
  assert.ok(validateJobSpec(minimal({ run: 'x' })).errors.some((e) => e.includes('additional')));
});

test('fields of long-gone Agents (firmware/tests, git, image) are unknown properties', () => {
  for (const extra of [{ firmware: { url: 'https://x/a' }, tests: { url: 'https://x/t' } }, { git: { url: 'https://git.lab/t.git' } }, { image: 'alpine' }]){
    const { valid, errors } = validateJobSpec({ target: { type: 'sw' }, command: 'x', ...extra });
    assert.equal(valid, false);
    assert.match(errors.join(), /must NOT have additional properties/);
  }
});

test('accepts an optional user label (`thub run --user`, §7.1), not an empty one', () => {
  const { valid, spec, errors } = validateJobSpec(minimal({ user: 'alice' }));
  assert.equal(valid, true, errors.join('; '));
  assert.equal(spec.user, 'alice');
  assert.equal(validateJobSpec(minimal({ user: '' })).valid, false);
});

test('accepts an optional target.client (`thub run --client`, §7.1) and rejects an empty one', () => {
  assert.equal(validateJobSpec({ ...minimal(), target: { type: 'hw', client: 'lab-hw-01' } }).valid, true);
  assert.equal(validateJobSpec({ ...minimal(), target: { type: 'hw', client: '' } }).valid, false);
});

test('downloads: any number of http(s) URLs', () => {
  assert.equal(validateJobSpec(minimal({ downloads: [{ url: 'https://x/app.bin' }, { url: 'http://localhost/t.tgz' }] })).valid, true);
  assert.match(validateJobSpec(minimal({ downloads: [{ url: 'not a url' }] })).errors.join(), /format "uri"/);
  assert.equal(validateJobSpec(minimal({ downloads: [{}] })).valid, false);
});

test('env: any NAME=string pairs — no name is special, except the Client\'s own', () => {
  const check = (env) => validateJobSpec({ target: { type: 'hw' }, command: 'x', env });
  // Any subset of any names: nothing expects DOCKER_* to come together.
  assert.equal(check({ DOCKER_REGISTRY: 'registry.lab:5000', DOCKER_USER: 'ci', DOCKER_PASSWORD: 'p,w=d', DOCKER_CONFIG: '/tmp/d', FOO_1: '' }).valid, true);
  assert.equal(check({ DOCKER_PASSWORD: 'p' }).valid, true);
  assert.equal(check({ '1BAD': 'x' }).valid, false);
  assert.equal(check({ A: 1 }).valid, false);
  assert.match(check({ THUB_JOB_ID: 'x', JOB_TYPE: '1' }).errors.join(), /THUB_JOB_ID, JOB_TYPE: set by the Client itself/);
  assert.equal(check({ GIT_TOKEN: 't', GIT_SSH_COMMAND: 'ssh -i k' }).valid, true); // git's own names are the job's now
});

test('maskEnv: names kept, values hidden', () => {
  assert.deepEqual(maskEnv({ A: '1', DOCKER_PASSWORD: 'secret' }), { A: '***', DOCKER_PASSWORD: '***' });
  assert.equal(maskEnv(undefined), undefined);
});

test('parseEnvList (--env): comma-separated, values may hold commas, a bare NAME comes from the shell', () => {
  assert.deepEqual(parseEnvList(['A=1,B=x,y', 'C=a=b'], {}), { A: '1', B: 'x,y', C: 'a=b' });
  assert.deepEqual(parseEnvList(['DOCKER_PASSWORD'], { DOCKER_PASSWORD: 's3cret' }), { DOCKER_PASSWORD: 's3cret' });
  assert.deepEqual(parseEnvList(['EMPTY='], {}), { EMPTY: '' });
  assert.throws(() => parseEnvList(['NOPE'], {}), /--env NOPE: not set in this shell/);
  assert.throws(() => parseEnvList(['1X=2'], {}), /expected NAME=value/);
});

test('power: on|off|reset at start and end, a reset delay of 0-60 s, HW jobs only', () => {
  const ok = validateJobSpec(minimal({ power: { onStart: 'reset', onEnd: 'off', resetDelaySec: 2.5 } }));
  assert.equal(ok.valid, true, ok.errors.join('; '));
  assert.match(validateJobSpec(minimal({ power: { onStart: 'cycle' } })).errors.join(), /\/power\/onStart must be equal to one of/);
  assert.match(validateJobSpec(minimal({ power: { resetDelaySec: 61 } })).errors.join(), /\/power\/resetDelaySec must be <= 60/);
  assert.match(validateJobSpec(minimal({ power: { hub: '1-1' } })).errors.join(), /must NOT have additional properties/);
  assert.match(validateJobSpec(minimal({ target: { type: 'sw' }, power: { onEnd: 'off' } })).errors.join(), /HW jobs only/);
});
