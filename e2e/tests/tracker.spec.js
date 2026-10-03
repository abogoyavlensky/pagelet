// The tracker on a single-page app: page views on load, on pushState and on
// the back button, and a custom event, all counted once flushed, with the
// country named by the browser's time zone.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { apiLogin, createSite, deleteSite, online, stats, uniqueDomain } from './helpers.js';

test.use({ timezoneId: 'Europe/Amsterdam' });

const spa = readFileSync(new URL('../fixtures/spa.html', import.meta.url), 'utf8');

test('page views and a custom event from a SPA', async ({ page, request, baseURL }) => {
  await apiLogin(request);
  const domain = uniqueDomain('tracker');
  const site = await createSite(request, 'Tracker', domain);

  // The app's host does not exist: every path answers with the fixture,
  // its tracker pointed at the server under test (E2E_PORT may move it).
  const body = spa.replaceAll('http://127.0.0.1:8099', baseURL);
  await page.route(`http://${domain}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body }));

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
  expect(s.pages.map(({ name, visitors, pageviews }) => ({ name, visitors, pageviews }))).toEqual([
    { name: '/about', visitors: 1, pageviews: 2 },
    { name: '/', visitors: 1, pageviews: 1 },
    { name: '/pricing', visitors: 1, pageviews: 1 },
  ]);
  expect(s.events).toEqual([{ name: 'signup', count: 1, visitors: 1 }]);
  expect(s.countries).toEqual([{ name: 'NL', visitors: 1, pageviews: 4 }]);
  expect(await online(request, site.id)).toBe(1);

  await deleteSite(request, site.id);
});

test('time on page', async ({ page, request, baseURL }) => {
  await apiLogin(request);
  const domain = uniqueDomain('engaged');
  const site = await createSite(request, 'Engaged', domain);
  await page.route(`http://${domain}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: spa.replaceAll('http://127.0.0.1:8099', baseURL) }));

  // About a second on /, then a client-side navigation closes it; leaving
  // for another site closes /about with the pagehide beacon. (Chromium
  // aborts that beacon on a navigation to about:blank, so the test leaves
  // for a real page, as a visitor would.)
  await page.route('http://elsewhere.test/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<p>Elsewhere</p>' }));
  await page.goto(`http://${domain}/`);
  await page.waitForTimeout(1200);
  await page.click('#about');
  await expect(page).toHaveURL(`http://${domain}/about`);
  await page.waitForTimeout(300);
  await page.goto('http://elsewhere.test/');

  const time = async (path) =>
    (await stats(request, site.id)).pages.find((p) => p.name === path)?.time ?? null;
  await expect.poll(() => time('/')).toBeGreaterThanOrEqual(1);
  expect((await stats(request, site.id)).totals.visit_duration).toBeGreaterThanOrEqual(1);
  await expect.poll(() => time('/about')).not.toBeNull();
  // Engagement is no event and no page view.
  const s = await stats(request, site.id);
  expect(s.totals.pageviews).toBe(2);
  expect(s.events).toEqual([]);

  await deleteSite(request, site.id);
});

test('a failing tracker never breaks navigation', async ({ page, request, baseURL }) => {
  await apiLogin(request);
  const domain = uniqueDomain('broken');
  const site = await createSite(request, 'Broken', domain);
  await page.route(`http://${domain}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: spa.replaceAll('http://127.0.0.1:8099', baseURL) }));
  // Every way the tracker sends throws.
  await page.addInitScript(() => {
    navigator.sendBeacon = () => { throw new Error('no beacons'); };
    window.fetch = () => { throw new Error('no fetch'); };
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e));

  await page.goto(`http://${domain}/`);
  await page.click('#about');
  await expect(page).toHaveURL(`http://${domain}/about`);
  await page.click('#signup');
  await page.goBack();
  await expect(page).toHaveURL(`http://${domain}/`);
  expect(errors).toEqual([]);

  await deleteSite(request, site.id);
});

// The owner's flag. The order of loads makes the negative check sound: had
// the ignored load sent anything, it left the page before the reload that
// sends /pricing, and the server flushes in arrival order, so the signup or
// a second /about view would be in the stats by the time /pricing is.
test('a browser with pagelet_ignore set is not counted', async ({ page, request, baseURL }) => {
  await apiLogin(request);
  const domain = uniqueDomain('ignored');
  const site = await createSite(request, 'Ignored', domain);
  await page.route(`http://${domain}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: spa.replaceAll('http://127.0.0.1:8099', baseURL) }));

  // Counted: one page view proves the pipeline before anything is ignored.
  await page.goto(`http://${domain}/`);
  await expect.poll(async () => (await stats(request, site.id)).totals.pageviews).toBe(1);

  // Ignored: from the next load on, nothing is sent.
  await page.evaluate(() => localStorage.setItem('pagelet_ignore', 'true'));
  await page.reload();
  await page.click('#about');
  await expect(page).toHaveURL(`http://${domain}/about`);
  await page.click('#signup');

  // Counted again once the flag is gone.
  await page.evaluate(() => localStorage.removeItem('pagelet_ignore'));
  await page.reload();
  await page.click('#pricing');
  await expect(page).toHaveURL(`http://${domain}/pricing`);

  await expect.poll(async () => (await stats(request, site.id)).totals.pageviews).toBe(3);
  const s = await stats(request, site.id);
  expect(s.pages.map(({ name, pageviews }) => ({ name, pageviews }))).toEqual([
    { name: '/', pageviews: 1 },
    { name: '/about', pageviews: 1 },
    { name: '/pricing', pageviews: 1 },
  ]);
  expect(s.events).toEqual([]);
  expect(s.totals.visitors).toBe(1);

  await deleteSite(request, site.id);
});

test('blocked storage does not stop the tracker', async ({ page, request, baseURL }) => {
  await apiLogin(request);
  const domain = uniqueDomain('nostorage');
  const site = await createSite(request, 'No storage', domain);
  await page.route(`http://${domain}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: spa.replaceAll('http://127.0.0.1:8099', baseURL) }));
  // Reading localStorage throws, as with storage blocked.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e));

  await page.goto(`http://${domain}/`);
  await page.click('#about');
  await expect(page).toHaveURL(`http://${domain}/about`);

  await expect.poll(async () => (await stats(request, site.id)).totals.pageviews).toBe(2);
  expect(errors).toEqual([]);

  await deleteSite(request, site.id);
});
