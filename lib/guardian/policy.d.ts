export interface GuardianAccessRelationship {
  guardianId: string;
  playerId: string;
  status: string;
}
export function isActiveGuardianRelationship(status: string): boolean;
export function isAllowedGuardianPermission(state: string): boolean;
export function canGuardianAccessPlayer(guardianId: string, playerId: string, relationship: GuardianAccessRelationship | null): boolean;
export function canGuardianMutatePlayerSportingData(): false;
