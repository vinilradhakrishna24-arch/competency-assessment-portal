import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers';

test.describe('Authentication & route protection', () => {
  test('every admin route redirects to /login when signed out', async ({ page }) => {
    const protectedRoutes = [
      '/dashboard',
      '/candidates',
      '/questions',
      '/questions/import',
      '/create-assessment',
      '/assessments',
      '/certificates',
      '/reports',
      '/users',
      '/audit-log',
      '/settings',
    ];

    for (const route of protectedRoutes) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login\?next=/);
    }
  });

  test('shows a generic error for invalid credentials without revealing which field was wrong', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email address').fill('nonexistent@example.com');
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByRole('alert')).toHaveText(/invalid email or password/i);
    await expect(page).toHaveURL(/\/login/);
  });

  test('a valid Admin/Examiner can sign in and reach the dashboard', async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
  });

  test('after login, visiting /login again redirects away (no point re-authenticating)', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/login');
    // proxy.ts should bounce an already-authenticated session off the
    // public login page — adjust this assertion if that redirect is not
    // implemented, since it documents an expected UX, not a hard security
    // requirement.
    await expect(page).not.toHaveURL(/\/login$/);
  });
});
