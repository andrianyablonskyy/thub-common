/**
 * @file        packages/shared/src/power.js
 * @description USB port power (uhubctl on the Client): the actions, the reset delay and the checks on a power
 *              request — shared by the Agent, the Coordinator and the Client (README §8.7)
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

// `reset`: off, wait the reset delay, on.
const POWER_ACTIONS = Object.freeze(['on', 'off', 'reset']),
  DEFAULT_RESET_DELAY_SEC = 1,
  MAX_RESET_DELAY_SEC = 60,
  // A Client's hw-devices.usbPower.ports holds at most this many.
  MAX_POWER_PORTS = 8;

// Errors (strings) for a request to switch a Client's ports: `action` one of
// POWER_ACTIONS, `delaySec` (reset only, optional) 0..MAX_RESET_DELAY_SEC,
// `port` (optional) a 1-based position in the Client's usbPower.ports.
function powerRequestErrors({ action, delaySec, port } = {}){
  const errors = [];
  if (!POWER_ACTIONS.includes(action)){
    errors.push(`action must be one of ${POWER_ACTIONS.join(', ')}`);
  }
  if (delaySec !== undefined && delaySec !== null){
    if (typeof delaySec !== 'number' || !Number.isFinite(delaySec) || delaySec < 0 || delaySec > MAX_RESET_DELAY_SEC){
      errors.push(`the reset delay (delaySec) must be a number of seconds, 0-${MAX_RESET_DELAY_SEC}`);
    }
    else if (action !== 'reset'){
      errors.push('the reset delay (delaySec) applies to reset only');
    }
  }
  if (port !== undefined && port !== null && (!Number.isInteger(port) || port < 1 || port > MAX_POWER_PORTS)){
    errors.push(`port must be a usbPower port number, 1-${MAX_POWER_PORTS}`);
  }
  return errors;
}

module.exports = { POWER_ACTIONS, DEFAULT_RESET_DELAY_SEC, MAX_RESET_DELAY_SEC, MAX_POWER_PORTS, powerRequestErrors };
