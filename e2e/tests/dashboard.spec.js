// The dashboard in a browser: sign in, add a site, watch its numbers
// arrive, switch periods, delete it.
import { test, expect } from '@playwright/test';
import { password } from '../playwright.config.js';
import { uniqueDomain } from './helpers.js';

test('sign in, add a site, see its numbers, delete it', async ({ page, request }) => {
  // A wrong password says so and stays; the right one lands on the sites.
  await page.goto('/login');
  await page.fill('#password', 'not-it');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Wrong password');
  await expect(page).toHaveURL(/\/login$/);
  await page.fill('#password', password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/sites$/);

  const domain = uniqueDomain('dashboard');
  await page.getByRole('button', { name: 'Add site' }).click();
  await page.fill('#site-name', 'Dashboard test');
  await page.fill('#site-domain', domain);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('link', { name: new RegExp(domain.replaceAll('.', '\\.')) }).click();
  await expect(page).toHaveURL(/\/sites\/[0-9a-f]{12}$/);

  // Nothing yet: zeros and an empty state in every panel.
  const visitors = page.getByRole('button', { name: /^Visitors/ });
  const pageviews = page.getByRole('button', { name: /^Pageviews/ });
  await expect(visitors).toHaveText(/Visitors\s*0$/);
  await expect(pageviews).toHaveText(/Pageviews\s*0$/);
  await expect(page.getByText('No data for this period')).toHaveCount(6);

  // Three page views from one visitor, posted the way the tracker posts.
  for (const path of ['/', '/pricing', '/docs']) {
    const res = await request.post('/api/event', {
      headers: { 'Content-Type': 'text/plain' },
      data: JSON.stringify({ d: domain, u: `https://${domain}${path}`, r: '', n: 'pageview' }),
    });
    expect(res.status()).toBe(202);
  }

  // The buffer flushes every 300 ms; reload until the numbers are in.
  await expect(async () => {
    await page.reload();
    await expect(pageviews).toHaveText(/Pageviews\s*3$/, { timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await expect(visitors).toHaveText(/Visitors\s*1$/);
  await expect(page.getByTestId('panel-pages').locator('li')).toHaveCount(3);
  // The widget asks on mount and then every 15 s; its first answer can come
  // from just before the flush, so allow one more poll.
  await expect(page.getByTestId('online-now')).toHaveText(/^1 online now$/, { timeout: 20_000 });

  // A longer period holds the same events.
  await page.getByRole('button', { name: '30 days' }).click();
  await expect(page).toHaveURL(/period=30d/);
  await expect(visitors).toHaveText(/Visitors\s*1$/);
  await expect(pageviews).toHaveText(/Pageviews\s*3$/);

  // Delete it by typing its domain; its row leaves the list. Other specs'
  // sites may be there, so the list itself is not asserted empty.
  await page.getByRole('button', { name: 'Settings' }).click();
  const remove = page.getByRole('button', { name: 'Delete site' });
  await expect(remove).toBeDisabled();
  await page.getByLabel('Type the domain to confirm').fill(domain);
  await remove.click();
  await expect(page).toHaveURL(/\/sites$/);
  await expect(page.getByRole('heading', { name: 'Sites', exact: true })).toBeVisible();
  await expect(page.getByText(domain)).toHaveCount(0);
});
