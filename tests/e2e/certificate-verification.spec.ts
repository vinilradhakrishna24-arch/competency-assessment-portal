import { test, expect } from '@playwright/test';

test.describe('Public certificate verification page', () => {
  test('an unknown/invalid verification code shows "not valid" rather than leaking details', async ({ page }) => {
    await page.goto('/verify/this-code-does-not-exist');
    await expect(page.getByRole('heading', { name: /certificate not valid/i })).toBeVisible();
  });

  test('the verify page never exposes a direct PDF/storage URL in the page source', async ({ page }) => {
    await page.goto('/verify/this-code-does-not-exist');
    const html = await page.content();
    // The spec requires QR codes to point at /verify/{code}, never directly
    // at the private storage bucket/PDF — a signed storage URL should never
    // appear in the verification page's markup.
    expect(html).not.toMatch(/supabase\.co\/storage\/v1\/object\/sign/);
  });

  // To test the "valid certificate" rendering path (masked employee ID,
  // competency, issue date), run the candidate-exam-flow spec first against
  // a competency/pass-mark combination that results in a PASS, capture the
  // certificate's verification_code from the result screen's "Download
  // Certificate" flow, then extend this spec with:
  //
  //   test('a valid certificate shows masked employee ID and never the full ID', ...)
});
