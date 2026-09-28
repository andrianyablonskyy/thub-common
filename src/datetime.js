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

// Minutes `timeZone` is ahead of UTC at `date` (e.g. 180 for Kyiv in summer).
function zoneOffsetMinutes(date, timeZone){
  const p = Object.fromEntries(formatterFor(timeZone).formatToParts(date).map(({ type, value }) => [type, value])),
    asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

// The inverse of formatDateTime: "28/09/2026 14:05[:03]" read as wall-clock
// time in `timeZone` (omitted = this process's local zone). Returns a Date,
// or null if the text isn't a valid date/time in that format.
function parseDateTime(text, { timeZone } = {}){
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*$/.exec(String(text ?? ''));
  if (!m){
    return null;
  }
  const [day, month, year, hour = 0, minute = 0, second = 0] = [m[1], m[2], m[3], m[4], m[5], m[6]].map((v) => (v === undefined ? undefined : Number(v))),
    wall = Date.UTC(year, month - 1, day, hour, minute, second),
    check = new Date(wall);
  // Reject 31/02, 25:00 and the like rather than letting Date roll them over.
  if (check.getUTCDate() !== day || check.getUTCMonth() !== month - 1 || check.getUTCHours() !== hour || minute > 59 || second > 59){
    return null;
  }
  if (!timeZone){
    return new Date(year, month - 1, day, hour, minute, second);
  }
  // Wall time -> instant: subtract the zone's offset, then re-check it at
  // the result (the offset can differ across a DST change).
  let at = wall - zoneOffsetMinutes(new Date(wall), timeZone) * 60000;
  at = wall - zoneOffsetMinutes(new Date(at), timeZone) * 60000;
  return new Date(at);
}

module.exports = { formatDateTime, parseDateTime };
