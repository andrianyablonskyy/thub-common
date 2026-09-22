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

// Matches the job spec shape documented in README.md §4.3.
// Deliberately has no field for shell commands: the Client only ever
// runs the fixed entry point from the downloaded test package.
const jobSpecSchema = {
  $id: 'https://thub.example.com/schemas/job-spec.json',
  type: 'object',
  additionalProperties: false,
  required: ['target', 'firmware', 'tests'],
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
          default: [],
        },
        // Constrains scheduling to resources that are members of this
        // group (§13.1, `thub run --group <id>`) — a third targeting
        // dimension alongside type/labels. Omitted: any matching resource
        // in any (or no) group is eligible, same as before groups existed.
        group: { type: 'string', minLength: 1 },
      },
    },
    firmware: {
      type: 'object',
      additionalProperties: false,
      required: ['url'],
      properties: {
        url: { type: 'string', format: 'uri' },
        sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
        flashAddress: { type: 'string' },
      },
    },
    tests: {
      type: 'object',
      additionalProperties: false,
      required: ['url'],
      properties: {
        url: { type: 'string', format: 'uri' },
        suite: { type: 'string', default: 'default' },
        args: { type: 'array', items: { type: 'string' }, default: [] },
      },
    },
    timeoutSec: { type: 'integer', minimum: 1, default: 1800 },
    priority: { type: 'integer', minimum: 0, maximum: 100, default: 50 },
    source: { enum: ['ci', 'cli'] },
    meta: { type: 'object' },
    // Exercises the full pipeline (schedule, accept, state transitions,
    // logs, artifact, result) without flashing/running anything for real —
    // see README §7.1 "Dry-run the pipeline".
    dryRun: { type: 'boolean', default: false },
  },
};

module.exports = { jobSpecSchema };
