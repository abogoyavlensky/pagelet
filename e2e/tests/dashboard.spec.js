// The dashboard in a browser: sign in, add a site, wait for its first
// visit, read its numbers, switch metric and period, delete it.
import { test, expect } from '@playwright/test';
import { password } from '../playwright.config.js';
import { uniqueDomain } from './helpers.js';

test('sign in, add a site, see its first visit and numbers, delete it', async ({ page, request }) => {
  // A wrong password says so and stays; the right one goes in.
  await page.goto('/login');
  await page.fill('#password', 'not-it');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Wrong password');
  await expect(page).toHaveURL(/\/login$/);
  await page.fill('#password', password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login$/);

  // Added by its domain alone; a new site waits for its first visit, with
  // its tracking code on screen.
  const domain = uniqueDomain('dashboard');
  await page.goto('/sites/new');
  await page.fill('#site-domain', domain);
  await page.getByRole('button', { name: 'Add website' }).click();
  await expect(page).toHaveURL(/\/sites\/[0-9a-f]{12}$/);
  const sitePath = new URL(page.url()).pathname;
  const waiting = page.getByTestId('waiting');
  await expect(waiting).toBeVisible();
  await expect(waiting).toContainText('<script defer src=');

  // Three page views from one visitor, posted the way the tracker posts.
  for (const path of ['/', '/pricing', '/docs']) {
    const res = await request.post('/api/event', {
      headers: { 'Content-Type': 'text/plain' },
      data: JSON.stringify({ d: domain, u: `https://${domain}${path}`, r: '', n: 'pageview', z: 'Europe/Amsterdam' }),
    });
    expect(res.status()).toBe(202);
  }

  // The waiting screen asks every 5 s; the buffer flushes every 300 ms.
  await expect(page.getByText("You're live")).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'View dashboard' }).click();

  const headline = page.getByTestId('headline');
  await expect(headline).toHaveText('1 person visited in the last 7 days.');
  await expect(page.getByTestId('metric-pageviews')).toContainText('3');
  await expect(page.getByTestId('stat-bounce')).toContainText('0%');
  const pages = page.getByTestId('panel-pages');
  await expect(pages.locator('li')).toHaveCount(3);
  const countries = page.getByTestId('panel-countries').locator('li');
  await expect(countries).toHaveCount(1);
  await expect(countries).toContainText('Netherlands');
  await expect(countries).toContainText('1');
  await expect(countries).toContainText('100%');
  await expect(page.getByTestId('panel-events')).toHaveCount(0);

  // A list's unit word switches it between visitors and views.
  await pages.getByRole('button', { name: 'Show views' }).click();
  await expect(pages.locator('li').filter({ has: page.getByTitle('/', { exact: true }) })).toContainText('1');
  await expect(pages.getByRole('button', { name: 'Show visitors' })).toBeVisible();

  // The widget asks on mount and then every 15 s; its first answer can come
  // from just before the flush, so allow one more poll.
  const online = page.getByTestId('online-now');
  await expect(online).toHaveText(/^1 online$/, { timeout: 20_000 });
  await online.click();
  await expect(page.getByText('1 person is here now')).toBeVisible();
  await page.keyboard.press('Escape');

  // The numbers above the chart are its switch.
  await page.getByTestId('metric-pageviews').click();
  await expect(page.getByTestId('metric-pageviews')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('metric-visitors')).toHaveAttribute('aria-pressed', 'false');

  // A longer period holds the same events. Wait for the 30-day report
  // itself: the page keeps the previous one on screen while it loads.
  const thirty = page.waitForResponse((r) => r.url().includes('/stats?period=30d') && r.ok());
  await page.getByRole('button', { name: /^Period/ }).click();
  await page.getByRole('menuitem', { name: 'Last 30 days' }).click();
  await expect(page).toHaveURL(/period=30d/);
  await thirty;
  await expect(headline).toHaveText('1 person visited in the last 30 days.');

  // Delete it by typing its domain; the site list no longer has it. Other
  // specs' sites may be there, so the list itself is not asserted empty.
  await page.getByRole('button', { name: 'Site actions' }).click();
  await page.getByRole('menuitem', { name: 'Site settings' }).click();
  const remove = page.getByRole('button', { name: 'Delete site' });
  await expect(remove).toBeDisabled();
  await page.getByLabel('Type the domain to confirm').fill(domain);
  const listed = page.waitForResponse((r) => r.url().endsWith('/api/sites') && r.request().method() === 'GET' && r.ok());
  await remove.click();
  const sites = await (await listed).json();
  expect(sites.map((s) => s.domain)).not.toContain(domain);
  // Away from its dashboard, whatever the query.
  await expect(page).not.toHaveURL(new RegExp(`${sitePath}(\\?|$)`));
});
