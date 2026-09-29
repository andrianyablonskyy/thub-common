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

// A Docker image reference: [host[:port]/]path[:tag][@sha256:digest], e.g.
// `alpine`, `alpine:3.20`, `library/ubuntu:24.04`, `registry.lab:5000/emu:1`.
const DOCKER_IMAGE_PATTERN =
    '^[A-Za-z0-9][A-Za-z0-9.-]*(:[0-9]+)?(/[a-z0-9]+((\\.|_|__|-+)[a-z0-9]+)*)*(:[A-Za-z0-9_][A-Za-z0-9_.-]{0,127})?(@sha256:[a-f0-9]{64})?$',

  // A git ref to check out — a branch, a tag or a commit (hex) — as git
  // allows them: no leading "-" (never taken for an option) or "/", no "..",
  // no spaces or the characters git forbids, not ending in "/", ".lock", ".".
  GIT_REF_PATTERN = '^(?![-/])(?!.*\\.\\.)(?!.*//)(?!.*(/|\\.lock|\\.)$)[A-Za-z0-9._/+@-]+$',

  // Matches the job spec shape documented in README.md §4.3. A task is:
  // optionally files to download and/or a git checkout, optionally (SW only)
  // a Docker image to run as the DUT, and — always — the shell command that
  // is its entry point, run on the Client in the checkout / work directory.
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
          // group (§13.1, `thub run --group <id>`) — a third targeting
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
      // Passed to the command as THUB_SUITE (`--suite`).
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
      // A Docker image an SW Client runs as the DUT instead of its own
      // sw.image, if it allows that (sw.allowJobImages) — `--docker-image`.
      image: { type: 'string', maxLength: 255, pattern: DOCKER_IMAGE_PATTERN },
      // A repository the Client clones before running the command — at `ref`
      // (branch, tag or commit; default: the default branch), `depth` commits
      // deep (0 = full history). `--git-repo <url> [ref] [--depth <n>]`.
      git: {
        type: 'object',
        additionalProperties: false,
        required: ['url'],
        properties: {
          url: { type: 'string', minLength: 1, maxLength: 2048 },
          ref: { type: 'string', maxLength: 255, pattern: GIT_REF_PATTERN },
          depth: { type: 'integer', minimum: 0, maximum: 100000, default: 1 },
          // Extra git options (`--git-options`), shell-quoted, inserted
          // between `git` and its subcommand on the Client — e.g.
          // -c core.sshCommand="ssh -i ~/.ssh/lab_key -p 2222". Stored with
          // the job and visible like the rest of it: reference key files on
          // the Client rather than putting secrets here.
          options: { type: 'string', minLength: 1, maxLength: 1024 }
        }
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
      // Exercises the full pipeline (schedule, accept, state transitions,
      // logs, artifact, result) without flashing/running anything for real —
      // see README §7.1 "Dry-run the pipeline".
      dryRun: { type: 'boolean', default: false }
    }
  };

module.exports = { jobSpecSchema, DOCKER_IMAGE_PATTERN };
