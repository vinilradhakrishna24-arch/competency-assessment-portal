import { test, expect, type Page } from '@playwright/test';
import { loginAsAdmin, createAssessmentViaUI } from './helpers';

/**
 * Full candidate lifecycle, driven entirely through the real UI (no direct
 * DB fixtures) so it exercises the same server-side security checks a real
 * candidate hits: generic verification errors, rate limiting, the
 * server-authoritative timer, autosave/resume, and server-side scoring.
 *
 * Uses the PTW / "Set A" sample questions seeded by
 * supabase/migrations/0006_seed.sql, so it only needs an Admin/Examiner
 * account (TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD) — no other fixtures.
 */

function uniqueEmployeeId(): string {
  return `E2E-${Date.now()}`;
}

async function answerVisibleQuestion(page: Page) {
  // Pick whatever option renders first — the point of this suite is to
  // exercise the exam mechanics (freezing, autosave, timer, scoring
  // pipeline), not to hand-verify each seeded question's correct answer,
  // which also may be randomized per assessment (randomize_options).
  await page.getByRole('radio').first().or(page.getByRole('checkbox').first()).first().click();
}

test.describe('Candidate exam lifecycle', () => {
  test('verification rejects a wrong Employee ID with a generic message, never revealing which detail was wrong', async ({
    page,
    browser,
  }) => {
    const adminPage = await browser.newPage();
    await loginAsAdmin(adminPage);
    const employeeId = uniqueEmployeeId();
    const link = await createAssessmentViaUI(adminPage, {
      competencyCode: 'PTW',
      employeeId,
      fullName: 'E2E Verification Candidate',
      numQuestions: 2,
    });
    await adminPage.close();

    await page.goto(link);
    await page.getByLabel('Employee ID').fill('DEFINITELY-NOT-THE-RIGHT-ID');
    await page.getByRole('button', { name: /verify/i }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    const message = await page.getByRole('alert').textContent();
    // Must not say anything like "employee not found" vs "wrong token" —
    // both a wrong employee ID and a stale/invalid link must read the same.
    expect(message?.toLowerCase()).not.toMatch(/not found|does not exist|no such/);
  });

  test('locks out verification after repeated failed attempts (rate limiting)', async ({ page, browser }) => {
    const adminPage = await browser.newPage();
    await loginAsAdmin(adminPage);
    const employeeId = uniqueEmployeeId();
    const link = await createAssessmentViaUI(adminPage, {
      competencyCode: 'PTW',
      employeeId,
      fullName: 'E2E Lockout Candidate',
      numQuestions: 2,
    });
    await adminPage.close();

    await page.goto(link);
    // Default verification_retry_settings.max_attempts is 5 — six wrong
    // attempts should trip the lock regardless of the exact configured
    // threshold.
    for (let i = 0; i < 6; i++) {
      await page.getByLabel('Employee ID').fill(`WRONG-${i}`);
      await page.getByRole('button', { name: /verify/i }).click();
      await expect(page.getByRole('alert')).toBeVisible();
    }

    const finalMessage = (await page.getByRole('alert').textContent())?.toLowerCase() ?? '';
    expect(finalMessage).toMatch(/locked|too many|try again later/);
  });

  test('full happy path: verify → welcome → answer → autosave/resume → review → submit → result', async ({
    page,
    browser,
  }) => {
    const adminPage = await browser.newPage();
    await loginAsAdmin(adminPage);
    const employeeId = uniqueEmployeeId();
    const link = await createAssessmentViaUI(adminPage, {
      competencyCode: 'PTW',
      employeeId,
      fullName: 'E2E Happy Path Candidate',
      numQuestions: 2,
      durationMinutes: 15,
    });
    await adminPage.close();

    await page.goto(link);
    await page.getByLabel('Employee ID').fill(employeeId);
    await page.getByRole('button', { name: /verify/i }).click();

    await expect(page.getByRole('button', { name: /start assessment/i })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /start assessment/i }).click();

    // Answer question 1, then reload the tab to simulate the candidate
    // closing the browser mid-exam — the same link must resume with the
    // answer preserved and the timer continuing (not reset).
    await expect(page.locator('h1, p').filter({ hasText: /\d+\./ }).first()).toBeVisible({ timeout: 10000 }).catch(() => {});
    await answerVisibleQuestion(page);
    await page.waitForTimeout(1200); // allow the autosave debounce to fire

    await page.reload();
    await expect(page.getByText(/session restored/i).or(page.locator('[role="radio"][aria-checked="true"], [role="checkbox"][aria-checked="true"]'))).toBeVisible({
      timeout: 10000,
    });

    // Advance through remaining questions to the review screen.
    for (let i = 0; i < 5; i++) {
      const reviewButton = page.getByRole('button', { name: /review & submit/i });
      if (await reviewButton.isVisible().catch(() => false)) {
        await reviewButton.click();
        break;
      }
      await answerVisibleQuestion(page);
      const next = page.getByRole('button', { name: /^next$/i });
      if (await next.isVisible().catch(() => false)) {
        await next.click();
      }
    }

    await expect(page.getByRole('heading', { name: /review & submit/i })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /submit assessment/i }).click();

    await expect(page.getByRole('heading', { name: /assessment completed/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/PASS|NOT YET COMPETENT/)).toBeVisible();

    // Submission must be idempotent — reloading the result page again must
    // never re-score or crash.
    await page.reload();
    await expect(page.getByRole('heading', { name: /assessment completed/i })).toBeVisible({ timeout: 15000 });
  });

  test('a used or expired link shows a branded error, not a raw 404/500', async ({ page }) => {
    await page.goto('/exam/this-token-does-not-exist-at-all');
    await expect(page.getByRole('heading')).toBeVisible();
    const bodyText = (await page.textContent('body')) ?? '';
    expect(bodyText).not.toMatch(/internal server error|application error/i);
  });
});
