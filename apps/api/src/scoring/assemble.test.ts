import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assembleModule, check } from './assemble.js';

const passing = (id: string, points: number, maxPoints: number) =>
  check({
    id,
    moduleId: 'citations',
    label: id,
    status: points === maxPoints ? 'pass' : 'warn',
    points,
    maxPoints,
    detail: 'detail',
  });

const unavailable = (id: string, maxPoints: number) =>
  check({
    id,
    moduleId: 'citations',
    label: id,
    status: 'unavailable',
    points: maxPoints, // deliberately wrong: assemble must zero this out
    maxPoints,
    detail: 'could not verify',
    unavailableReason: 'the directory blocked us',
  });

test('points are rescaled onto the module weight', () => {
  // 10 of 20 available check points earned -> half of the module's 20 points.
  const result = assembleModule('citations', [passing('a', 5, 10), passing('b', 5, 10)]);

  assert.equal(result.percent, 50);
  assert.equal(result.points, 10);
  assert.equal(result.maxPoints, 20);
  assert.equal(result.indicator, 'yellow');
});

test('unavailable checks leave the denominator and carry no points', () => {
  const result = assembleModule('citations', [
    passing('a', 10, 10),
    unavailable('b', 10),
  ]);

  // The one verifiable check passed, so the module scores full weight.
  assert.equal(result.percent, 100);
  assert.equal(result.points, 20);
  assert.equal(result.checks[1]!.points, 0);
  assert.match(result.statusLine, /1 could not be verified/);
});

test('a module with nothing verifiable is reported as unscored', () => {
  const result = assembleModule('citations', [unavailable('a', 10), unavailable('b', 10)]);

  assert.equal(result.points, 0);
  assert.equal(result.percent, 0);
  assert.match(result.unavailableReason ?? '', /None of these checks could be verified/);
});

test('a module with no checks at all keeps a caller-supplied reason', () => {
  const result = assembleModule('citations', [], { unavailableReason: 'no API key configured' });

  assert.equal(result.points, 0);
  assert.equal(result.unavailableReason, 'no API key configured');
});
