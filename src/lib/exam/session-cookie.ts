import 'server-only';
import { createHmac } from 'crypto';
import { env } from '@/lib/env';

/** Signs a short-lived "employee ID verified" marker for one assessment, so
 * a candidate isn't re-prompted for their Employee ID on every page
 * refresh within the same browser, while still requiring the token to be
 * possessed AND (at least once per session) the identity check to pass.
 * The cookie is HttpOnly + Secure + SameSite=Lax and cannot be forged
 * without the server secret, so it is not a security boundary by itself —
 * every exam API route also re-validates the token hash and assessment
 * status server-side on every call. */

function getSecret(): string {
  return env.EXAM_SESSION_SECRET();
}

export function signVerification(assessmentId: string, tokenHash: string): string {
  const mac = createHmac('sha256', getSecret()).update(`${assessmentId}:${tokenHash}`).digest('hex');
  return mac;
}

export function verifyVerificationCookie(
  cookieValue: string | undefined,
  assessmentId: string,
  tokenHash: string
): boolean {
  if (!cookieValue) return false;
  const expected = signVerification(assessmentId, tokenHash);
  if (expected.length !== cookieValue.length) return false;
  // Not a secret-dependent timing-critical path (cookie itself is HttpOnly),
  // but constant-time comparison costs nothing here.
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ cookieValue.charCodeAt(i);
  }
  return diff === 0;
}

export function verificationCookieName(assessmentId: string): string {
  return `exam_verified_${assessmentId}`;
}
