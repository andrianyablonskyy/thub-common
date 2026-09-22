/**
 * @file        packages/shared/src/states.js
 * @description Resource and job state enums, and CLI exit codes
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

// §4.1 Resource (Client) states
const RESOURCE_STATES = Object.freeze({
    REGISTERED: 'REGISTERED',
    IDLE: 'IDLE',
    BUSY: 'BUSY',
    OUT_OF_SERVICE: 'OUT_OF_SERVICE',
    MAINTENANCE: 'MAINTENANCE'
  }),

  SCHEDULABLE_RESOURCE_STATES = new Set([RESOURCE_STATES.IDLE]),

  BUSY_SOURCES = Object.freeze({
    CI: 'ci',
    CLI: 'cli',
    LOCAL: 'local'
  }),

  // §4.2 Job states
  JOB_STATES = Object.freeze({
    QUEUED: 'QUEUED',
    ASSIGNED: 'ASSIGNED',
    PREPARING: 'PREPARING',
    RUNNING: 'RUNNING',
    PASSED: 'PASSED',
    FAILED: 'FAILED',
    ERROR: 'ERROR',
    TIMEOUT: 'TIMEOUT',
    CANCELED: 'CANCELED',
    LOST: 'LOST'
  }),

  TERMINAL_JOB_STATES = new Set([
    JOB_STATES.PASSED,
    JOB_STATES.FAILED,
    JOB_STATES.ERROR,
    JOB_STATES.TIMEOUT,
    JOB_STATES.CANCELED,
    JOB_STATES.LOST
  ]),

  ACTIVE_JOB_STATES = new Set([
    JOB_STATES.QUEUED,
    JOB_STATES.ASSIGNED,
    JOB_STATES.PREPARING,
    JOB_STATES.RUNNING
  ]),

  JOB_SOURCES = Object.freeze({
    CI: 'ci',
    CLI: 'cli'
  }),

  // §7 Agent CLI exit codes
  EXIT_CODES = Object.freeze({
    PASSED: 0,
    FAILED: 1,
    INFRA: 2, // ERROR, TIMEOUT, LOST
    CANCELED: 3,
    USAGE: 4,
    DETACHED: 130
  });

function exitCodeForJobState(state){
  switch (state){
  case JOB_STATES.PASSED:
    return EXIT_CODES.PASSED;
  case JOB_STATES.FAILED:
    return EXIT_CODES.FAILED;
  case JOB_STATES.ERROR:
  case JOB_STATES.TIMEOUT:
  case JOB_STATES.LOST:
    return EXIT_CODES.INFRA;
  case JOB_STATES.CANCELED:
    return EXIT_CODES.CANCELED;
  default:
    return EXIT_CODES.USAGE;
  }
}

module.exports = {
  RESOURCE_STATES,
  SCHEDULABLE_RESOURCE_STATES,
  BUSY_SOURCES,
  JOB_STATES,
  TERMINAL_JOB_STATES,
  ACTIVE_JOB_STATES,
  JOB_SOURCES,
  EXIT_CODES,
  exitCodeForJobState
};
