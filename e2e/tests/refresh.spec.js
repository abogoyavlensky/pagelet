// An open dashboard keeps itself current: the Refresh button asks at once,
// a visible page asks again every minute and as soon as it is shown again,
// a failed refresh says so and heals on the next one, and the overview's
// cards follow too. The page's clock is Playwright's, so a minute passes
// on demand; the flush (300 ms) runs on real time, so each event is waited
// for through the API before the page is asked to see it.
import { test, expect } from '@playwright/test';
import { apiLogin, createSite, deleteSite, signIn, stats, uniqueDomain } from './helpers.js';

const MINUTE = 60_000;

test('the dashboard refreshes by button, by the minute and on return', async ({ page, request }) => {
  await apiLogin(request);
  const domain = uniqueDomain('refresh');
  const site = await createSite(request, domain, domain);

  // One more page view; the second visitor's agent differs, so it counts as
  // another visitor. Resolves once the stats include it.
  let sent = 0;
  const visit = async (path, userAgent) => {
    const res = await request.post('/api/event', {
      headers: { 'Content-Type': 'text/plain', ...(userAgent && { 'User-Agent': userAgent }) },
      data: JSON.stringify({ d: domain, u: `https://${domain}${path}`, r: '', n: 'pageview' }),
    });
    expect(res.status()).toBe(202);
    sent += 1;
    await expect.poll(async () => (await stats(request, site.id, '7d')).totals.pageviews).toBe(sent);
  };
  const pageviews = (n) => expect(page.getByTestId('stat-pageviews')).toHaveText(new RegExp(`^Pageviews\\s*${n}(?!\\d)`));

  // A tab that shows or hides itself: the app reads document.hidden.
  const setHidden = (hidden) => page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);

  await visit('/');
  await page.clock.install();
  await signIn(page);
  await page.goto(`/sites/${site.id}`);
  await pageviews(1);

  // The button asks at once.
  await visit('/pricing');
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await pageviews(2);

  // A minute later the page asks by itself.
  await visit('/docs');
  await pageviews(2);
  await page.clock.fastForward(MINUTE);
  await pageviews(3);

  // Hidden, it does not ask; shown again, it asks at once.
  await setHidden(true);
  await visit('/about');
  await page.clock.fastForward(MINUTE);
  await pageviews(3);
  await setHidden(false);
  await pageviews(4);

  // A refresh that fails says so and keeps the numbers; the next heals it.
  const stalled = '**/api/sites/*/stats?**';
  await page.route(stalled, (route) => route.abort());
  await page.clock.fastForward(MINUTE);
  await expect(page.getByRole('alert')).toContainText('Could not load this period');
  await pageviews(4);
  await page.unroute(stalled);
  await page.clock.fastForward(MINUTE);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await pageviews(4);

  // The overview's card follows the minute too.
  await page.goto('/');
  const card = page.getByRole('link').filter({ hasText: domain });
  const visitors = card.getByText(/^\d[\d,]*$/);
  await expect(visitors).toHaveText('1');
  await visit('/', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15');
  await page.clock.fastForward(MINUTE);
  await expect(visitors).toHaveText('2');

  await deleteSite(request, site.id);
});
