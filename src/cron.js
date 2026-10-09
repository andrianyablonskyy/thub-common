/**
 * @file        packages/shared/src/cron.js
 * @description Minimal 5-field cron expressions (minute hour day-of-month month day-of-week) — parsing, matching
 *              and next-occurrence — for scheduled Client host reboots
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

// Standard crontab(5) semantics: `*`, lists (1,15), ranges (1-5), steps
// (*/15, 0-30/10), month and weekday names (jan, mon); weekday 0 and 7 are
// both Sunday; if both day fields are restricted, a day matching either one
// counts (like cron). No seconds, no @macros except the common ones below.
const FIELDS = [
    { name: 'minute', min: 0, max: 59 },
    { name: 'hour', min: 0, max: 23 },
    { name: 'day of month', min: 1, max: 31 },
    { name: 'month', min: 1, max: 12, names: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] },
    { name: 'day of week', min: 0, max: 7, names: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] }
  ],
  MACROS = {
    '@yearly': '0 0 1 1 *',
    '@annually': '0 0 1 1 *',
    '@monthly': '0 0 1 * *',
    '@weekly': '0 0 * * 0',
    '@daily': '0 0 * * *',
    '@midnight': '0 0 * * *',
    '@hourly': '0 * * * *'
  };

function parseValue(text, field){
  const lower = text.toLowerCase(),
    named = field.names ? field.names.indexOf(lower) : -1;
  if (named >= 0){
    return named + (field.name === 'month' ? 1 : 0);
  }
  if (!/^\d+$/.test(text)){
    throw new Error(`${field.name}: "${text}" isn't a number${field.names ? ' or a name' : ''}`);
  }
  const n = Number(text);
  if (n < field.min || n > field.max){
    throw new Error(`${field.name}: ${n} is out of range ${field.min}-${field.max}`);
  }
  return n;
}

function parseField(text, field){
  const values = new Set();
  for (const part of text.split(',')){
    const [range, stepText] = part.split('/'),
      step = stepText === undefined ? 1 : Number(stepText);
    if (stepText !== undefined && (!/^\d+$/.test(stepText) || step < 1)){
      throw new Error(`${field.name}: bad step "${stepText}"`);
    }
    let lo,
      hi;
    if (range === '*'){
      [lo, hi] = [field.min, field.max];
    }
    else if (range.includes('-')){
      const [a, b] = range.split('-');
      [lo, hi] = [parseValue(a, field), parseValue(b, field)];
      if (lo > hi){
        throw new Error(`${field.name}: range ${range} goes backwards`);
      }
    }
    else {
      lo = parseValue(range, field);
      hi = stepText === undefined ? lo : field.max; // "5/10" = from 5, every 10
    }
    for (let v = lo; v <= hi; v += step){
      values.add(v);
    }
  }
  return values;
}

// Parses "m h dom mon dow" (or @daily etc.). Throws with a readable reason.
function parseCron(expression){
  const text = String(expression ?? '').trim(),
    expanded = MACROS[text.toLowerCase()] || text,
    parts = expanded.split(/\s+/);
  if (parts.length !== 5){
    throw new Error(`expected 5 fields (minute hour day-of-month month day-of-week), got ${parts.length === 1 && !parts[0] ? 0 : parts.length}`);
  }
  const [minute, hour, dom, month, dow] = parts.map((p, i) => parseField(p, FIELDS[i]));
  if (dow.has(7)){
    dow.add(0);
  }
  return {
    expression: text,
    minute,
    hour,
    dom,
    month,
    dow,
    domRestricted: parts[2] !== '*',
    dowRestricted: parts[4] !== '*'
  };
}

// Wall-clock fields of `date` in `timeZone` (omitted: this process's zone).
function wallClock(date, timeZone){
  if (!timeZone){
    return { minute: date.getMinutes(), hour: date.getHours(), dom: date.getDate(), month: date.getMonth() + 1, dow: date.getDay() };
  }
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', minute: 'numeric', hour: 'numeric', day: 'numeric', month: 'numeric', weekday: 'short'
  }).formatToParts(date).map(({ type, value }) => [type, value]));
  return {
    minute: Number(p.minute),
    hour: Number(p.hour),
    dom: Number(p.day),
    month: Number(p.month),
    dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday)
  };
}

function dayMatches(c, t){
  const dayOk = c.domRestricted && c.dowRestricted ? c.dom.has(t.dom) || c.dow.has(t.dow) : c.dom.has(t.dom) && c.dow.has(t.dow);
  return dayOk && c.month.has(t.month);
}

// Does the minute containing `date` match? `cron`: a parseCron result or text.
function cronMatches(cron, date, { timeZone } = {}){
  const c = typeof cron === 'string' ? parseCron(cron) : cron,
    t = wallClock(date, timeZone);
  return c.minute.has(t.minute) && c.hour.has(t.hour) && dayMatches(c, t);
}

// The next matching minute strictly after `from`, or null if none within
// `withinDays` (an impossible date like 31 feb never matches). Skips a whole
// hour whenever its day or hour can't match — hour steps rather than jumps to
// midnight, so a 23- or 25-hour DST day can't make it skip past a match.
function nextCronRun(cron, from = new Date(), { timeZone, withinDays = 366 } = {}){
  const c = typeof cron === 'string' ? parseCron(cron) : cron,
    end = from.getTime() + withinDays * 86400000;
  let t = Math.floor(from.getTime() / 60000) * 60000 + 60000;
  while (t < end){
    const w = wallClock(new Date(t), timeZone);
    if (!dayMatches(c, w) || !c.hour.has(w.hour)){
      t += (60 - w.minute) * 60000; // to the next hour
    }
    else if (!c.minute.has(w.minute)){
      t += 60000;
    }
    else {
      return new Date(t);
    }
  }
  return null;
}

module.exports = { parseCron, cronMatches, nextCronRun };
