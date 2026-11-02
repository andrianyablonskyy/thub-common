/**
 * @file        packages/shared/test/updates.test.js
 * @description Tests: npm i -g for self-updates — retried while a just-published version isn't downloadable yet
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
  { npmInstallGlobal, PACKAGES, NPM_RETRY_DELAYS_SEC } = require('../src/updates');

// npm, faked: answers with the given results in turn; records every call.
function fakeNpm(results){
  const calls = [],
    slept = [];
  return {
    calls,
    slept,
    opts: {
      spawn: (bin, args, options) => {
        calls.push({ bin, args, env: options.env, stdio: options.stdio });
        return results[calls.length - 1];
      },
      sleep: (ms) => slept.push(ms),
      log: () => {}
    }
  };
}

const E404 = { status: 1, stderr: 'npm error code E404\nnpm error 404 Not Found - GET https://registry.npmjs.org/x/-/x-1.0.18.tgz\n' },
  OK = { status: 0, stderr: '' };

test('a just-published version that 404s is retried until it installs', (t) => {
  t.mock.method(process.stderr, 'write', () => true);
  const npm = fakeNpm([E404, { status: 1, stderr: 'npm error code ETARGET\n' }, OK]);
  assert.equal(npmInstallGlobal(PACKAGES.coordinator, '1.0.18', npm.opts), 0);
  assert.equal(npm.calls.length, 3);
  assert.deepEqual(npm.slept, [30_000, 60_000]);
  assert.deepEqual(npm.calls[0].args, ['i', '-g', '--prefer-online', '@andrian.yablonskyy/thub-coordinator@1.0.18']);
  assert.equal(npm.calls[0].stdio[2], 'pipe'); // stderr read to tell "not found" apart, then passed on
});

test('it gives up after the last retry, and never retries other failures', (t) => {
  t.mock.method(process.stderr, 'write', () => true);
  const always404 = fakeNpm(Array(10).fill(E404));
  assert.equal(npmInstallGlobal(PACKAGES.client, '1.0.18', always404.opts), 1);
  assert.equal(always404.calls.length, NPM_RETRY_DELAYS_SEC.length + 1);

  const denied = fakeNpm([{ status: 243, stderr: 'npm error code EACCES\n' }]);
  assert.equal(npmInstallGlobal(PACKAGES.client, '1.0.18', denied.opts), 243);
  assert.equal(denied.calls.length, 1);

  const noRetries = fakeNpm([E404]); // the Agent: a run never waits for a release
  assert.equal(npmInstallGlobal(PACKAGES.agent, '1.0.18', { ...noRetries.opts, retryDelaysSec: [] }), 1);
  assert.equal(noRetries.calls.length, 1);
});

test('unknown packages and bad versions are refused before npm runs', () => {
  const npm = fakeNpm([OK]);
  assert.throws(() => npmInstallGlobal('left-pad', '1.0.0', npm.opts), /unknown package/);
  assert.throws(() => npmInstallGlobal(PACKAGES.client, '1.0; rm -rf /', npm.opts), /Invalid version/);
  assert.equal(npm.calls.length, 0);
});

test('Windows global npm updates launch npm-cli.js with the running Node executable', () => {
  const npm = fakeNpm([OK]),
    execPath = 'C:\\Program Files\\nodejs\\node.exe',
    npmCli = 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js',
    exists = (candidate) => candidate === npmCli;
  assert.equal(npmInstallGlobal(PACKAGES.agent, '1.1.25', {
    ...npm.opts,
    platform: 'win32',
    execPath,
    exists
  }), 0);
  assert.equal(npm.calls[0].bin, execPath);
  assert.deepEqual(npm.calls[0].args, [npmCli, 'i', '-g', '--prefer-online', `${PACKAGES.agent}@1.1.25`]);
  assert.deepEqual(npm.calls[0].stdio, ['inherit', 'inherit', 'pipe']);
});

test('Windows npm.cmd fallback is invoked through a static PowerShell script', () => {
  const npm = fakeNpm([OK]),
    npmCmd = 'C:\\Program Files\\nodejs\\npm.cmd',
    exists = (candidate) => candidate === npmCmd;
  assert.equal(npmInstallGlobal(PACKAGES.agent, '1.1.25', {
    ...npm.opts,
    platform: 'win32',
    execPath: 'C:\\Program Files\\nodejs\\node.exe',
    exists
  }), 0);
  const call = npm.calls[0],
    encodedScript = call.args.at(-1);
  assert.equal(call.bin, 'powershell.exe');
  assert.equal(call.args.slice(0, -1).join(' '), '-NoLogo -NoProfile -NonInteractive -EncodedCommand');
  assert.deepEqual(JSON.parse(Buffer.from(call.env.THUB_NPM_INVOCATION, 'base64').toString('utf8')), {
    command: npmCmd,
    args: ['i', '-g', '--prefer-online', `${PACKAGES.agent}@1.1.25`]
  });
  assert.match(Buffer.from(encodedScript, 'base64').toString('utf16le'), /& \$request\.command @arguments/);
});
