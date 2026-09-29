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

test('an old-Agent spec (firmware/tests) gets an "update the Agent" error', () => {
  const { valid, errors } = validateJobSpec({ target: { type: 'hw' }, firmware: { url: 'https://x/a' }, tests: { url: 'https://x/t' } });
  assert.equal(valid, false);
  assert.match(errors.join(), /older Agent.*thub self-update/);
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

test('image: a Docker image reference, SW jobs only', () => {
  const sw = (image) => validateJobSpec({ ...minimal({ image }), target: { type: 'sw' } });
  assert.equal(sw('alpine').valid, true);
  assert.equal(sw('registry.lab:5000/team/emu:1.2').valid, true);
  assert.equal(sw(`alpine@sha256:${'a'.repeat(64)}`).valid, true);
  assert.equal(sw('Alpine; rm -rf /').valid, false);
  assert.match(validateJobSpec(minimal({ image: 'alpine' })).errors.join(), /only works for SW jobs/);
});

test('git: repo URL, optional ref (branch/tag/commit) and depth (default 1); unsafe input rejected', () => {
  const check = (git) => validateJobSpec(minimal({ git }));
  assert.equal(check({ url: 'https://git.lab/team/tests.git' }).spec.git.depth, 1);
  assert.equal(check({ url: 'https://git.lab/team/tests.git', ref: 'release/1.2', depth: 5 }).valid, true);
  assert.equal(check({ url: 'git@github.com:team/tests.git', ref: 'v1.0.0' }).valid, true);
  assert.equal(check({ url: 'ssh://git@git.lab/tests', ref: 'a1b2c3d', depth: 0 }).valid, true);
  for (const url of ['ext::sh -c touch% /tmp/pwned', 'file:///etc', '/srv/repo.git', '--upload-pack=touch /tmp/x']){
    assert.equal(check({ url }).valid, false, url);
  }
  for (const ref of ['-b', '--upload-pack=x', 'a..b', 'a b', 'feature/', 'x.lock']){
    assert.equal(check({ url: 'https://x/r.git', ref }).valid, false, ref);
  }
  assert.equal(check({ url: 'https://x/r.git', depth: -1 }).valid, false);
});

test('git.options: a quoted options string; unbalanced quotes are refused', () => {
  const check = (options) => validateJobSpec({ target: { type: 'hw' }, command: 'x', git: { url: 'https://x/r.git', options } });
  assert.equal(check('-c core.sshCommand="ssh -i ~/.ssh/k -p 2222"').valid, true);
  assert.match(check('-c "open').errors.join(), /git\/options can't be split.*unterminated/);
  assert.equal(check('x'.repeat(1025)).valid, false);
});

test('env: any NAME=string pairs — no name is special, except the Client\'s own', () => {
  const check = (env) => validateJobSpec({ target: { type: 'hw' }, command: 'x', env });
  // Any subset of any names: nothing expects DOCKER_* to come together.
  assert.equal(check({ DOCKER_REGISTRY: 'registry.lab:5000', DOCKER_USER: 'ci', DOCKER_PASSWORD: 'p,w=d', DOCKER_CONFIG: '/tmp/d', FOO_1: '' }).valid, true);
  assert.equal(check({ DOCKER_PASSWORD: 'p' }).valid, true);
  assert.equal(check({ '1BAD': 'x' }).valid, false);
  assert.equal(check({ A: 1 }).valid, false);
  assert.match(check({ THUB_JOB_ID: 'x', GIT_ALLOW_PROTOCOL: 'ext' }).errors.join(), /THUB_JOB_ID, GIT_ALLOW_PROTOCOL: set by the Client itself/);
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
