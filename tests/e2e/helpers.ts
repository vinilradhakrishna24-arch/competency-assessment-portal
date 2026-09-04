import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Shared helpers for the Playwright e2e suite. These tests run against a
 * real instance of the app (local dev server or a deployed environment —
 * see PLAYWRIGHT_BASE_URL in playwright.config.ts) and a real Supabase
 * project, so they need:
 *
 *   TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD — an existing Admin/Examiner
 *   account in that project (see README "Running the test suite").
 *
 * Nothing here talks to Supabase directly — every action goes through the
 * real UI, so these tests exercise the same code paths a real user does.
 */

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. E2E tests need a real Admin/Examiner account — see README "Running the test suite".`
    );
  }
  return value;
}

export async function loginAsAdmin(page: Page): Promise<void> {
  const email = requireEnv('TEST_ADMIN_EMAIL');
  const password = requireEnv('TEST_ADMIN_PASSWORD');

  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15000 });
}

export interface CreateAssessmentOptions {
  competencyCode: 'LOA' | 'SFT' | 'PTW';
  employeeId: string;
  fullName: string;
  numQuestions?: number;
  durationMinutes?: number;
}

/** Drives the real Create Assessment form end to end and returns the
 * generated one-time exam link shown on success. */
export async function createAssessmentViaUI(page: Page, opts: CreateAssessmentOptions): Promise<string> {
  await page.goto('/create-assessment');

  await page.getByRole('button', { name: 'New Candidate' }).click();
  await page.getByLabel('Employee ID').fill(opts.employeeId);
  await page.getByLabel('Full Name').fill(opts.fullName);

  await page.getByRole('button', { name: new RegExp(`^${opts.competencyCode}\\b`) }).click();

  if (opts.numQuestions) {
    await page.getByLabel('Number of Questions').fill(String(opts.numQuestions));
  }
  if (opts.durationMinutes) {
    await page.getByPlaceholder('Custom minutes').fill(String(opts.durationMinutes));
  }

  await page.getByRole('button', { name: /create assessment & generate link/i }).click();
  await expect(page.getByText('Assessment Created')).toBeVisible({ timeout: 15000 });

  const link = await page.locator('code').first().textContent();
  if (!link) throw new Error('Exam link was not rendered after assessment creation');
  return link.trim();
}
