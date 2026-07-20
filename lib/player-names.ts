export const PLAYER_DISPLAY_NAME_MAX_LENGTH = 80;

export interface PlayerNameFields {
  displayName?: string | null;
  fullName?: string | null;
  name?: string | null;
  username?: string | null;
  email?: string | null;
  userId?: string | null;
  fallbackLabel?: string;
}

export function normalizePlayerDisplayName(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getPlayerDisplayNameValidationError(
  value: string,
  options: { required?: boolean } = {}
): string | null {
  const trimmed = value.trim();

  if (options.required && trimmed.length === 0) {
    return 'Display name is required.';
  }

  if (trimmed.length > PLAYER_DISPLAY_NAME_MAX_LENGTH) {
    return `Display name must be ${PLAYER_DISPLAY_NAME_MAX_LENGTH} characters or less.`;
  }

  return null;
}

export function resolveEmailPrefix(email: string | null | undefined): string | null {
  const trimmedEmail = normalizePlayerDisplayName(email);
  if (!trimmedEmail) return null;

  const prefix = trimmedEmail.split('@')[0]?.trim();
  return prefix ? prefix : null;
}

export function resolvePlayerDisplayName(fields: PlayerNameFields): string {
  const profileName =
    normalizePlayerDisplayName(fields.displayName) ??
    normalizePlayerDisplayName(fields.fullName) ??
    normalizePlayerDisplayName(fields.name) ??
    normalizePlayerDisplayName(fields.username);

  if (profileName) return profileName;

  const emailPrefix = resolveEmailPrefix(fields.email);
  if (emailPrefix) return emailPrefix;

  if (fields.userId) {
    return `Player ${fields.userId.slice(0, 8)}`;
  }

  return fields.fallbackLabel ?? 'Player';
}
