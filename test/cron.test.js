/**
 * @file        packages/shared/test/cron.test.js
 * @description Tests: 5-field cron parsing, matching and next occurrence (scheduled host reboots)
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
  { parseCron, cronMatches, nextCronRun } = require('../src/cron');

const UTC = { timeZone: 'UTC' },
  at = (iso) => new Date(iso),
  next = (cron, from, tz = 'UTC') => nextCronRun(cron, at(from), { timeZone: tz })?.toISOString();

test('parses fields, lists, ranges, steps, names and macros; rejects bad input readably', () => {
  const c = parseCron('*/15 3,4 1-5 jan-mar mon-fri');
  assert.deepEqual([...c.minute], [0, 15, 30, 45]);
  assert.deepEqual([...c.hour], [3, 4]);
  assert.deepEqual([...c.month], [1, 2, 3]);
  assert.deepEqual([...c.dow], [1, 2, 3, 4, 5]);
  assert.ok(parseCron('0 0 * * 7').dow.has(0)); // 7 = Sunday too
  assert.ok(parseCron('@daily'));
  for (const [bad, why]of [['', /5 fields/], ['0 3 * *', /5 fields/], ['60 3 * * *', /minute: 60 is out of range/],
    ['0 25 * * *', /hour/], ['0 3 * * funday', /day of week/], ['0 3 5-1 * *', /backwards/], ['*/0 * * * *', /bad step/]]){
    assert.throws(() => parseCron(bad), why, bad);
  }
});

test('matching follows cron semantics, including day-of-month OR day-of-week', () => {
  assert.equal(cronMatches('30 3 * * *', at('2026-09-29T03:30:59Z'), UTC), true);
  assert.equal(cronMatches('30 3 * * *', at('2026-09-29T03:31:00Z'), UTC), false);
  // 2026-09-29 is a Tuesday; the 1st or any Tuesday matches.
  assert.equal(cronMatches('0 4 1 * tue', at('2026-09-29T04:00:00Z'), UTC), true);
  assert.equal(cronMatches('0 4 1 * mon', at('2026-09-29T04:00:00Z'), UTC), false);
});

test('next run: daily, weekly, in a time zone, across DST, and never for impossible dates', () => {
  assert.equal(next('30 3 * * *', '2026-09-29T03:30:00Z'), '2026-09-30T03:30:00.000Z');
  assert.equal(next('0 4 * * sun', '2026-09-29T12:00:00Z'), '2026-10-04T04:00:00.000Z');
  assert.equal(next('0 3 * * *', '2026-09-29T12:00:00Z', 'Europe/Kyiv'), '2026-09-30T00:00:00.000Z'); // 03:00 EEST
  // Kyiv leaves DST on 25 Oct 2026: 03:00 local is 00:00 UTC before, 01:00 UTC after.
  assert.equal(next('0 3 * * *', '2026-10-25T12:00:00Z', 'Europe/Kyiv'), '2026-10-26T01:00:00.000Z');
  assert.equal(next('0 0 31 2 *', '2026-01-01T00:00:00Z'), undefined);
  assert.equal(next('0 0 1 1 *', '2026-01-01T00:00:00Z'), '2027-01-01T00:00:00.000Z'); // a year out, still quick
});
