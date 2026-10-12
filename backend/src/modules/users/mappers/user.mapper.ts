import { User } from '../entities/user.entity';

export interface UserSummary {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  /** Seeded demo account: the UI hides Delete for these and the API refuses it. */
  isDefault: boolean;
  role: { id: number; code: string; name: string };
}

/** The only shape in which users leave the API. It deliberately omits the password hash. */
export function toUserSummary(user: User): UserSummary {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    isDefault: user.isDefault,
    role: { id: user.role.id, code: user.role.code, name: user.role.name },
  };
}
