import { test, expect } from '@playwright/test';
import { loginAsAdmin, requireEnv } from './helpers';

/**
 * Requires an additional Viewer/Management test account:
 *   TEST_VIEWER_EMAIL / TEST_VIEWER_PASSWORD
 * Create one from the Admin account's Users & Roles page, or via the
 * createUser server action, before running this spec.
 */

test.describe('Role-based access control', () => {
  test('Admin/Examiner sees write actions on the Question Bank', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/questions');
    await expect(page.getByRole('button', { name: 'Add Question' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bulk Import' })).toBeVisible();
  });

  test('Admin/Examiner can reach admin-only pages (Users, Audit Log, Settings)', async ({ page }) => {
    await loginAsAdmin(page);
    for (const route of ['/users', '/audit-log', '/settings']) {
      await page.goto(route);
      await expect(page).toHaveURL(new RegExp(route.replace('/', '\\/')));
    }
  });

  test('Viewer/Management cannot reach admin-only pages and is bounced to the dashboard', async ({ page }) => {
    const email = requireEnv('TEST_VIEWER_EMAIL');
    const password = requireEnv('TEST_VIEWER_PASSWORD');

    await page.goto('/login');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });

    for (const route of ['/create-assessment', '/questions', '/users', '/audit-log', '/settings']) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/dashboard/);
    }
  });

  test('Viewer/Management can still view read-only pages (Assessments, Reports, Certificates)', async ({ page }) => {
    const email = requireEnv('TEST_VIEWER_EMAIL');
    const password = requireEnv('TEST_VIEWER_PASSWORD');

    await page.goto('/login');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });

    await page.goto('/assessments');
    await expect(page).toHaveURL(/\/assessments/);
    // Viewers must never see the "Create Assessment" call to action.
    await expect(page.getByRole('link', { name: /create assessment/i })).toHaveCount(0);
  });
});
