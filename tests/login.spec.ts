import { test, expect } from '@playwright/test';

test.describe('Login Page', () => {
  test('successful login shows success message', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'tomsmith');
    await page.fill('#password', 'SuperSecretPassword!');
    await page.click('button[type="submit"]');

    await expect(page.locator('.flash.success')).toBeVisible();
  });

  test('successful logout after login', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'tomsmith');
    await page.fill('#password', 'SuperSecretPassword!');
    await page.click('button[type="submit"]');
    await page.click("a[href='/logout']");

    await expect(page.locator('.flash.success')).toBeVisible();
  });

  test('invalid credentials shows error message', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'wronguser');
    await page.fill('#password', 'wrongpass');
    await page.click('button[type="submit"]');

    await expect(page.locator('.flash.error')).toBeVisible();
  });

  test('DEMO failing test - wrong selector to trigger screenshot', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('#nonexistent-element')).toBeVisible({ timeout: 3000 });
  });
});
