import { describe, it, expect } from 'vitest';
import { formatScore, maskEmployeeId, formatDuration, formatCountdown, clampSeconds } from '@/lib/utils';

describe('formatScore', () => {
  it('formats a score to exactly two decimal places', () => {
    expect(formatScore(84.9857)).toBe('84.99%');
    expect(formatScore(100)).toBe('100.00%');
    expect(formatScore(0)).toBe('0.00%');
  });

  it('returns an em dash for null/undefined without throwing', () => {
    expect(formatScore(null)).toBe('—');
    expect(formatScore(undefined)).toBe('—');
  });

  it('is purely a display formatter — it must never itself decide pass/fail', () => {
    // 84.994999...% would round-display as 84.99% (a fail against an 85%
    // pass mark) even though the raw value is what the DB actually scores
    // against. This test exists to document that formatScore performs no
    // rounding-based comparison — pass/fail is decided server-side in
    // fn_finalize_assessment against the unrounded score_percentage.
    const raw = 84.994999;
    expect(formatScore(raw)).toBe('84.99%');
    expect(raw < 85).toBe(true);
  });
});

describe('maskEmployeeId', () => {
  it('keeps only the last 3 characters visible', () => {
    expect(maskEmployeeId('EMP12458')).toBe('*****458');
  });

  it('masks entirely when the id is shorter than the visible window', () => {
    expect(maskEmployeeId('AB')).toBe('**');
  });

  it('never reveals more than 3 trailing characters regardless of length', () => {
    const masked = maskEmployeeId('VERYLONGEMPLOYEEID12345');
    expect(masked.endsWith('345')).toBe(true);
    expect(masked.slice(0, -3)).toMatch(/^\*+$/);
  });
});

describe('formatDuration', () => {
  it('formats sub-hour durations in minutes', () => {
    expect(formatDuration(30)).toBe('30 min');
    expect(formatDuration(45)).toBe('45 min');
  });

  it('formats hour-plus durations with hours and remaining minutes', () => {
    expect(formatDuration(60)).toBe('1 hr');
    expect(formatDuration(90)).toBe('1 hr 30 min');
    expect(formatDuration(125)).toBe('2 hr 5 min');
  });
});

describe('formatCountdown', () => {
  it('formats sub-hour countdowns as mm:ss', () => {
    expect(formatCountdown(65)).toBe('01:05');
    expect(formatCountdown(5)).toBe('00:05');
  });

  it('formats hour-plus countdowns as hh:mm:ss', () => {
    expect(formatCountdown(3661)).toBe('01:01:01');
  });
});

describe('clampSeconds', () => {
  it('never returns a negative value even when ms is negative (exam already ended)', () => {
    expect(clampSeconds(-5000)).toBe(0);
  });

  it('floors partial seconds down', () => {
    expect(clampSeconds(1999)).toBe(1);
  });
});
