/**
 * @file        packages/shared/src/updates.js
 * @description New-version checks and `npm i -g` self-update helpers shared by the Coordinator, Agent and Client
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
  { spawnSync } = require('node:child_process');

const PACKAGES = {
    coordinator: '@andrian.yablonskyy/thub-coordinator',
    agent: '@andrian.yablonskyy/thub-agent',
    client: '@andrian.yablonskyy/thub-client'
  },

  // Strict on purpose: a version string ends up on an `npm i -g` command
  // line (as root, for the Client), so nothing but a plain semver passes.
  VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]{1,32})?$/,

  DEFAULT_REGISTRY = 'https://registry.npmjs.org';

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

// The registry npm itself would use (`npm_config_registry` is set when
// running under npm), else the public one.
function defaultRegistry(){
  return (process.env.npm_config_registry || DEFAULT_REGISTRY).replace(/\/+$/, '');
}

// Latest published version of `pkg` (its `latest` dist-tag).
async function fetchLatestVersion(pkg, { registry = defaultRegistry(), timeoutMs = 10_000 } = {}){
  const url = `${registry.replace(/\/+$/, '')}/${pkg.replace('/', '%2f')}/latest`,
    res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok){
    throw new Error(`${pkg}: registry returned HTTP ${res.status}`);
  }
  const { version } = await res.json();
  if (!isValidVersion(version)){
    throw new Error(`${pkg}: registry returned an invalid version`);
  }
  return version;
}

// The npm that belongs to the running node (same prefix as this global
// install, whether apt, nvm or a custom prefix), falling back to PATH.
function npmBin(){
  const candidate = path.join(path.dirname(process.execPath), 'npm');
  return fs.existsSync(candidate) ? candidate : 'npm';
}

// `npm i -g <pkg>@<version>` (as the current user — root for the Client's
// update helper; `sudo` is the caller's job otherwise). Returns npm's exit code.
function npmInstallGlobal(pkg, version, { env = process.env, stdio = 'inherit' } = {}){
  if (!Object.values(PACKAGES).includes(pkg)){
    throw new Error(`Refusing to install unknown package ${pkg}`);
  }
  if (!isValidVersion(version)){
    throw new Error(`Invalid version "${version}"`);
  }
  const result = spawnSync(npmBin(), ['i', '-g', `${pkg}@${version}`], { env, stdio });
  if (result.error){
    throw result.error;
  }
  return result.status;
}

module.exports = {
  PACKAGES,
  isValidVersion,
  compareVersions,
  isNewer,
  defaultRegistry,
  fetchLatestVersion,
  npmBin,
  npmInstallGlobal
};
