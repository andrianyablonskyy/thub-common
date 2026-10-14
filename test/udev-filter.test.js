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

test('a full rule: access assignments (MODE, GROUP, OWNER, TAG+=) kept, after the matches and before SYMLINK', () => {
  assert.equal(
    parseUdevFilter('SYMLINK+="lab/f103-stlink", MODE = "0664", SUBSYSTEM=="usb", GROUP="plugdev", TAG+="uaccess", ATTRS{idProduct}=="3748"'),
    'SUBSYSTEM=="usb", ATTRS{idProduct}=="3748", MODE="0664", GROUP="plugdev", TAG+="uaccess", SYMLINK+="lab/f103-stlink"'
  );
  assert.equal(parseUdevFilter('SUBSYSTEM=="usb", OWNER:="thub", MODE:="660"'), 'SUBSYSTEM=="usb", OWNER:="thub", MODE:="660"');
});

test('anything that could do more than match is refused: the rule is installed as root', () => {
  for (const [filter, reason]of [
    ['SUBSYSTEM=="usb", RUN+="/bin/sh -c id"', /isn't a udev match/],
    ['SUBSYSTEM=="usb" RUN+="/bin/sh"', /isn't a udev match/],
    ['PROGRAM=="/bin/true"', /PROGRAM can't be used/],
    ['IMPORT{program}=="x"', /IMPORT\{program\} can't be used/],
    ['SUBSYSTEM="usb"', /isn't a udev match/],
    ['SYMLINK+="evil"', /no match: its assignments alone would apply to every device/],
    ['MODE="0666"', /no match: its assignments alone/],
    ['SUBSYSTEM=="usb", MODE="rw"', /MODE="rw" isn't an octal mode/],
    ['SUBSYSTEM=="usb", MODE+="0664"', /MODE takes ="…" or :="…", not \+=/],
    ['SUBSYSTEM=="usb", GROUP="plug dev"', /isn't a group name/],
    ['SUBSYSTEM=="usb", GROUP="$env{G}"', /isn't a udev match/],
    ['SUBSYSTEM=="usb", GROUP="a", GROUP="b"', /sets GROUP once at most/],
    ['SUBSYSTEM=="usb", TAG="uaccess"', /TAG takes \+="…"/],
    ['SUBSYSTEM=="usb", NAME="x"', /isn't a udev match/],
    ['SUBSYSTEM=="usb", ENV{X}="1"', /isn't a udev match/],
    ['SUBSYSTEM=="tty", SYMLINK="evil"', /isn't a udev match/],
    ['SUBSYSTEM=="tty", SYMLINK+="../sda"', /must be a path inside \/dev/],
    ['SUBSYSTEM=="tty", SYMLINK+="/etc/passwd"', /must be a path inside \/dev/],
    ['SUBSYSTEM=="tty", SYMLINK+="lab/.hidden"', /must be a path inside \/dev/],
    ['SUBSYSTEM=="tty", SYMLINK+="a b"', /must be a path inside \/dev/],
    ['SUBSYSTEM=="tty", SYMLINK+="a", SYMLINK+="b"', /one SYMLINK\+="…" at most/],
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

test('an optional SYMLINK+="path" names the device itself, instead of thub/dut<N>-<kind>', () => {
  const { splitUdevFilter, deviceSymlinkOf } = require('../src');
  assert.deepEqual(splitUdevFilter('SYMLINK += "lab/nucleo-f401re-uart" , SUBSYSTEM=="tty", ATTRS{serial}=="A9"'),
    { match: 'SUBSYSTEM=="tty", ATTRS{serial}=="A9"', assign: '', symlink: 'lab/nucleo-f401re-uart' });
  assert.equal(parseUdevFilter('SYMLINK+="ttyNucleo", KERNEL=="ttyACM*"'), 'KERNEL=="ttyACM*", SYMLINK+="ttyNucleo"');
  assert.equal(deviceSymlinkOf({ index: 2, udev: 'KERNEL=="ttyACM*", SYMLINK+="ttyNucleo"' }, 'uart'), 'ttyNucleo');
  assert.equal(deviceSymlinkOf({ index: 2, udev: 'KERNEL=="ttyACM*"' }, 'uart'), 'thub/dut2-uart');
  assert.equal(deviceSymlinkOf({ path: '/dev/ttyUSB0' }, 'uart'), null);

  // Two entries can't claim the same /dev path — a SYMLINK of its own or another's default.
  assert.match(validateClientConfig('hw', {
    uarts: [{ index: 1, udev: 'KERNEL=="ttyACM0", SYMLINK+="lab/console"' }, { index: 2, udev: 'KERNEL=="ttyACM1", SYMLINK+="lab/console"' }]
  }).errors.join(), /hw-devices\.uarts\.1\.udev: \/dev\/lab\/console is already hw-devices\.uarts\.0's/);
  assert.match(validateClientConfig('hw', {
    uarts: [{ index: 1, udev: 'KERNEL=="ttyACM0"' }, { index: 2, udev: 'KERNEL=="ttyACM1", SYMLINK+="thub/dut1-uart"' }]
  }).errors.join(), /\/dev\/thub\/dut1-uart is already hw-devices\.uarts\.0's/);
});
