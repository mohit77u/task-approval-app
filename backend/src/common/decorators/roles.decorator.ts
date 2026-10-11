import { SetMetadata } from '@nestjs/common';
import { RoleCode } from '../enums/role-code.enum';

export const ROLES_KEY = 'roles';

/** Restricts a route to the given role codes. Enforced by the global RolesGuard. */
export const Roles = (...roles: RoleCode[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
