/**
 * @file        packages/shared/test/udev-filter.test.js
 * @description Tests: udev filter strings of hw-devices entries — normalized, refused when they could do more
 *              than match a device, and made from older entries' devpath / ids
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
  { parseUdevFilter, udevFilterOf, validateClientConfig } = require('../src');

test('a filter: KEY=="value" / KEY!="value" matches, normalized; commas inside values stay', () => {
  assert.equal(
    parseUdevFilter('SUBSYSTEM == "tty" ,ATTRS{idVendor}=="0403",  ATTRS{serial}!="A,B*"'),
    'SUBSYSTEM=="tty", ATTRS{idVendor}=="0403", ATTRS{serial}!="A,B*"'
  );
  assert.equal(parseUdevFilter('KERNEL=="ttyACM[0-9]*", ENV{ID_SERIAL_SHORT}=="0670FF"'), 'KERNEL=="ttyACM[0-9]*", ENV{ID_SERIAL_SHORT}=="0670FF"');
});

test('anything that could do more than match is refused: the rule is installed as root', () => {
  for (const [filter, reason]of [
    ['SUBSYSTEM=="usb", RUN+="/bin/sh -c id"', /isn't a udev match/],
    ['SUBSYSTEM=="usb" RUN+="/bin/sh"', /isn't a udev match/],
    ['PROGRAM=="/bin/true"', /PROGRAM can't be used/],
    ['IMPORT{program}=="x"', /IMPORT\{program\} can't be used/],
    ['SUBSYSTEM="usb"', /isn't a udev match/],
    ['SYMLINK+="evil"', /isn't a udev match/],
    ['GOTO=="end"', /GOTO can't be used/],
    ['ATTRS{serial}=="a\\"b"', /isn't a udev match/],
    ['ATTRS{serial}=="$env{HOME}"', /isn't a udev match/],
    ['SUBSYSTEM=="usb"\nRUN+="/bin/sh"', /isn't a udev match/],
    ['', /empty/],
    [', ,', /empty/],
    ['A'.repeat(600), /longer than 512/]
  ]){
    assert.throws(() => parseUdevFilter(filter), reason, filter);
  }
});

test('an older entry\'s devpath and ids become the same filter its rule had', () => {
  assert.equal(udevFilterOf({ index: 1, devpath: '3.3.3.2' }, 'uart'),
    'SUBSYSTEM=="tty", ATTRS{idVendor}=="0403", ATTRS{idProduct}=="6001", ATTRS{devpath}=="3.3.3.2"');
  assert.equal(udevFilterOf({ index: 2, devpath: '1.4', vendorId: '1A86', productId: '7523' }, 'usb'),
    'SUBSYSTEM=="usb", ATTRS{idVendor}=="1a86", ATTRS{idProduct}=="7523", ATTR{devpath}=="1.4"');
  assert.equal(udevFilterOf({ index: 1, udev: 'KERNEL=="ttyACM0"', devpath: '9' }, 'uart'), 'KERNEL=="ttyACM0"');
  assert.equal(udevFilterOf({ index: 1 }, 'uart'), '');
});

test('hw-devices: a udev filter needs an index, and is checked like parseUdevFilter', () => {
  assert.deepEqual(validateClientConfig('hw', { uarts: [{ index: 1, udev: 'SUBSYSTEM=="tty"', baudRate: 9600 }] }), { valid: true, errors: [] });
  assert.match(validateClientConfig('hw', { usbs: [{ path: '/dev/ttyX', udev: 'SUBSYSTEM=="usb"' }] }).errors.join(),
    /must have property index when property udev is present/);
  assert.match(validateClientConfig('hw', { stlinks: [{ index: 1, udev: 'SUBSYSTEM=="usb", RUN+="/x"' }] }).errors.join(),
    /hw-devices\.stlinks\.0\.udev: .*isn't a udev match/);
});

test('storages: a mass storage entry\'s filter matches the whole disk, not its partitions', () => {
  assert.equal(udevFilterOf({ index: 1, devpath: '1.3', productId: '374e' }, 'storage'),
    'SUBSYSTEM=="block", ENV{DEVTYPE}=="disk", ATTRS{idVendor}=="0483", ATTRS{idProduct}=="374e", ATTRS{devpath}=="1.3"');
  assert.deepEqual(validateClientConfig('hw', { storages: [{ index: 1, udev: 'SUBSYSTEM=="block", ENV{DEVTYPE}=="disk", ATTRS{devpath}=="1.3"' }] }),
    { valid: true, errors: [] });
});
