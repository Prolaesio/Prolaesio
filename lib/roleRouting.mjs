export function isRouteWithinPrefix(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function resolveDefaultRoleRoute(role) {
  if (role === 'coach') return '/coach/dashboard';
  if (role === 'guardian') return '/guardian';
  return '/';
}
