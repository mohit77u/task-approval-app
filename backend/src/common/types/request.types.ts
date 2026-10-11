import type { RoleCode } from '../enums/role-code.enum';

/** Identity carried by a verified access token. Display data (name, email) is loaded from the DB when needed. */
export interface AuthUser {
  id: number;
  role: RoleCode;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id?: string;
      user?: AuthUser;
    }
  }
}
