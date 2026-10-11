import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { BCRYPT_COST } from './password.constants';

@Injectable()
export class PasswordService {
  /** Computed once so a login for an unknown email costs the same as one for a known email. */
  private readonly dummyHash = bcrypt.hash('not-a-real-password', BCRYPT_COST);

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_COST);
  }

  verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  /** Burns the same time as a real comparison so response timing does not reveal which emails exist. */
  async verifyDummy(plain: string): Promise<void> {
    await bcrypt.compare(plain, await this.dummyHash);
  }
}
