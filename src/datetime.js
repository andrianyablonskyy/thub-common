/**
 * @file        packages/shared/src/datetime.js
 * @description The one human-readable date/time format used everywhere: dd/mm/yyyy HH:MM:SS, 24-hour
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

// One formatter per time zone — building an Intl.DateTimeFormat is the
// expensive part, and a dashboard page formats many timestamps.
const formatters = new Map();

function formatterFor(timeZone){
  const key = timeZone || '';
  if (!formatters.has(key)){
    formatters.set(key, new Intl.DateTimeFormat('en-GB', {
      ...(timeZone ? { timeZone } : {}),
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23' // 00-23, never "24:00:00" at midnight
    }));
  }
  return formatters.get(key);
}

// "28/09/2026 14:05:03" for a Date, ISO string or epoch ms, in `timeZone`
// (IANA name; omitted = this process's local zone). Built from parts, so
// the result doesn't depend on the ICU version's punctuation. `fallback`
// for an empty or unparseable value.
function formatDateTime(value, { timeZone, fallback = '—' } = {}){
  if (value === null || value === undefined || value === ''){
    return fallback;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())){
    return fallback;
  }
  const p = Object.fromEntries(formatterFor(timeZone).formatToParts(date).map(({ type, value: v }) => [type, v]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
}

module.exports = { formatDateTime };
