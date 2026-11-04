import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const ROUND = process.env.ROUND ?? '1';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'demo-pass-123';
const OUT_DIR = resolve(`docs/ui/round-${ROUND}`);
const WIDTHS = [360, 768, 1440];

const launchOptions = {
  args: ['--no-sandbox'],
  ...(process.env.CHROMIUM_PATH === undefined
    ? {}
    : { executablePath: process.env.CHROMIUM_PATH }),
};

await mkdir(OUT_DIR, { recursive: true });
const browser = await chromium.launch(launchOptions);

async function shot(page, name, width) {
  await page.evaluate(() => document.fonts.ready);
  const path = resolve(OUT_DIR, `${name}-${width}.png`);
  await page.screenshot({ path, fullPage: true });
  console.log(`captured ${path}`);
}

for (const width of WIDTHS) {
  const context = await browser.newContext({
    viewport: { width, height: width === 360 ? 780 : 900 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
  });
  const page = await context.newPage();

  // Login, including the invalid-credentials error state.
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await shot(page, 'login', width);

  await page.fill('#email', 'agent@example.com');
  await page.fill('#password', 'not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForLoadState('networkidle');
  await shot(page, 'login-error', width);

  await page.fill('#password', PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/tickets', { waitUntil: 'networkidle' });
  await shot(page, 'queue', width);

  await page.goto(`${BASE_URL}/tickets/5`, { waitUntil: 'networkidle' });
  await shot(page, 'ticket-detail', width);

  // Success feedback: resubmitting the current assignee is a no-op that still
  // produces the confirmation flash, so the seeded state does not change.
  await page.locator('form[action$="/assign"] button[type="submit"]').click();
  await page.waitForLoadState('networkidle');
  await shot(page, 'ticket-success', width);

  await page.goto(`${BASE_URL}/tickets/9`, { waitUntil: 'networkidle' });
  await shot(page, 'ticket-resolved', width);
  await page.goto(`${BASE_URL}/tickets/11`, { waitUntil: 'networkidle' });
  await shot(page, 'ticket-closed', width);

  await page.goto(`${BASE_URL}/tickets/new`, { waitUntil: 'networkidle' });
  await shot(page, 'create-ticket', width);

  // Inline validation state: submitting the empty form returns 422.
  await page.getByRole('button', { name: 'Create ticket' }).click();
  await page.waitForLoadState('networkidle');
  await shot(page, 'create-ticket-error', width);

  await page.goto(`${BASE_URL}/tickets?q=no-such-ticket`, {
    waitUntil: 'networkidle',
  });
  await shot(page, 'queue-empty', width);

  await page.goto(`${BASE_URL}/tickets/999999`, { waitUntil: 'networkidle' });
  await shot(page, 'not-found', width);

  // Loading state: hold a filter GET open long enough to capture the disabled
  // button and route-progress bar without creating throwaway tickets.
  await page.goto(`${BASE_URL}/tickets`, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    const toggle = document.getElementById('filters-toggle');
    if (toggle instanceof HTMLInputElement) toggle.checked = true;
  });
  await page.fill('#filter-q', 'loading');
  // Dispatch the submit event without navigating: this runs the real client
  // enhancement (disabled button, progress bar and live status) and leaves
  // the page stable for a screenshot.
  await page.evaluate(() => {
    const form = document.querySelector('form[role="search"]');
    if (form instanceof HTMLFormElement) {
      form.dispatchEvent(
        new SubmitEvent('submit', { bubbles: true, cancelable: true }),
      );
    }
  });
  await page.waitForTimeout(200);
  await shot(page, 'loading', width);

  await context.close();

  // Requester view: the same ticket without agent controls.
  const requesterContext = await browser.newContext({
    viewport: { width, height: width === 360 ? 780 : 900 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
  });
  const requesterPage = await requesterContext.newPage();
  await requesterPage.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await requesterPage.fill('#email', 'requester@example.com');
  await requesterPage.fill('#password', PASSWORD);
  await requesterPage.getByRole('button', { name: 'Sign in' }).click();
  await requesterPage.waitForURL('**/tickets', { waitUntil: 'networkidle' });
  await shot(requesterPage, 'queue-requester', width);
  await requesterPage.goto(`${BASE_URL}/tickets/1`, { waitUntil: 'networkidle' });
  await shot(requesterPage, 'ticket-requester', width);
  await requesterContext.close();
}

await browser.close();
console.log(`\nScreenshots written to ${OUT_DIR}`);
