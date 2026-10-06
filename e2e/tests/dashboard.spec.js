// The dashboard in a browser: sign in, add a site from the overview, wait
// for its first visit, read its cards, switch chart and period, delete it.
import { test, expect } from '@playwright/test';
import { password } from '../playwright.config.js';
import { uniqueDomain } from './helpers.js';

test('sign in, add a site, see its first visit and numbers, delete it', async ({ page, request }) => {
  // A wrong password says so and stays; the right one opens the overview.
  await page.goto('/login');
  await page.fill('#password', 'not-it');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Wrong password');
  await expect(page).toHaveURL(/\/login$/);
  await page.fill('#password', password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Websites' })).toBeVisible();

  // Added by its domain alone; a new site waits for its first visit, with
  // its tracking code on screen.
  const domain = uniqueDomain('dashboard');
  await page.getByRole('link', { name: 'Add website' }).first().click();
  await page.fill('#site-domain', domain);
  await page.getByRole('button', { name: 'Add website' }).click();
  await expect(page).toHaveURL(/\/sites\/[0-9a-f]{12}$/);
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

  // The waiting card asks every 5 s; the buffer flushes every 300 ms.
  await expect(page.getByText("You're live")).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'View dashboard' }).click();

  await expect(page.getByTestId('stat-visitors')).toHaveText(/^Visitors\s*1(?!\d)/);
  await expect(page.getByTestId('stat-pageviews')).toHaveText(/^Pageviews\s*3(?!\d)/);
  await expect(page.getByTestId('stat-bounce')).toHaveText(/^Bounce rate\s*0%/);
  await expect(page.getByTestId('panel-pages').locator('li')).toHaveCount(3);
  const countries = page.getByTestId('panel-countries').locator('li');
  await expect(countries).toHaveCount(1);
  await expect(countries).toContainText('Netherlands');
  await expect(countries).toContainText('100%');

  // No time measured yet; then a beacon of 90 s on /pricing fills the tile
  // and the page's Time column.
  const duration = page.getByTestId('stat-duration');
  await expect(duration).toContainText('Visit duration');
  await expect(duration).toContainText('–');
  await expect(duration).toContainText('Not measured in this period');
  const res = await request.post('/api/event', {
    headers: { 'Content-Type': 'text/plain' },
    data: JSON.stringify({ d: domain, u: `https://${domain}/pricing`, e: 90000 }),
  });
  expect(res.status()).toBe(202);
  const siteId = page.url().match(/\/sites\/([0-9a-f]{12})/)[1];
  await expect.poll(async () =>
    (await (await page.request.get(`/api/sites/${siteId}/stats?period=7d`)).json()).totals.visit_duration).toBe(90);
  await page.reload();
  await expect(duration).toContainText('1m 30s');
  const pages = page.getByTestId('panel-pages');
  await expect(pages.locator('li')).toHaveCount(3);
  await expect(pages.locator('li', { hasText: '/pricing' })).toContainText('1m 30s');

  // Each page name links to the page on the site, in a new tab.
  const pricing = pages.locator('li', { hasText: '/pricing' }).getByRole('link');
  await expect(pricing).toHaveAttribute('href', `https://${domain}/pricing`);
  await expect(pricing).toHaveAttribute('target', '_blank');
  await expect(pricing).toHaveAttribute('rel', 'noopener');

  // The Right now card asks on mount and then every 15 s; its first answer
  // can come from just before the flush, so allow one more poll.
  await expect(page.getByTestId('online-now')).toContainText(/1\s*person online/, { timeout: 20_000 });
  await expect(page.getByTestId('online-now')).toContainText('/docs');
  const docs = page.getByTestId('online-now').getByRole('link', { name: '/docs' });
  await expect(docs).toHaveAttribute('href', `https://${domain}/docs`);
  await expect(docs).toHaveAttribute('target', '_blank');
  await expect(docs).toHaveAttribute('rel', 'noopener');

  // The chart's own toggle switches what it plots.
  const chart = page.getByRole('group', { name: 'Chart shows' });
  await chart.getByRole('button', { name: 'Pageviews' }).click();
  await expect(chart.getByRole('button', { name: 'Pageviews' })).toHaveAttribute('aria-pressed', 'true');
  await expect(chart.getByRole('button', { name: 'Visitors' })).toHaveAttribute('aria-pressed', 'false');

  // A longer period holds the same events. Wait for the 30-day report
  // itself: the page keeps the previous one on screen while it loads.
  const thirty = page.waitForResponse((r) => r.url().includes('/stats?period=30d') && r.ok());
  await page.getByRole('group', { name: 'Period' }).getByRole('button', { name: '30 days' }).click();
  await expect(page).toHaveURL(/period=30d/);
  await thirty;
  await expect(page.getByTestId('stat-pageviews')).toHaveText(/^Pageviews\s*3(?!\d)/);

  // Delete it from Settings by typing its domain; back on the overview, it
  // is gone. Other specs' sites may be there, so the list is not asserted
  // empty.
  await page.getByRole('button', { name: 'Site settings' }).click();
  const remove = page.getByRole('button', { name: 'Delete site' });
  await expect(remove).toBeDisabled();
  await page.getByLabel('Type the domain to confirm').fill(domain);
  const listed = page.waitForResponse((r) => r.url().endsWith('/api/sites') && r.request().method() === 'GET' && r.ok());
  await remove.click();
  const sites = await (await listed).json();
  expect(sites.map((s) => s.domain)).not.toContain(domain);
  await expect(page.getByRole('heading', { name: 'Websites' })).toBeVisible();
  await expect(page.getByText(domain)).toHaveCount(0);
});
