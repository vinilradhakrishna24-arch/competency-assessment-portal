import { randomBytes, createHash, timingSafeEqual } from 'crypto';

/** Generate a cryptographically secure, URL-safe candidate token. The raw
 * token is only ever shown once (in the generated link) and is never
 * persisted — only its SHA-256 hash is stored, so a database leak alone
 * cannot be used to access any exam. */
export function generateCandidateToken(): string {
  return randomBytes(32).toString('base64url'); // 256 bits of entropy
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Constant-time comparison to avoid timing side-channels when comparing a
 * caller-supplied hash against a stored one. Both inputs are fixed-length
 * hex-encoded SHA-256 digests, so a length mismatch alone is safe to
 * short-circuit on (it can only mean "wrong hash", not leak byte content). */
export function safeCompareHashes(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Generate a short, URL-safe verification code for public certificate
 * verification (/verify/{code}) — separate namespace from exam tokens. */
export function generateVerificationCode(): string {
  return randomBytes(9).toString('base64url'); // ~72 bits, compact for QR codes
}
