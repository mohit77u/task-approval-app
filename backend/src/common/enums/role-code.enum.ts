/**
 * Codes of the system roles stored in the `roles` table. Roles are data, but what a role may do is decided in code
 * (guards and the task state machine key off these codes), so adding a role row alone grants no permissions.
 */
export const RoleCode = {
  ADMIN: 'ADMIN',
  EMPLOYEE: 'EMPLOYEE',
} as const;

export type RoleCode = (typeof RoleCode)[keyof typeof RoleCode];

export const ROLE_CODES: readonly RoleCode[] = Object.values(RoleCode);

export function isRoleCode(value: string): value is RoleCode {
  return (ROLE_CODES as readonly string[]).includes(value);
}
