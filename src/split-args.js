/**
 * @file        packages/shared/src/split-args.js
 * @description Splits a command-line options string into arguments the way a POSIX shell would quote them —
 *              without running a shell (for `thub run --git-options`)
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

// Whitespace separates arguments; '...' is literal; "..." keeps spaces, with
// \" \\ \$ \` escaped; a backslash outside quotes escapes the next
// character. No expansion of any kind ($VAR, ~, globs) — the result goes
// straight to execFile. Throws on an unterminated quote or trailing "\".
function splitArgs(text){
  const args = [],
    s = String(text ?? '');
  let current = null,
    i = 0;
  const push = (ch) => {
    current = (current ?? '') + ch;
  };
  while (i < s.length){
    const ch = s[i];
    if (/\s/.test(ch)){
      if (current !== null){
        args.push(current);
        current = null;
      }
      i++;
    }
    else if (ch === '\''){
      const end = s.indexOf('\'', i + 1);
      if (end < 0){
        throw new Error('unterminated \' quote');
      }
      push(s.slice(i + 1, end));
      i = end + 1;
    }
    else if (ch === '"'){
      let j = i + 1,
        closed = false;
      push('');
      while (j < s.length){
        if (s[j] === '\\' && /["\\$`]/.test(s[j + 1] || '')){
          push(s[j + 1]);
          j += 2;
        }
        else if (s[j] === '"'){
          closed = true;
          j++;
          break;
        }
        else {
          push(s[j]);
          j++;
        }
      }
      if (!closed){
        throw new Error('unterminated " quote');
      }
      i = j;
    }
    else if (ch === '\\'){
      if (i + 1 >= s.length){
        throw new Error('trailing \\');
      }
      push(s[i + 1]);
      i += 2;
    }
    else {
      push(ch);
      i++;
    }
  }
  if (current !== null){
    args.push(current);
  }
  return args;
}

module.exports = { splitArgs };
