import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MODULE_BY_ID, type CheckResult, type ModuleId, type ModuleResult } from '@sensi/shared';

import { assembleModule, check } from './assemble.js';
import { assembleTotal, sortModules } from './total.js';

function checks(moduleId: ModuleId, spec: Array<[CheckResult['status'], number, number]>): CheckResult[] {
  return spec.map(([status, points, maxPoints], index) =>
    check({
      id: `${moduleId}.check_${index}`,
      moduleId,
      label: `Check ${index}`,
      status,
      points,
      maxPoints,
      detail: 'detail',
      ...(status === 'unavailable' ? { unavailableReason: 'A directory blocked us.' } : {}),
    }),
  );
}

/** A module that scored `percent` of everything it could check. */
function scored(moduleId: ModuleId, percent: number): ModuleResult {
  const max = MODULE_BY_ID[moduleId].maxPoints;
  return assembleModule(moduleId, checks(moduleId, [['pass', (max * percent) / 100, max]]));
}

function unscorable(moduleId: ModuleId): ModuleResult {
  const max = MODULE_BY_ID[moduleId].maxPoints;
  return assembleModule(moduleId, checks(moduleId, [['unavailable', 0, max]]));
}

test('a perfect audit scores 100 and lands in the strong band', () => {
  const total = assembleTotal([
    scored('gbp', 100),
    scored('citations', 100),
    scored('onpage', 100),
    scored('reviews', 100),
    scored('geo', 100),
  ]);

  assert.equal(total.totalScore, 100);
  assert.equal(total.maxScore, 100);
  assert.equal(total.band, 'strong');
  assert.deepEqual(total.modulesNotScored, []);
});

test('a module nothing could be verified in leaves the denominator instead of scoring zero', () => {
  // The community is perfect on everything we could see. With no search key, the
  // citation module cannot run at all — and must not cap them at 80.
  const total = assembleTotal([
    scored('gbp', 100),
    unscorable('citations'),
    scored('onpage', 100),
    scored('reviews', 100),
    scored('geo', 100),
  ]);

  assert.equal(total.totalScore, 100);
  assert.deepEqual(total.modulesNotScored, ['citations']);
  assert.equal(total.band, 'strong');
});

test('the unscored module is reported so the score can be qualified', () => {
  const total = assembleTotal([
    scored('gbp', 50),
    unscorable('citations'),
    scored('onpage', 50),
    scored('reviews', 50),
    scored('geo', 50),
  ]);

  assert.equal(total.totalScore, 50);
  assert.deepEqual(total.modulesNotScored, ['citations']);
  assert.equal(total.unavailableChecks.length, 1);
  assert.equal(total.unavailableChecks[0]!.reason, 'A directory blocked us.');
});

test('weights are respected: the same percentage in a heavier module moves the score more', () => {
  const gbpOnly = assembleTotal([
    scored('gbp', 100),
    scored('citations', 0),
    scored('onpage', 0),
    scored('reviews', 0),
    scored('geo', 0),
  ]);
  const reviewsOnly = assembleTotal([
    scored('gbp', 0),
    scored('citations', 0),
    scored('onpage', 0),
    scored('reviews', 100),
    scored('geo', 0),
  ]);

  assert.equal(gbpOnly.totalScore, 25);
  assert.equal(reviewsOnly.totalScore, 15);
});

test('an audit where nothing at all could be verified scores zero and says which modules', () => {
  const total = assembleTotal([
    unscorable('gbp'),
    unscorable('citations'),
    unscorable('onpage'),
    unscorable('reviews'),
    unscorable('geo'),
  ]);

  assert.equal(total.totalScore, 0);
  assert.equal(total.modulesNotScored.length, 5);
});

test('modules are ordered as the PRD lists them, whatever order they finished in', () => {
  const ordered = sortModules([scored('geo', 50), scored('gbp', 50), scored('reviews', 50)]);
  assert.deepEqual(
    ordered.map((module) => module.moduleId),
    ['gbp', 'reviews', 'geo'],
  );
});
