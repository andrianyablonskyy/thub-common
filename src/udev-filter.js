/**
 * @file        packages/shared/src/udev-filter.js
 * @description udev filter strings of an HW Client's devices (README §8.6): which device gets the
 *              /dev/thub/dut<N>-<kind> symlink. Checked strictly — the Client writes them into a root-owned udev rule.
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

// hw-devices list -> the kind in its symlink name (dut<N>-<kind>).
// storages: USB mass storage, e.g. an ST-Link's drag-and-drop flashing drive.
const LIST_KINDS = { stlinks: 'stlink', uarts: 'uart', usbs: 'usb', storages: 'storage' },

  // What an entry without its own ids matches: common adapters. UARTs match
  // the tty node (what serialport opens), not the raw USB device; ST-Links
  // and DUT USB devices match the USB device (st-flash talks libusb).
  KIND_DEFAULTS = {
    stlink: { subsystem: 'usb', vendorId: '0483', productId: '3748' }, // ST-Link/V2
    uart: { subsystem: 'tty', vendorId: '0403', productId: '6001' }, // FTDI FT232R
    usb: { subsystem: 'usb', vendorId: '0483', productId: '5740' }, // STM32 CDC (DUT's own USB)
    storage: { subsystem: 'block', vendorId: '0483', productId: '374b' } // ST-Link/V2-1 mass storage
  },

  MAX_LENGTH = 512,
  // Match keys only. Never assignments, and never the keys that run or
  // import something (PROGRAM, IMPORT, RUN) or change the rule's flow
  // (GOTO, LABEL): the rule is installed as root.
  KEY = /^(?:KERNELS?|SUBSYSTEMS?|DRIVERS?|DEVPATH|TAGS?|ACTION|(?:ATTRS?|ENV)\{[A-Za-z0-9_.-]{1,64}\})$/,
  // One `KEY=="value"` or `KEY!="value"`: a value without quotes,
  // backslashes, line breaks or `$` (udev substitutions).
  TERM = /^\s*([A-Z]+(?:\{[^}]*\})?)\s*(==|!=)\s*"([^"\\\r\n$]{0,128})"\s*$/,
  // The device node's access, so the Client's service user (in plugdev)
  // can open it — st-flash, uhubctl and the like talk libusb: MODE="0664",
  // GROUP="plugdev", OWNER="thub", TAG+="uaccess". Values are checked per key.
  ASSIGN_TERM = /^\s*(MODE|GROUP|OWNER|TAG)\s*(\+=|:=|=)\s*"([^"\\\r\n$]{0,64})"\s*$/,
  ASSIGN_VALUE = {
    MODE: { ops: ['=', ':='], value: /^0?[0-7]{3}$/, hint: 'an octal mode, e.g. 0664' },
    GROUP: { ops: ['=', ':='], value: /^[a-z_][a-z0-9_-]{0,31}$/, hint: 'a group name, e.g. plugdev' },
    OWNER: { ops: ['=', ':='], value: /^[a-z_][a-z0-9_-]{0,31}$/, hint: 'a user name' },
    TAG: { ops: ['+='], value: /^[A-Za-z0-9_-]{1,32}$/, hint: 'a tag name, e.g. uaccess' }
  },
  // The other assignment allowed: `SYMLINK+="path"`, the device's own path
  // under /dev instead of thub/dut<N>-<kind>.
  SYMLINK_TERM = /^\s*SYMLINK\s*\+=\s*"([^"\\\r\n$]*)"\s*$/,
  // Relative, inside /dev: path segments of [A-Za-z0-9._+-], none starting
  // with a dot (so no `.` or `..`), up to 128 characters.
  SYMLINK_PATH = /^[A-Za-z0-9_+-][A-Za-z0-9._+-]*(?:\/[A-Za-z0-9_+-][A-Za-z0-9._+-]*)*$/;

// { match, assign, symlink } of a filter (a full rule but for what it may
// not do): its matches, normalized (`KEY=="value", …`), its access
// assignments (`MODE="0664", GROUP="plugdev"`, '' without any) and its
// optional `SYMLINK+="path"` (null without one); or throws saying what's wrong. Commas inside values can't split terms: values can't hold
// quotes, so the string is split on the commas between quoted values.
function splitUdevFilter(filter){
  if (typeof filter !== 'string' || !filter.trim()){
    throw new Error('the udev filter is empty');
  }
  if (filter.length > MAX_LENGTH){
    throw new Error(`the udev filter is longer than ${MAX_LENGTH} characters`);
  }
  const terms = (filter.match(/[^,"]*"[^"]*"|[^,]+/g) || [])
    .map((t) => t.replace(/^\s*,?/, ''))
    .filter((t) => t.trim());
  if (!terms.length){
    throw new Error('the udev filter is empty');
  }
  let symlink = null;
  const matches = [],
    assigns = [],
    assigned = new Set();
  for (const term of terms){
    const link = SYMLINK_TERM.exec(term);
    if (link){
      if (symlink !== null){
        throw new Error('a udev filter has one SYMLINK+="…" at most');
      }
      if (link[1].length > 128 || !SYMLINK_PATH.test(link[1])){
        throw new Error(`SYMLINK+="${link[1]}" must be a path inside /dev: segments of [A-Za-z0-9._+-], none starting with a dot`);
      }
      symlink = link[1];
      continue;
    }
    const a = ASSIGN_TERM.exec(term);
    if (a){
      const [, key, op, value] = a,
        rule = ASSIGN_VALUE[key];
      if (!rule.ops.includes(op)){
        throw new Error(`${key} takes ${rule.ops.map((o) => `${o}"…"`).join(' or ')}, not ${op}`);
      }
      if (!rule.value.test(value)){
        throw new Error(`${key}${op}"${value}" isn't ${rule.hint}`);
      }
      if (key !== 'TAG' && assigned.has(key)){
        throw new Error(`a udev rule sets ${key} once at most`);
      }
      assigned.add(key);
      assigns.push(`${key}${op}"${value}"`);
      continue;
    }
    const m = TERM.exec(term);
    if (!m){
      throw new Error(`"${term.trim()}" isn't a udev match (KEY=="value" or KEY!="value", the value without quotes, \\ or $), ` +
        'nor an allowed assignment (MODE, GROUP, OWNER, TAG+=, one SYMLINK+="path")');
    }
    if (!KEY.test(m[1])){
      throw new Error(`${m[1]} can't be used in a udev filter: only SUBSYSTEM(S), KERNEL(S), DRIVER(S), DEVPATH, TAG(S), ACTION, ATTR{…}, ATTRS{…} and ENV{…}`);
    }
    matches.push(`${m[1]}${m[2]}"${m[3]}"`);
  }
  if (!matches.length){
    throw new Error('the udev filter has no match: its assignments alone would apply to every device');
  }
  return { match: matches.join(', '), assign: assigns.join(', '), symlink };
}

// The filter normalized: its matches, its access assignments, then its
// SYMLINK+="…" if it has one.
function parseUdevFilter(filter){
  const { match, assign, symlink } = splitUdevFilter(filter);
  return [match, assign, symlink === null ? '' : `SYMLINK+="${symlink}"`].filter(Boolean).join(', ');
}

// The symlink an entry's device gets, inside /dev: its filter's own
// SYMLINK+="…" (which overrides the default), else thub/dut<index>-<kind>;
// null when neither (an explicit path set by hand, a probe by serial).
function deviceSymlinkOf(entry, kind){
  if (entry?.udev){
    const { symlink } = splitUdevFilter(entry.udev);
    if (symlink !== null){
      return symlink;
    }
  }
  return Number.isInteger(entry?.index) ? `thub/dut${entry.index}-${kind}` : null;
}

// The udev filter of an hw-devices entry: its own `udev`, else one made from
// an older entry's devpath (and vendorId / productId / subsystem, or the
// kind's defaults), else '' (no rule: its path comes from elsewhere).
function udevFilterOf(entry, kind){
  if (entry?.udev){
    return entry.udev;
  }
  if (entry?.devpath === undefined || !KIND_DEFAULTS[kind]){
    return '';
  }
  const defaults = KIND_DEFAULTS[kind],
    subsystem = entry.subsystem ?? defaults.subsystem,
    // ATTR{devpath} for a usb device itself, ATTRS{devpath} (a parent) for a
    // tty or a disk (the whole disk only, not its partitions): ATTRS keys must all match on the same parent, and idVendor,
    // idProduct and devpath all live on the usb_device.
    devpathKey = subsystem === 'usb' ? 'ATTR{devpath}' : 'ATTRS{devpath}';
  return `SUBSYSTEM=="${subsystem}", ${subsystem === 'block' ? 'ENV{DEVTYPE}=="disk", ' : ''}` +
    `ATTRS{idVendor}=="${String(entry.vendorId ?? defaults.vendorId).toLowerCase()}", ` +
    `ATTRS{idProduct}=="${String(entry.productId ?? defaults.productId).toLowerCase()}", ${devpathKey}=="${entry.devpath}"`;
}

module.exports = { parseUdevFilter, splitUdevFilter, deviceSymlinkOf, udevFilterOf, LIST_KINDS, KIND_DEFAULTS };
