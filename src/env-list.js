/**
 * @file        packages/shared/src/env-list.js
 * @description Parses the Agent's `--env NAME=value[,NAME=value]` values into a job's env
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

// ['A=1,B=2', 'C'] -> { A: '1', B: '2', C: <C from environ> }. A comma only
// starts a new variable when NAME= follows it, so values may contain commas
// (`P=a,b` is P="a,b"). A bare NAME — a whole --env of its own — takes its
// value from `environ`: keeps secrets like DOCKER_PASSWORD off the command
// line and out of shell history. Throws on a malformed item or a bare NAME
// that isn't set.
function parseEnvList(values = [], environ = process.env){
  const env = {};
  for (const value of values){
    for (const item of String(value).split(/,(?=[A-Za-z_][A-Za-z0-9_]*=)/)){
      const m = /^([A-Za-z_][A-Za-z0-9_]*)(?:=(.*))?$/s.exec(item);
      if (!m){
        throw new Error(`--env ${item}: expected NAME=value or NAME (NAME: letters, digits and _, not starting with a digit)`);
      }
      const [, name, val] = m;
      if (val === undefined && environ[name] === undefined){
        throw new Error(`--env ${name}: not set in this shell — give it as ${name}=value or export it first`);
      }
      env[name] = val === undefined ? environ[name] : val;
    }
  }
  return env;
}

module.exports = { parseEnvList };
