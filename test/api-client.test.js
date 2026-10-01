/**
 * @file        packages/shared/test/api-client.test.js
 * @description Tests: the shared API client waits out the Coordinator's rate limit (429 + Retry-After) and retries
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
  http = require('node:http'),
  { ApiClient } = require('../src/api-client');

// A server that answers 429 (Retry-After: 1) `refusals` times, then 200.
async function server(t, refusals){
  let calls = 0;
  const srv = http.createServer((req, res) => {
    calls += 1;
    if (calls <= refusals){
      res.writeHead(429, { 'Retry-After': '1', 'Content-Type': 'application/json' });
      return res.end('{"error":"Too many requests: try again in 1 s."}');
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
  }).listen(0, '127.0.0.1');
  await new Promise((r) => srv.on('listening', r));
  t.after(() => srv.close());
  return { client: new ApiClient({ baseUrl: `http://127.0.0.1:${srv.address().port}` }), calls: () => calls };
}

test('a 429 is waited out (Retry-After) and retried', async (t) => {
  const { client, calls } = await server(t, 2),
    started = Date.now();
  assert.deepEqual(await client.post('/x', { a: 1 }), { ok: true });
  assert.equal(calls(), 3);
  assert.ok(Date.now() - started >= 1900, 'waited Retry-After twice');
});

test('after 3 retries the 429 is the result', async (t) => {
  const { client, calls } = await server(t, 99);
  await assert.rejects(client.get('/x'), (err) => err.status === 429 && /Too many requests/.test(err.message));
  assert.equal(calls(), 4);
});
