// The tracker on a single-page app: page views on load, on pushState and on
// the back button, and a custom event, all counted once flushed, with the
// country named by the browser's time zone.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { apiLogin, createSite, deleteSite, online, stats, uniqueDomain } from './helpers.js';

test.use({ timezoneId: 'Europe/Amsterdam' });

const spa = readFileSync(new URL('../fixtures/spa.html', import.meta.url), 'utf8');

test('page views and a custom event from a SPA', async ({ page, request }) => {
  await apiLogin(request);
  const domain = uniqueDomain('tracker');
  const site = await createSite(request, 'Tracker', domain);

  // The app's host does not exist: every path answers with the fixture.
  await page.route(`http://${domain}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: spa }));

  await page.goto(`http://${domain}/`);
  await page.click('#about');
  await expect(page).toHaveURL(`http://${domain}/about`);
  await page.click('#pricing');
  await page.click('#signup');
  await page.goBack();
  await expect(page).toHaveURL(`http://${domain}/about`);

  // Four page views (/, /about, /pricing, /about again) from one visitor,
  // and the signup; the buffer flushes every 300 ms.
  await expect.poll(async () => (await stats(request, site.id)).totals.pageviews).toBe(4);
  const s = await stats(request, site.id);
  expect(s.totals.visitors).toBe(1);
  expect(s.pages).toEqual([
    { name: '/about', visitors: 1, pageviews: 2 },
    { name: '/', visitors: 1, pageviews: 1 },
    { name: '/pricing', visitors: 1, pageviews: 1 },
  ]);
  expect(s.events).toEqual([{ name: 'signup', count: 1, visitors: 1 }]);
  expect(s.countries).toEqual([{ name: 'NL', visitors: 1, pageviews: 4 }]);
  expect(await online(request, site.id)).toBe(1);

  await deleteSite(request, site.id);
});
