export function isActiveGuardianRelationship(status) {
  return status === 'active' || status === 'adult_authorised';
}

export function isAllowedGuardianPermission(state) {
  return state === 'allowed' || state === 'required';
}

export function canGuardianAccessPlayer(guardianId, playerId, relationship) {
  return Boolean(
    relationship
    && relationship.guardianId === guardianId
    && relationship.playerId === playerId
    && isActiveGuardianRelationship(relationship.status),
  );
}

export function canGuardianMutatePlayerSportingData() {
  return false;
}
