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
  TERM = /^\s*([A-Z]+(?:\{[^}]*\})?)\s*(==|!=)\s*"([^"\\\r\n$]{0,128})"\s*$/;

// The filter, normalized (`KEY=="value", …`), or throws saying what's wrong.
// Commas inside values can't split terms: values can't hold quotes, so the
// string is split on the commas between quoted values.
function parseUdevFilter(filter){
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
  return terms.map((term) => {
    const m = TERM.exec(term);
    if (!m){
      throw new Error(`"${term.trim()}" isn't a udev match (KEY=="value" or KEY!="value", the value without quotes, \\ or $)`);
    }
    if (!KEY.test(m[1])){
      throw new Error(`${m[1]} can't be used in a udev filter: only SUBSYSTEM(S), KERNEL(S), DRIVER(S), DEVPATH, TAG(S), ACTION, ATTR{…}, ATTRS{…} and ENV{…}`);
    }
    return `${m[1]}${m[2]}"${m[3]}"`;
  }).join(', ');
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

module.exports = { parseUdevFilter, udevFilterOf, LIST_KINDS, KIND_DEFAULTS };
