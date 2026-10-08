/**
 * @file        packages/shared/test/updates.test.js
 * @description Tests: releases from each package's git repository — the latest tag, `npm i -g` from git, and which
 *              installs came from npm
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
  {
    npmInstallGlobal, fetchLatestVersion, installSpec, installCommand, installedFromNpm, PACKAGES, REPOSITORIES, LAST_NPM_VERSIONS
  } = require('../src/updates');

const lsRemote = (tags) => async () => ({ stdout: tags.map((t, i) => `${String(i).padStart(40, '0')}\trefs/tags/${t}`).join('\n') + '\n' });

test('every package is released from its git repository: the Agent and Client public, the Coordinator private', () => {
  assert.equal(REPOSITORIES[PACKAGES.agent], 'git+https://github.com/andrianyablonskyy/thub-agent.git');
  assert.equal(REPOSITORIES[PACKAGES.client], 'git+https://github.com/andrianyablonskyy/thub-client.git');
  assert.equal(REPOSITORIES[PACKAGES.coordinator], 'git+ssh://git@github.com/andrianyablonskyy/thub-coordinator.git');
});

test('latest version: the highest vX.Y.Z tag, numerically; prereleases only if nothing else', async () => {
  assert.equal(await fetchLatestVersion(PACKAGES.client, { run: lsRemote(['v1.1.9', 'v1.1.13', 'v1.1.10', 'v1.2.0-rc.1', 'x', 'v1']) }), '1.1.13');
  assert.equal(await fetchLatestVersion(PACKAGES.agent, { run: lsRemote(['v2.0.0-rc.1', 'v2.0.0-rc.2']) }), '2.0.0-rc.2');
  await assert.rejects(fetchLatestVersion(PACKAGES.agent, { run: lsRemote(['nightly']) }), /no release tags/);
  await assert.rejects(fetchLatestVersion('left-pad', { run: lsRemote(['v1.0.0']) }), /unknown package/);
});

test('git runs without prompts; its own reason when it fails', async () => {
  let seen;
  await fetchLatestVersion(PACKAGES.agent, {
    env: { PATH: '/usr/bin' },
    run: async (cmd, args, opts) => {
      seen = { cmd, args, opts };
      return { stdout: 'a\trefs/tags/v1.0.0\n' };
    }
  });
  assert.deepEqual([seen.cmd, ...seen.args], ['git', 'ls-remote', '--tags', '--refs', 'https://github.com/andrianyablonskyy/thub-agent.git']);
  assert.equal(seen.opts.env.GIT_TERMINAL_PROMPT, '0');
  await assert.rejects(fetchLatestVersion(PACKAGES.client, {
    run: async () => {
      throw Object.assign(new Error('Command failed'), { stderr: 'fatal: unable to access \'https://github.com/…\': Could not resolve host\n' });
    }
  }), /git ls-remote .* failed: fatal: unable to access/);
  await assert.rejects(fetchLatestVersion(PACKAGES.client, {
    run: async () => {
      throw Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' });
    }
  }), /git isn't installed/);
});

test('install: npm i -g --install-links <repository>#v<version>; unknown packages and bad versions refused before npm runs', () => {
  const calls = [],
    spawn = (bin, args, opts) => {
      calls.push({ args, opts });
      return { status: 0 };
    };
  assert.equal(npmInstallGlobal(PACKAGES.client, '1.1.14', { spawn, env: { HOME: '/root' } }), 0);
  assert.deepEqual(calls[0].args, ['i', '-g', '--install-links', 'git+https://github.com/andrianyablonskyy/thub-client.git#v1.1.14']);
  assert.equal(calls[0].opts.env.GIT_TERMINAL_PROMPT, '0');
  assert.throws(() => npmInstallGlobal('left-pad', '1.0.0', { spawn }), /unknown package/);
  for (const bad of ['latest', '1.1', 'v1.1.14', '1.1.14; rm -rf /']){
    assert.throws(() => installSpec(PACKAGES.agent, bad), /Invalid version/);
  }
  assert.equal(calls.length, 1);
  assert.equal(installCommand(PACKAGES.agent, '1.1.12'),
    'sudo npm i -g --install-links git+https://github.com/andrianyablonskyy/thub-agent.git#v1.1.12');
});

test('installed from npm: up to the last version there — it can only update from npm', () => {
  assert.deepEqual(LAST_NPM_VERSIONS, { coordinator: '1.1.23', agent: '1.1.10', client: '1.1.12' });
  assert.equal(installedFromNpm('client', '1.1.12'), true);
  assert.equal(installedFromNpm('client', '1.0.18'), true);
  assert.equal(installedFromNpm('client', '1.1.13'), false);
  assert.equal(installedFromNpm('agent', '1.1.11'), false);
  assert.equal(installedFromNpm('agent', null), false);
});
