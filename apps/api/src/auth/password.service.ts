import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

@Injectable()
export class PasswordService {
  private readonly options = {
    memoryCost: 19456,
    timeCost: 3,
    parallelism: 1,
  };

  async hashPassword(password: string): Promise<string> {
    if (password.length < 12) throw new Error('Password must be at least 12 characters');
    return argon2.hash(password, this.options);
  }

  async verifyPassword(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(passwordHash, password);
    } catch {
      return false;
    }
  }
}
