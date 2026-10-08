/**
 * @file        packages/shared/test/report-markdown.test.js
 * @description Tests: the job report's Markdown per code host (GitHub, GitLab, Bitbucket), and status names
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
  { renderComment, commentMarker, statusFor, countsFromCases } = require('../src/report-markdown');

const job = { id: 'A-1', state: 'FAILED', exit_code: 1, duration_sec: 5, summary: { total: 1, passed: 0, failed: 1, skipped: 0 } },
  cases = [{ name: 't', classname: 'c', status: 'failed', message: 'x', time: 1 }];

test('GitHub and GitLab get HTML (details, an HTML-comment marker); Bitbucket none', () => {
  for (const flavor of ['github', 'gitlab']){
    const md = renderComment(job, { key: 'k', jobUrl: 'u', flavor }, cases);
    assert.ok(md.startsWith('<!-- thub-report:k -->\n') && md.includes('<details open>') && md.includes('<sub>'), flavor);
  }
  const bb = renderComment(job, { key: 'k (1)', jobUrl: 'u', flavor: 'bitbucket' }, cases);
  assert.ok(bb.startsWith('[//]: # (thub-report:k 1)\n'));
  assert.doesNotMatch(bb, /<[a-z!]/);
  assert.match(bb, /\*\*Failed tests \(1\)\*\*/);
  assert.equal(commentMarker('k (1)', 'bitbucket'), '[//]: # (thub-report:k 1)');
});

test('status names per platform, active jobs pending', () => {
  assert.deepEqual(['github', 'gitlab', 'bitbucket'].map((p) => statusFor('PASSED', p)), ['success', 'success', 'SUCCESSFUL']);
  assert.deepEqual(['github', 'gitlab', 'bitbucket'].map((p) => statusFor('FAILED', p)), ['failure', 'failed', 'FAILED']);
  assert.deepEqual(['github', 'gitlab', 'bitbucket'].map((p) => statusFor('CANCELED', p)), ['error', 'canceled', 'STOPPED']);
  assert.deepEqual(['github', 'gitlab', 'bitbucket'].map((p) => statusFor('RUNNING', p)), ['pending', 'running', 'INPROGRESS']);
  assert.deepEqual(countsFromCases([...cases, { status: 'passed' }, { status: 'skipped' }, { status: 'error' }]),
    { total: 4, passed: 1, failed: 2, skipped: 1 });
});
