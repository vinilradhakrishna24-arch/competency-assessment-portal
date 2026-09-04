import { describe, it, expect } from 'vitest';
import { generateCandidateToken, hashToken, safeCompareHashes, generateVerificationCode } from '@/lib/exam/token';

describe('exam token security', () => {
  it('generates URL-safe tokens with high entropy and no collisions across many calls', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const token = generateCandidateToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/); // base64url alphabet only
      expect(token.length).toBeGreaterThanOrEqual(40); // 256 bits ~ 43 base64url chars
      tokens.add(token);
    }
    expect(tokens.size).toBe(1000);
  });

  it('never generates the same token twice in a quick pair (sanity check on randomness source)', () => {
    const a = generateCandidateToken();
    const b = generateCandidateToken();
    expect(a).not.toBe(b);
  });

  it('hashToken is deterministic for the same input', () => {
    const token = 'fixed-example-token-value';
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it('hashToken produces different hashes for different tokens', () => {
    expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
  });

  it('hashToken output looks like a hex-encoded SHA-256 digest', () => {
    const digest = hashToken('anything');
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('safeCompareHashes returns true only for identical hashes', () => {
    const hash = hashToken('candidate-secret');
    expect(safeCompareHashes(hash, hash)).toBe(true);
    expect(safeCompareHashes(hash, hashToken('different-secret'))).toBe(false);
  });

  it('safeCompareHashes rejects mismatched lengths without throwing', () => {
    expect(() => safeCompareHashes('ab', hashToken('x'))).not.toThrow();
    expect(safeCompareHashes('ab', hashToken('x'))).toBe(false);
  });

  it('generateVerificationCode produces a compact, URL-safe code distinct from exam tokens', () => {
    const code = generateVerificationCode();
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(code.length).toBeLessThan(20);
  });
});
