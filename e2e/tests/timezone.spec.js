// Reports in the viewer's time zone: a browser in Tokyo asks for its own
// zone, and the server cuts today at Tokyo's midnight and labels the hourly
// chart in Tokyo hours.
import { test, expect } from '@playwright/test';
import { apiLogin, createSite, deleteSite, signIn, stats, uniqueDomain } from './helpers.js';

test.use({ timezoneId: 'Asia/Tokyo' });

const tokyoDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
const tokyoHour = () =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', hour12: false }).format(new Date());

test('a browser in Tokyo sees today in Tokyo time', async ({ page, request }) => {
  await apiLogin(request);
  const domain = uniqueDomain('timezone');
  const site = await createSite(request, domain, domain);

  // One page view now. The buffer flushes every 300 ms.
  const hourBefore = tokyoHour();
  const res = await request.post('/api/event', {
    headers: { 'Content-Type': 'text/plain' },
    data: JSON.stringify({ d: domain, u: `https://${domain}/`, r: '', n: 'pageview' }),
  });
  expect(res.status()).toBe(202);
  await expect.poll(async () => (await stats(request, site.id)).totals.pageviews).toBe(1);

  // Signed in, the overview's cards ask for 7 days; the site page asks for today.
  await signIn(page);
  const report = page.waitForResponse((r) => r.url().includes('/stats?period=today') && r.url().includes('tz=Asia%2FTokyo') && r.ok());
  await page.goto(`/sites/${site.id}?period=today`);
  const body = await (await report).json();
  const hourAfter = tokyoHour();

  expect(body.period.tz).toBe('Asia/Tokyo');
  expect(body.period.from).toBe(`${tokyoDay()}T00:00:00`);
  expect(body.timeseries).toHaveLength(24);
  // The view sits in Tokyo's current hour; either side of an hour boundary
  // crossed while the test ran.
  const hit = body.timeseries.filter((b) => b.pageviews > 0);
  expect(hit).toHaveLength(1);
  expect([hourBefore, hourAfter]).toContain(hit[0].t.slice(11, 13));
  await expect(page.getByTestId('stat-pageviews')).toHaveText(/^Pageviews\s*1(?!\d)/);

  // The custom range says which days it means.
  await page.getByRole('button', { name: 'Custom range' }).click();
  await expect(page.getByText('Days are in Asia/Tokyo time.')).toBeVisible();

  await deleteSite(request, site.id);
});
