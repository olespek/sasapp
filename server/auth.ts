import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

export const MIN_PASSWORD_LENGTH = 8;

/** Enkel begrensning av innloggingsforsøk per IP og brukernavn. */
export class LoginLimiter {
  private attempts = new Map<string, { count: number; first: number }>();
  constructor(
    private max = 10,
    private windowMs = 15 * 60_000,
  ) {}

  blocked(key: string): boolean {
    const a = this.attempts.get(key);
    if (!a) return false;
    if (Date.now() - a.first > this.windowMs) {
      this.attempts.delete(key);
      return false;
    }
    return a.count >= this.max;
  }

  fail(key: string): void {
    const a = this.attempts.get(key);
    if (!a || Date.now() - a.first > this.windowMs) this.attempts.set(key, { count: 1, first: Date.now() });
    else a.count++;
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }
}
