export type AppRole = "player" | "coach";

export const COACH_ROUTE_PREFIX = "/coach";

export function isCoachRoute(pathname: string): boolean {
  return pathname === COACH_ROUTE_PREFIX || pathname.startsWith(`${COACH_ROUTE_PREFIX}/`);
}

export function getDefaultRouteForRole(role: AppRole): string {
  return role === "coach" ? "/coach/dashboard" : "/";
}
