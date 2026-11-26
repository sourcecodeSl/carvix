import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class InventoryCredentialsService {
  constructor(private readonly config: ConfigService) {}

  encrypt(secret: string): {
    ciphertext: string;
    iv: string;
    tag: string;
    reference: string;
  } {
    const key = this.getEncryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      ciphertext: ciphertext.toString('hex'),
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      reference: 'ENV_INVENTORY_CREDENTIAL_ENCRYPTION_KEY',
    };
  }

  decrypt(ciphertext: string, iv: string, tag: string): string {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.getEncryptionKey(),
      Buffer.from(iv, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'hex')),
      decipher.final(),
    ]).toString('utf8');
  }

  private getEncryptionKey(): Buffer {
    const configured = this.config.get<string>('INVENTORY_CREDENTIAL_ENCRYPTION_KEY');
    if (configured && /^[a-fA-F0-9]{64}$/.test(configured)) {
      return Buffer.from(configured, 'hex');
    }
    throw new Error('A 32-byte inventory credential encryption key is required');
  }
}
