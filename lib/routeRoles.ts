import { isRouteWithinPrefix, resolveDefaultRoleRoute } from './roleRouting.mjs';

export type AppRole = "player" | "coach" | "guardian";

export const COACH_ROUTE_PREFIX = "/coach";
export const GUARDIAN_ROUTE_PREFIX = "/guardian";

export function isAppRole(value: unknown): value is AppRole {
  return value === "player" || value === "coach" || value === "guardian";
}

export function isCoachRoute(pathname: string): boolean {
  return isRouteWithinPrefix(pathname, COACH_ROUTE_PREFIX);
}

export function isGuardianRoute(pathname: string): boolean {
  return isRouteWithinPrefix(pathname, GUARDIAN_ROUTE_PREFIX);
}

export function getDefaultRouteForRole(role: AppRole): string {
  return resolveDefaultRoleRoute(role);
}
