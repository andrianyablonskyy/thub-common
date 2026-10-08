/**
 * @file        packages/shared/src/updates.js
 * @description New-version checks (release tags of each package's git repository) and `npm i -g` from git, shared by
 *              the Coordinator, Agent and Client (README §10.2, §14.1)
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

const fs = require('node:fs'),
  path = require('node:path'),
  { execFile, spawnSync } = require('node:child_process'),
  { promisify } = require('node:util');

const PACKAGES = {
    coordinator: '@andrian.yablonskyy/thub-coordinator',
    agent: '@andrian.yablonskyy/thub-agent',
    client: '@andrian.yablonskyy/thub-client'
  },

  // Where each one is released: its repository's vX.Y.Z tags — nothing is on
  // npm any more (README §14.1). The Agent's and Client's are public, so no
  // credentials are needed; the Coordinator's is private (an SSH deploy key).
  REPOSITORIES = {
    [PACKAGES.coordinator]: 'git+ssh://git@github.com/andrianyablonskyy/thub-coordinator.git',
    [PACKAGES.agent]: 'git+https://github.com/andrianyablonskyy/thub-agent.git',
    [PACKAGES.client]: 'git+https://github.com/andrianyablonskyy/thub-client.git'
  },

  // The last version of each on npm. Anything up to it was installed from npm
  // and updates itself from npm only, so it can't take a release from git:
  // it's reinstalled from git once, by hand (README §8.5, §7, §13.1).
  LAST_NPM_VERSIONS = {
    coordinator: '1.1.23',
    agent: '1.1.10',
    client: '1.1.12'
  },

  // npm's flags for a global install from git. Before installing, npm
  // prepares the clone with a nested `npm install` that inherits --global and
  // "installs" the throwaway clone as a symlink, gone by the time the real
  // install runs into it (spawn sh ENOENT): --install-links copies instead.
  NPM_INSTALL_ARGS = ['i', '-g', '--install-links'],

  // Strict on purpose: a version string ends up on an `npm i -g` command
  // line (as root, for the Client), so nothing but a plain semver passes.
  VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]{1,32})?$/,

  LS_REMOTE_TIMEOUT_MS = 60_000;

function isNewer(candidate, current){
  return isValidVersion(candidate) && isValidVersion(current) && compareVersions(candidate, current) > 0;
}
function isValidVersion(v){
  return typeof v === 'string' && VERSION_RE.test(v);
}

// Semver precedence for x.y.z[-pre]: numeric core first, then a release
// sorts after any of its prereleases. Returns <0, 0 or >0.
function compareVersions(a, b){
  const [coreA, preA] = String(a).split('-', 2),
    [coreB, preB] = String(b).split('-', 2),
    partsA = coreA.split('.').map(Number),
    partsB = coreB.split('.').map(Number);
  for (let i = 0; i < 3; i++){
    const diff = (partsA[i] || 0) - (partsB[i] || 0);
    if (diff){
      return diff;
    }
  }
  if (preA === preB){
    return 0;
  }
  if (!preA){
    return 1;
  }
  if (!preB){
    return -1;
  }
  return preA < preB ? -1 : 1;
}

function isNewer(candidate, current){
  return isValidVersion(candidate) && isValidVersion(current) && compareVersions(candidate, current) > 0;
}

// Installed from npm (a version up to the last one there): it can only
// update from npm, where nothing new comes — reinstall it from git once.
function installedFromNpm(app, version){
  return isValidVersion(version) && LAST_NPM_VERSIONS[app] !== undefined && compareVersions(version, LAST_NPM_VERSIONS[app]) <= 0;
}

function repositoryOf(pkg){
  const repo = REPOSITORIES[pkg];
  if (!repo){
    throw new Error(`Refusing to install unknown package ${pkg}`);
  }
  return repo;
}

// What `npm i -g` installs for a version: the repository at its release tag.
function installSpec(pkg, version){
  const repo = repositoryOf(pkg);
  if (!isValidVersion(version)){
    throw new Error(`Invalid version "${version}"`);
  }
  return `${repo}#v${version}`;
}

// The command line to install a version by hand (messages, hints).
function installCommand(pkg, version, { sudo = true } = {}){
  return `${sudo ? 'sudo ' : ''}npm ${NPM_INSTALL_ARGS.join(' ')} ${installSpec(pkg, version)}`;
}

// git without prompts: no access fails at once, with git's reason.
function gitEnv(env = process.env){
  return { ...env, GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: env.GIT_SSH_COMMAND || 'ssh -o BatchMode=yes -o ConnectTimeout=20' };
}

// The latest release of `pkg`: its repository's highest vX.Y.Z tag (a
// prerelease only if there's nothing else). `run`: for tests.
async function fetchLatestVersion(pkg, { env = process.env, run = promisify(execFile) } = {}){
  const url = repositoryOf(pkg).replace(/^git\+/, '');
  let stdout;
  try {
    ({ stdout } = await run('git', ['ls-remote', '--tags', '--refs', url], {
      env: gitEnv(env), timeout: LS_REMOTE_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024
    }));
  }
  catch (err){
    if (err.code === 'ENOENT'){
      throw new Error(`${pkg}: git isn't installed (it's needed to check for and install releases)`);
    }
    const lines = String(err.stderr || err.message).split('\n').map((l) => l.trim()).filter(Boolean),
      detail = lines.find((l) => /^(ERROR|fatal|ssh|git@|Permission|Host key)/i.test(l)) || lines[0] || 'no output';
    throw new Error(`${pkg}: git ls-remote ${url} failed: ${detail}`);
  }
  const versions = [...stdout.matchAll(/\trefs\/tags\/v(\S+)$/gm)].map((m) => m[1]).filter(isValidVersion);
  if (!versions.length){
    throw new Error(`${pkg}: no release tags (vX.Y.Z) in ${url}`);
  }
  const stable = versions.filter((v) => !v.includes('-'));
  return (stable.length ? stable : versions).sort(compareVersions).at(-1);
}

// The npm that belongs to the running node (same prefix as this global
// install, whether apt, nvm or a custom prefix), falling back to PATH.
function npmBin(){
  const candidate = path.join(path.dirname(process.execPath), 'npm');
  return fs.existsSync(candidate) ? candidate : 'npm';
}

// `npm i -g --install-links <repo>#v<version>` (as the current user — root
// for the Client's and Coordinator's update helpers; `sudo` is the caller's
// job otherwise). Returns npm's exit code. `spawn`: for tests.
function npmInstallGlobal(pkg, version, { env = process.env, stdio = 'inherit', spawn = spawnSync } = {}){
  const result = spawn(npmBin(), [...NPM_INSTALL_ARGS, installSpec(pkg, version)], { env: gitEnv(env), stdio });
  if (result.error){
    throw result.error;
  }
  return result.status;
}

module.exports = {
  PACKAGES,
  REPOSITORIES,
  LAST_NPM_VERSIONS,
  NPM_INSTALL_ARGS,
  isValidVersion,
  compareVersions,
  isNewer,
  installedFromNpm,
  installSpec,
  installCommand,
  fetchLatestVersion,
  npmBin,
  npmInstallGlobal
};
