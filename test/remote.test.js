/**
 * @file        packages/shared/test/remote.test.js
 * @description Tests: the remote access protocol (README §5.6) — data framing and what the Agent may ask for
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
  { encodeData, decodeData, dataMessages, agentControl, parseControl, remoteUrl, backoffMs, REMOTE_MAX_CHUNK } = require('../src/remote');

test('data messages: a 2-byte channel, then the bytes; big ones split', () => {
  const msg = encodeData(513, Buffer.from('hi'));
  assert.deepEqual([...msg], [2, 1, 104, 105]);
  assert.deepEqual(decodeData(msg), { ch: 513, data: Buffer.from('hi') });
  assert.equal(decodeData(Buffer.from([1])), null);
  const parts = [...dataMessages(7, Buffer.alloc(REMOTE_MAX_CHUNK * 2 + 1))];
  assert.deepEqual(parts.map((p) => p.length - 2), [REMOTE_MAX_CHUNK, REMOTE_MAX_CHUNK, 1]);
});

test('the Agent opens a UART or a probe by index, with an OpenOCD target name — nothing else', () => {
  assert.deepEqual(agentControl({ t: 'open', ch: 1, kind: 'swd', index: 2, target: 'stm32f4x', extra: 1 }),
    { t: 'open', ch: 1, kind: 'swd', index: 2, target: 'stm32f4x' });
  assert.deepEqual(agentControl({ t: 'close', ch: 3 }), { t: 'close', ch: 3 });
  for (const bad of [
    { t: 'open', ch: 1, kind: 'swd', index: 1, target: '../../etc/passwd' },
    { t: 'open', ch: 1, kind: 'swd', index: 1, target: 'stm32f4x -c shutdown' },
    { t: 'open', ch: 1, kind: 'shell', index: 1 },
    { t: 'open', ch: 0, kind: 'uart', index: 1 },
    { t: 'open', ch: 1, kind: 'uart', index: '/dev/sda' },
    { t: 'devices' },
    null
  ]){
    assert.equal(agentControl(bad), null, JSON.stringify(bad));
  }
  assert.equal(parseControl('nope'), null);
  assert.deepEqual(parseControl('{"t":"close","ch":1}'), { t: 'close', ch: 1 });
});

test('the WebSocket URL and reconnect delays', () => {
  assert.equal(remoteUrl('https://thub.example.com/', '/resources/x/remote'), 'wss://thub.example.com/api/v1/resources/x/remote');
  assert.equal(remoteUrl('http://127.0.0.1:8080', '/a'), 'ws://127.0.0.1:8080/api/v1/a');
  assert.ok(backoffMs(0) >= 800 && backoffMs(0) <= 1200);
  assert.ok(backoffMs(20) <= 36_000);
});
