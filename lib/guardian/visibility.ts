import type { GuardianPermissionState, GuardianRelationshipStatus } from './types';
import { isActiveGuardianRelationship, isAllowedGuardianPermission } from './policy.mjs';

export function hasCurrentGuardianAccess(status: GuardianRelationshipStatus): boolean {
  return isActiveGuardianRelationship(status);
}

export function isPermissionAllowed(state: GuardianPermissionState): boolean {
  return isAllowedGuardianPermission(state);
}

export function relationshipLabel(value: string): string {
  if (value === 'legal_guardian') return 'Legal guardian';
  if (value === 'authorised_guardian') return 'Authorised guardian';
  return 'Parent';
}

export function statusLabel(value: string): string {
  return value.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'P';
}
