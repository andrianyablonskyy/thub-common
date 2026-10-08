/**
 * @file        packages/shared/test/junit-frameworks.test.js
 * @description Tests: JUnit XML exactly as GoogleTest, CTest, pytest, Maven Surefire and Gradle write it (fixtures/junit,
 *              each from the same four tests: one passes, one fails, one is skipped or disabled, one errors)
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
  fs = require('node:fs'),
  path = require('node:path'),
  { parseJUnit, countsFromCases, renderSummary } = require('../src/report-markdown');

const fixture = (name) => parseJUnit(fs.readFileSync(path.join(__dirname, 'fixtures', 'junit', name), 'utf8'));

test('GoogleTest (--gtest_output=xml:results/): a DISABLED_ test is skipped, not passed; messages decoded', () => {
  const cases = fixture('googletest.xml');
  assert.deepEqual(countsFromCases(cases), { total: 4, passed: 1, failed: 1, skipped: 2 });
  assert.equal(cases.find((c) => c.name === 'DISABLED_Break').status, 'skipped');
  const flow = cases.find((c) => c.name === 'FlowControl');
  assert.equal(flow.classname, 'Uart');
  assert.match(flow.message, /uart_test\.cpp:3\nExpected equality/); // &#x0A; is a newline
});

test('CTest (--output-junit): disabled is skipped, and the name isn\'t shown twice', () => {
  const cases = fixture('ctest.xml');
  assert.deepEqual(countsFromCases(cases), { total: 4, passed: 1, failed: 1, skipped: 2 });
  const md = renderSummary({ id: 'A-1', state: 'FAILED', summary: countsFromCases(cases) }, { key: 'k', jobUrl: 'u' }, cases);
  assert.match(md, /\| ❌ \| Uart\.FlowControl \|/);
  assert.doesNotMatch(md, /Uart\.FlowControl\.Uart\.FlowControl/);
});

test('pytest (--junitxml): a fixture error is an error, a skip keeps its reason', () => {
  const cases = fixture('pytest.xml');
  assert.deepEqual(cases.map((c) => [c.name, c.status]),
    [['test_echo', 'passed'], ['test_flow', 'failed'], ['test_parity', 'skipped'], ['test_break', 'error']]);
  assert.equal(cases[2].message, 'no parity on this board');
});

test('JUnit 5 through Maven Surefire and Gradle', () => {
  assert.deepEqual(countsFromCases(fixture('maven-surefire.xml')), { total: 4, passed: 1, failed: 2, skipped: 1 });
  assert.deepEqual(countsFromCases(fixture('gradle.xml')), { total: 4, passed: 1, failed: 2, skipped: 1 });
  assert.equal(fixture('maven-surefire.xml').find((c) => c.name === 'breakSignal').status, 'error');
});
