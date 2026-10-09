/**
 * @file        packages/shared/src/job-spec.schema.js
 * @description Ajv JSON schema for the job specification (README §4.3)
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

const { POWER_ACTIONS, MAX_RESET_DELAY_SEC } = require('./power');

// An environment variable name a job may set (`--env NAME=value`).
const ENV_NAME_PATTERN = '^[A-Za-z_][A-Za-z0-9_]*$',

  // Matches the job spec shape documented in README.md §4.3. A task is:
  // optionally files to download, and — always — the shell command that is
  // its entry point, run on the Client in the job's work directory. Anything
  // else it needs (a git checkout, a Docker container) the command does
  // itself, with credentials passed in `env`.
  jobSpecSchema = {
    $id: 'https://thub.example.com/schemas/job-spec.json',
    type: 'object',
    additionalProperties: false,
    required: ['target', 'command'],
    properties: {
      target: {
        type: 'object',
        additionalProperties: false,
        required: ['type'],
        properties: {
          type: { enum: ['hw', 'sw'] },
          labels: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
            default: []
          },
          // Constrains scheduling to resources that are members of this
          // group (§13.1): filled in by the Coordinator from the submitting
          // agent's group (set on the dashboard; an Agent's own is replaced) — a third targeting
          // dimension alongside type/labels. Omitted: any matching resource
          // in any (or no) group is eligible, same as before groups existed.
          group: { type: 'string', minLength: 1 },
          // Pins the job to one specific Client (`thub run --client <name|id>`):
          // it's queued for that resource alone and waits for it even if other
          // matching resources are idle. Accepts a resource name or id; the
          // Coordinator resolves it to the resource id at submission time, so
          // a later rename of the Client doesn't orphan the queued job.
          client: { type: 'string', minLength: 1 }
        }
      },
      // The task's entry point (`thub run --command`): a shell command the
      // Client runs with `sh -c`, `args` as "$@" (`--arg`, repeatable).
      command: { type: 'string', minLength: 1, maxLength: 4096 },
      args: { type: 'array', items: { type: 'string' }, default: [] },
      // Passed to the command as JOB_SUITE (`--suite`).
      suite: { type: 'string', default: 'default' },
      // Files the Client downloads into the task's work directory before
      // running the command (`--download-file`, repeatable).
      downloads: {
        type: 'array',
        maxItems: 32,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['url'],
          properties: { url: { type: 'string', format: 'uri' } }
        },
        default: []
      },
      // Environment variables (`--env NAME=value`) the Client sets for the
      // job's command — tokens for a git clone or docker login, say. No name
      // means anything special. Values are secrets as far as the Coordinator
      // is concerned: masked in the Agent API and dropped from its database
      // once the job ends.
      env: {
        type: 'object',
        maxProperties: 64,
        propertyNames: { pattern: ENV_NAME_PATTERN, maxLength: 128 },
        additionalProperties: { type: 'string', maxLength: 8192 }
      },
      timeoutSec: { type: 'integer', minimum: 1, default: 1800 },
      priority: { type: 'integer', minimum: 0, maximum: 100, default: 50 },
      // Set by the Coordinator from the agent token's kind; any value an
      // (older) Agent sends is accepted but overwritten.
      source: { enum: ['ci', 'cli'] },
      // Free-text job owner (`thub run --user <name>`, §7.1) — purely a
      // label shown on the Client and dashboard to tell whose job is whose,
      // not an identity: nothing authenticates or enforces it.
      user: { type: 'string', minLength: 1 },
      meta: { type: 'object' },
      // USB port power on the Client (uhubctl, README §8.7) at the job's
      // start (before the DUT is prepared) and end (whatever the verdict):
      // `--power-on-start` / `--power-on-end` on|off|reset, and the reset's
      // off time `--power-reset-delay` (seconds; 1 when not given). HW only.
      power: {
        type: 'object',
        additionalProperties: false,
        properties: {
          onStart: { enum: POWER_ACTIONS },
          onEnd: { enum: POWER_ACTIONS },
          resetDelaySec: { type: 'number', minimum: 0, maximum: MAX_RESET_DELAY_SEC }
        }
      },
      // Exercises the full pipeline (schedule, accept, state transitions,
      // logs, artifact, result) without flashing/running anything for real —
      // see README §7.1 "Dry-run the pipeline".
      dryRun: { type: 'boolean', default: false }
    }
  };

module.exports = { jobSpecSchema };
