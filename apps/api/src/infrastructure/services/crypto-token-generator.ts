import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { TokenGenerator } from '../../application/ports';

@Injectable()
export class CryptoTokenGenerator implements TokenGenerator {
  generate(byteLength = 24): string {
    return randomBytes(byteLength).toString('base64url');
  }
}
