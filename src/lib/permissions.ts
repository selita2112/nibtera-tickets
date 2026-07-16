
import type { Role } from '@prisma/client';

export const PERMISSIONS_GROUPS: Record<string, string[]> = {
  Dashboard: ['Access'],
  'Scan QR': ['Access'],
  Events: ['Create', 'Read', 'Update', 'Delete'],
  Reports: ['Access'],
  'User Management': ['Create', 'Read', 'Update', 'Delete'],
  'Role Management': ['Create', 'Read', 'Update', 'Delete'],
  'Staff Management': ['Access'],
};

export const FLAT_PERMISSIONS: string[] = Object.entries(PERMISSIONS_GROUPS).flatMap(([cat, actions]) =>
  actions.map(a => `${cat}:${a}`)
);

export const VALID_PERMISSIONS_SET = new Set(FLAT_PERMISSIONS);

export function isValidPermission(perm: string): boolean {
  return VALID_PERMISSIONS_SET.has(perm);
}

export function getPermissionsGroups() {
  return PERMISSIONS_GROUPS;
}

// Backward-compatible aliases used elsewhere in the codebase
export const ALLOWED_PERMISSIONS = FLAT_PERMISSIONS;

export function validatePermissions(perms: string[] = []): { valid: boolean; invalid: string[] } {
  if (!Array.isArray(perms)) {
    return { valid: false, invalid: [] };
  }
  const invalidPerms = perms.filter(p => !VALID_PERMISSIONS_SET.has(p));
  return {
    valid: invalidPerms.length === 0,
    invalid: invalidPerms,
  };
}

// Server-side permission check
export function hasPermission(role: Role & { permissions: string[] }, permission: string): boolean {
  if (!role || !permission) {
    return false;
  }
  if (role.name === 'Admin') {
    return true;
  }

  // The 'Read' permission for these categories now maps to 'Access'
  if (permission === 'Dashboard:Read') permission = 'Dashboard:Access';
  if (permission === 'Scan QR:Read') permission = 'Scan QR:Access';
  if (permission === 'Reports:Read') permission = 'Reports:Access';
  if (permission === 'Staff Management:Read') permission = 'Staff Management:Access';

  return role.permissions?.includes(permission);
}
