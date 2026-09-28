/**
 * @file        packages/shared/test/datetime.test.js
 * @description Tests: the shared dd/mm/yyyy HH:MM:SS (24-hour) date/time format
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
  { formatDateTime } = require('../src/datetime');

test('formats as dd/mm/yyyy HH:MM:SS with a 24-hour clock', () => {
  assert.equal(formatDateTime('2026-09-28T14:05:03.123Z', { timeZone: 'UTC' }), '28/09/2026 14:05:03');
  assert.equal(formatDateTime('2026-01-02T03:04:05Z', { timeZone: 'UTC' }), '02/01/2026 03:04:05');
});

test('midnight is 00, never 24', () => {
  assert.equal(formatDateTime('2026-09-28T00:00:07Z', { timeZone: 'UTC' }), '28/09/2026 00:00:07');
});

test('converts into the given time zone, date included', () => {
  assert.equal(formatDateTime('2026-09-28T22:30:00Z', { timeZone: 'Europe/Kyiv' }), '29/09/2026 01:30:00');
  assert.equal(formatDateTime('2026-09-28T02:00:00Z', { timeZone: 'America/New_York' }), '27/09/2026 22:00:00');
});

test('accepts Date and epoch ms; empty or invalid input gives the fallback', () => {
  const at = Date.UTC(2026, 8, 28, 14, 5, 3);
  assert.equal(formatDateTime(new Date(at), { timeZone: 'UTC' }), '28/09/2026 14:05:03');
  assert.equal(formatDateTime(at, { timeZone: 'UTC' }), '28/09/2026 14:05:03');
  assert.equal(formatDateTime(null), '—');
  assert.equal(formatDateTime('', { fallback: 'never' }), 'never');
  assert.equal(formatDateTime('not a date'), '—');
});
