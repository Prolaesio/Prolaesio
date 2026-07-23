import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canGuardianAccessPlayer,
  canGuardianMutatePlayerSportingData,
  isActiveGuardianRelationship,
  isAllowedGuardianPermission,
} from '../lib/guardian/policy.mjs';
import { isRouteWithinPrefix, resolveDefaultRoleRoute } from '../lib/roleRouting.mjs';

test('account roles route to their existing protected application areas', () => {
  assert.equal(resolveDefaultRoleRoute('player'), '/');
  assert.equal(resolveDefaultRoleRoute('coach'), '/coach/dashboard');
  assert.equal(resolveDefaultRoleRoute('guardian'), '/guardian');
  assert.equal(isRouteWithinPrefix('/guardian/children/player-a', '/guardian'), true);
  assert.equal(isRouteWithinPrefix('/coach/dashboard', '/guardian'), false);
});

test('only active relationships grant current player access', () => {
  assert.equal(isActiveGuardianRelationship('active'), true);
  assert.equal(isActiveGuardianRelationship('adult_authorised'), true);
  for (const status of ['pending', 'suspended', 'support_review', 'revoked', 'removed']) {
    assert.equal(isActiveGuardianRelationship(status), false);
  }
});

test('manipulated player and guardian IDs do not pass relationship authorization', () => {
  const relationship = { guardianId: 'guardian-a', playerId: 'player-a', status: 'active' };
  assert.equal(canGuardianAccessPlayer('guardian-a', 'player-a', relationship), true);
  assert.equal(canGuardianAccessPlayer('guardian-a', 'player-b', relationship), false);
  assert.equal(canGuardianAccessPlayer('guardian-b', 'player-a', relationship), false);
});

test('revoked relationship blocks access', () => {
  assert.equal(canGuardianAccessPlayer('guardian-a', 'player-a', {
    guardianId: 'guardian-a', playerId: 'player-a', status: 'revoked',
  }), false);
});

test('only allowed and platform-required permissions expose data', () => {
  assert.equal(isAllowedGuardianPermission('allowed'), true);
  assert.equal(isAllowedGuardianPermission('required'), true);
  for (const state of ['not_allowed', 'pending', 'revoked']) assert.equal(isAllowedGuardianPermission(state), false);
});

test('Guardian sporting data is always read-only', () => {
  assert.equal(canGuardianMutatePlayerSportingData(), false);
});
