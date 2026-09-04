import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a precise score for display, e.g. 84.9857 -> "84.99%". Rounding
 * is display-only — pass/fail decisions must always use the raw, unrounded
 * value from the database. */
export function formatScore(percentage: number | null | undefined): string {
  if (percentage === null || percentage === undefined) return '—';
  return `${percentage.toFixed(2)}%`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/** Mask an employee ID for public certificate verification, e.g. "EMP12458" -> "****458". */
export function maskEmployeeId(employeeId: string): string {
  const visible = 3;
  if (employeeId.length <= visible) return '*'.repeat(employeeId.length);
  return '*'.repeat(employeeId.length - visible) + employeeId.slice(-visible);
}

export function clampSeconds(ms: number): number {
  return Math.max(0, Math.floor(ms / 1000));
}

export function formatCountdown(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
