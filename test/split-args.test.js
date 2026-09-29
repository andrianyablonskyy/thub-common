/**
 * @file        packages/shared/test/split-args.test.js
 * @description Tests: splitting an options string into arguments with shell quoting, no shell
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
  { splitArgs } = require('../src/split-args');

test('splits like a shell: quotes, escapes, empty args; no expansion', () => {
  assert.deepEqual(splitArgs('-c core.sshCommand="ssh -i ~/.ssh/lab_key -p 2222"'), ['-c', 'core.sshCommand=ssh -i ~/.ssh/lab_key -p 2222']);
  assert.deepEqual(splitArgs('  -c \'http.extraHeader=Authorization: Bearer $TOKEN\'  '), ['-c', 'http.extraHeader=Authorization: Bearer $TOKEN']);
  assert.deepEqual(splitArgs('a\\ b "c \\"d\\" \\\\" \'\' e'), ['a b', 'c "d" \\', '', 'e']);
  assert.deepEqual(splitArgs('x"y z"\'w\''), ['xy zw']);
  assert.deepEqual(splitArgs(''), []);
});

test('rejects unterminated quotes and a trailing backslash', () => {
  assert.throws(() => splitArgs('-c "open'), /unterminated " quote/);
  assert.throws(() => splitArgs('-c \'open'), /unterminated ' quote/);
  assert.throws(() => splitArgs('-c x\\'), /trailing/);
});
